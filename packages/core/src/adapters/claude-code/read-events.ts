// Internal: turns a Claude Code log into timeline events. Every user/assistant line is redacted
// as soon as it is parsed, so no unmasked text reaches an event. parse() (with stats) wraps this.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { HIDDEN_FILE, isSensitiveFile, redactDeep } from "../../redact.js";
import type { ReplayEvent, TokenUsage } from "../../types.js";
import { diffOf } from "./diff.js";
import {
  type AssistantLine,
  agentResultSchema,
  assistantLineSchema,
  type ContentBlock,
  type UserLine,
  userLineSchema,
} from "./schema.js";
import { parseJson, promptText, timestampOf, toTitle } from "./text.js";
import { mergeTokens, replyId, shortCacheWritesOf, tokensOf } from "./tokens.js";
import {
  KINDS_WITH_OUTPUT,
  relativeFile,
  resultText,
  TOOL_TO_KIND,
  toolText,
  toolTitle,
} from "./tools.js";

export interface EventsRead {
  events: ReplayEvent[];
  /** Broken JSON, or user/assistant lines that fail their schema. Unknown line types are not counted. */
  skippedLines: number;
  /** Epoch ms of the first timestamped line; every event's `t` counts from here. */
  origin: number | undefined;
  /** Counted once per API reply, keyed by model id. */
  tokensByModel: Record<string, TokenUsage>;
  /** Cache writes per model that used the cheaper 5-minute lifetime (for cost estimates). */
  shortCacheWritesByModel: Record<string, number>;
  /** Subagent event id → the subagent's agentId, which names its own log file. */
  subagentIds: Record<string, string>;
  /** Distinct secrets hidden (a secret repeated across fields counts once). */
  redactions: number;
}

interface ReadState extends EventsRead {
  /** Masks seen so far; their count is `redactions`. */
  masks: Set<string>;
  /** Replies already added to tokensByModel; their later lines must not count again. */
  countedReplies: Set<string>;
  /** Replies whose tokens already sit on an event; only a reply's first event carries them. */
  attachedReplies: Set<string>;
  /** Tool calls waiting for their result, by tool_use id. */
  pendingTools: Map<string, ReplayEvent>;
}

const UNKNOWN_MODEL = "unknown";

function countReplyTokens(state: ReadState, line: AssistantLine): void {
  const tokens = tokensOf(line);
  if (tokens === undefined || state.countedReplies.has(replyId(line))) return;
  state.countedReplies.add(replyId(line));
  const model = line.message.model ?? UNKNOWN_MODEL;
  mergeTokens(state.tokensByModel, { [model]: tokens });
  state.shortCacheWritesByModel[model] =
    (state.shortCacheWritesByModel[model] ?? 0) + shortCacheWritesOf(line);
}

/** Adds model and (for the reply's first event only) tokens, then records the event. */
function pushReplyEvent(state: ReadState, line: AssistantLine, event: ReplayEvent): void {
  if (line.message.model !== undefined) event.model = line.message.model;
  const tokens = tokensOf(line);
  if (tokens !== undefined && !state.attachedReplies.has(replyId(line))) {
    state.attachedReplies.add(replyId(line));
    event.tokens = tokens;
  }
  state.events.push(event);
}

function elapsed(state: ReadState, timestamp: string): number {
  return Date.parse(timestamp) - (state.origin ?? Date.parse(timestamp));
}

function readToolCall(state: ReadState, line: AssistantLine, block: ContentBlock): void {
  const kind = block.name === undefined ? undefined : TOOL_TO_KIND[block.name];
  if (kind === undefined || block.name === undefined || block.id === undefined) return;
  const input = block.input ?? {};
  const file = relativeFile(input, line.cwd);
  const event: ReplayEvent = {
    id: block.id,
    kind,
    t: elapsed(state, line.timestamp),
    title: toTitle(toolTitle(block.name, input, file)),
  };
  if (file !== undefined) event.file = file;
  const text = toolText(block.name, input);
  if (text !== undefined) event.text = text;
  state.pendingTools.set(block.id, event);
  pushReplyEvent(state, line, event);
}

function readReplyText(state: ReadState, line: AssistantLine, block: ContentBlock): void {
  const text = block.text?.trim() ?? "";
  if (text === "") return;
  const event: ReplayEvent = {
    id: line.uuid,
    kind: "assistant",
    t: elapsed(state, line.timestamp),
    title: toTitle(text),
    text,
  };
  pushReplyEvent(state, line, event);
}

