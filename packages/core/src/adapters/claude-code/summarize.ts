import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { createInterface } from "node:readline";
import type { SessionSummary } from "../../types.js";
import { costStateSchema, timestampedLineSchema, type UserLine, userLineSchema } from "./schema.js";

const LOG_EXTENSION = ".jsonl";
// The last line is normally a ~1 KB cost-state; 64 KB leaves room for long assistant lines.
const TAIL_BYTES = 64 * 1024;
const TITLE_MAX = 60;
const NO_PROMPT = "(no prompt)";

// Editor context VS Code adds around a prompt; it is not what the user asked.
const CONTEXT_TAGS: readonly string[] = ["ide_opened_file", "ide_selection", "system-reminder"];
// Wrappers whose content *is* the prompt (e.g. pasted text).
const WRAPPER_TAGS: readonly string[] = ["pasted_content"];

interface Head {
  prompt?: string;
  cwd?: string;
  firstTimestamp?: number | undefined;
}

interface Tail {
  cost?: { startTime: number; totalDuration: number };
  lastTimestamp?: number;
  modifiedAt: number;
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    // A broken line is skipped, never fatal (CLAUDE.md: tolerant parsing).
    return undefined;
  }
}

function timestampOf(json: unknown): number | undefined {
  const line = timestampedLineSchema.safeParse(json);
  return line.success ? Date.parse(line.data.timestamp) : undefined;
}

function cleanPrompt(raw: string): string {
  let text = raw;
  for (const tag of CONTEXT_TAGS) {
    text = text.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}[^>]*>`, "g"), " ");
  }
  for (const tag of WRAPPER_TAGS) {
    text = text.replace(new RegExp(`</?${tag}[^>]*>`, "g"), " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function promptText(content: UserLine["message"]["content"]): string {
  if (typeof content === "string") return cleanPrompt(content);
  return cleanPrompt(
    content.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join(" "),
  );
}

function toTitle(text: string): string {
  if (text.length <= TITLE_MAX) return text;
  let cut = text.slice(0, TITLE_MAX - 1);
  if (text[TITLE_MAX - 1] !== " " && cut.includes(" ")) cut = cut.slice(0, cut.lastIndexOf(" "));
  return `${cut.trimEnd()}…`;
}

// Logs may be read on a different OS than they were written on, so split on both separators.
function projectName(cwd: string | undefined): string | undefined {
  return cwd?.split(/[\\/]/).filter(Boolean).at(-1);
}

async function readHead(path: string): Promise<Head> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  const head: Head = {};
  try {
    for await (const line of lines) {
      const json = parseJson(line);
      head.firstTimestamp ??= timestampOf(json);
      const user = userLineSchema.safeParse(json);
      if (!user.success || user.data.isMeta) continue;
      const prompt = promptText(user.data.message.content);
      if (prompt === "") continue;
      head.prompt = prompt;
      if (user.data.cwd !== undefined) head.cwd = user.data.cwd;
      break;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return head;
}

async function readTail(path: string): Promise<Tail> {
  const file = await open(path, "r");
  try {
    const { size, mtimeMs } = await file.stat();
    const length = Math.min(size, TAIL_BYTES);
    const { buffer } = await file.read(Buffer.alloc(length), 0, length, size - length);
    const lines = buffer
      .toString("utf8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    if (length < size) lines.shift(); // first line is probably cut mid-way
    const parsed = lines.map(parseJson);
    const tail: Tail = { modifiedAt: mtimeMs };
    const cost = costStateSchema.safeParse(parsed.at(-1));
    if (cost.success) tail.cost = cost.data;
    const lastTimestamp = parsed
      .map(timestampOf)
      .filter((t) => t !== undefined)
      .at(-1);
    if (lastTimestamp !== undefined) tail.lastTimestamp = lastTimestamp;
    return tail;
  } finally {
    await file.close();
  }
}

function durationOf(head: Head, tail: Tail): number {
  if (tail.cost) return tail.cost.totalDuration;
  if (head.firstTimestamp === undefined || tail.lastTimestamp === undefined) return 0;
  return Math.max(0, tail.lastTimestamp - head.firstTimestamp);
}

/** Picker-level facts about one session, reading only its first prompt and its last lines. */
export async function summarize(path: string): Promise<SessionSummary> {
  const [head, tail] = await Promise.all([readHead(path), readTail(path)]);
  return {
    id: basename(path, LOG_EXTENSION),
    agent: "claude-code",
    path,
    // TODO(F1.5): pass the title through redact() once it exists.
    title: head.prompt === undefined ? NO_PROMPT : toTitle(head.prompt),
    project: projectName(head.cwd) ?? basename(dirname(path)),
    startedAt: tail.cost?.startTime ?? head.firstTimestamp ?? tail.modifiedAt,
    durationMs: durationOf(head, tail),
  };
}
