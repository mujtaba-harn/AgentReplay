// Internal: turns a Claude Code log into prompt and reply events. Not exported from core,
// because text here is not redacted yet — parse() will wrap this once redact() exists (F1.5).
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { ReplayEvent, TokenUsage } from "../../types.js";
import {
  type AssistantLine,
  assistantLineSchema,
  type UserLine,
  userLineSchema,
} from "./schema.js";
import { parseJson, promptText, timestampOf, toTitle } from "./text.js";

export interface EventsRead {
  events: ReplayEvent[];
  /** Broken JSON, or user/assistant lines that fail their schema. Unknown line types are not counted. */
  skippedLines: number;
  /** Epoch ms of the first timestamped line; every event's `t` counts from here. */
  origin: number | undefined;
  /** Counted once per API reply, keyed by model id. */
  tokensByModel: Record<string, TokenUsage>;
}

interface ReadState extends EventsRead {
  /** Replies whose tokens were already counted; their later lines must not count again. */
  countedReplies: Set<string>;
}

const UNKNOWN_MODEL = "unknown";

function tokensOf(usage: NonNullable<AssistantLine["message"]["usage"]>): TokenUsage {
  return {
    in: usage.input_tokens,
    out: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
}

function addTokens(state: ReadState, model: string, tokens: TokenUsage): void {
  const total = state.tokensByModel[model] ?? { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  state.tokensByModel[model] = {
    in: total.in + tokens.in,
    out: total.out + tokens.out,
    cacheRead: total.cacheRead + tokens.cacheRead,
    cacheWrite: total.cacheWrite + tokens.cacheWrite,
  };
}

function elapsed(state: ReadState, timestamp: string): number {
  return Date.parse(timestamp) - (state.origin ?? Date.parse(timestamp));
}

function readUser(state: ReadState, line: UserLine, lineNumber: number): void {
  if (line.isMeta) return;
  const text = promptText(line.message.content);
  if (text === "") return; // only tool results; handled with tool calls (F1.4b)
  state.events.push({
    id: line.uuid ?? `line-${lineNumber}`,
    kind: "user",
    t: elapsed(state, line.timestamp),
    title: toTitle(text),
    text,
  });
}

/** Counts the reply's tokens the first time it is seen and returns them, else undefined. */
function claimReplyTokens(state: ReadState, line: AssistantLine): TokenUsage | undefined {
  const replyId = line.requestId ?? line.uuid;
  const usage = line.message.usage;
  if (usage === undefined || state.countedReplies.has(replyId)) return undefined;
  state.countedReplies.add(replyId);
  const tokens = tokensOf(usage);
  addTokens(state, line.message.model ?? UNKNOWN_MODEL, tokens);
  return tokens;
}

function readAssistant(state: ReadState, line: AssistantLine): void {
  const tokens = claimReplyTokens(state, line);
  const text = line.message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
  if (text === "") return; // thinking or tool calls only (tool calls: F1.4b)
  const event: ReplayEvent = {
    id: line.uuid,
    kind: "assistant",
    t: elapsed(state, line.timestamp),
    title: toTitle(text),
    text,
  };
  if (line.message.model !== undefined) event.model = line.message.model;
  if (tokens !== undefined) event.tokens = tokens;
  state.events.push(event);
}

function readLine(state: ReadState, raw: string, lineNumber: number): void {
  if (raw.trim() === "") return;
  const json = parseJson(raw);
  if (json === undefined) {
    state.skippedLines++;
    return;
  }
  state.origin ??= timestampOf(json);
  const type = typeof json === "object" && json !== null && "type" in json ? json.type : undefined;
  if (type === "user") {
    const user = userLineSchema.safeParse(json);
    if (user.success) readUser(state, user.data, lineNumber);
    else state.skippedLines++;
  }
  if (type === "assistant") {
    const assistant = assistantLineSchema.safeParse(json);
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
    countedReplies: new Set(),
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
  const { countedReplies: _counted, ...result } = state;
  return result;
}