function readAssistant(state: ReadState, line: AssistantLine): void {
  countReplyTokens(state, line);
  for (const block of line.message.content) {
    if (block.type === "text") readReplyText(state, line, block);
    if (block.type === "tool_use") readToolCall(state, line, block);
  }
}

/** A failed tool call becomes its own error event; a successful one keeps its output if useful. */
function readToolResult(state: ReadState, line: UserLine, block: ContentBlock): void {
  const call =
    block.tool_use_id === undefined ? undefined : state.pendingTools.get(block.tool_use_id);
  if (call === undefined) return; // result of a tool we skip (e.g. Skill, ToolSearch)
  state.pendingTools.delete(call.id);
  const text = resultText(block).trim();
  if (block.is_error) {
    const error: ReplayEvent = {
      id: `${call.id}-error`,
      kind: "error",
      t: elapsed(state, line.timestamp),
      title: toTitle(`Error: ${text || call.title}`),
      text,
    };
    if (call.file !== undefined) error.file = call.file;
    state.events.push(error);
    return;
  }
  if (KINDS_WITH_OUTPUT.has(call.kind) && text !== "") call.output = text;
  if (call.kind === "edit" || call.kind === "write") {
    const diff = diffOf(line.toolUseResult);
    if (diff !== undefined) call.diff = diff;
    if (call.diff !== undefined && call.file !== undefined && isSensitiveFile(call.file)) {
      call.diff = { ...call.diff, before: HIDDEN_FILE, after: HIDDEN_FILE };
    }
  }
  if (call.kind === "subagent") {
    const agent = agentResultSchema.safeParse(line.toolUseResult);
    if (agent.success) state.subagentIds[call.id] = agent.data.agentId;
  }
}

function readUser(state: ReadState, line: UserLine, lineNumber: number): void {
  if (line.isMeta) return;
  if (Array.isArray(line.message.content)) {
    for (const block of line.message.content) {
      if (block.type === "tool_result") readToolResult(state, line, block);
    }
  }
  const text = promptText(line.message.content);
  if (text === "") return;
  state.events.push({
    id: line.uuid ?? `line-${lineNumber}`,
    kind: "user",
    t: elapsed(state, line.timestamp),
    title: toTitle(text),
    text,
  });
}

/**
 * Thinking blocks are never shown, and their long scrambled `signature` would otherwise be
 * scanned (slow) and mistaken for secrets.
 */
function withoutThinking(json: object): object {
  if (!("message" in json) || typeof json.message !== "object" || json.message === null)
    return json;
  const message = json.message;
  if (!("content" in message) || !Array.isArray(message.content)) return json;
  const content: unknown[] = message.content.filter(
    (block: unknown) =>
      !(
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "thinking"
      ),
  );
  return { ...json, message: { ...message, content } };
}

function readLine(state: ReadState, raw: string, lineNumber: number): void {
  if (raw.trim() === "") return;
  const json = parseJson(raw);
  if (json === undefined) {
    state.skippedLines++;
    return;
  }
  state.origin ??= timestampOf(json);
  if (typeof json !== "object" || json === null) return;
  const type = "type" in json ? json.type : undefined;
  if (type !== "user" && type !== "assistant") return;
  // Mask secrets in every string before anything is built from the line (F1.5).
  const safe = redactDeep(withoutThinking(json), (mask) => state.masks.add(mask));
  if (type === "user") {
    const user = userLineSchema.safeParse(safe);
    if (user.success) readUser(state, user.data, lineNumber);
    else state.skippedLines++;
  }
  if (type === "assistant") {
    const assistant = assistantLineSchema.safeParse(safe);
    if (assistant.success) readAssistant(state, assistant.data);
    else state.skippedLines++;
  }
}

export async function readEvents(path: string): Promise<EventsRead> {
  const state: ReadState = {
    events: [],
    skippedLines: 0,
    origin: undefined,
    tokensByModel: {},
    shortCacheWritesByModel: {},
    subagentIds: {},
    redactions: 0,
    masks: new Set(),
    countedReplies: new Set(),
    attachedReplies: new Set(),
    pendingTools: new Map(),
  };
  const lines = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let lineNumber = 0;
  for await (const raw of lines) {
    lineNumber++;
    readLine(state, raw, lineNumber);
  }
  const { countedReplies: _c, attachedReplies: _a, pendingTools: _p, masks, ...result } = state;
  // Count only secrets that would have been on screen, not ones in fields we never show.
  const shown = JSON.stringify(result.events);
  return { ...result, redactions: [...masks].filter((mask) => shown.includes(mask)).length };
}
