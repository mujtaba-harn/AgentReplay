import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { createInterface } from "node:readline";
import type { SessionSummary } from "../../types.js";
import { costStateSchema, userLineSchema } from "./schema.js";
import { parseJson, promptText, timestampOf, toTitle } from "./text.js";

const LOG_EXTENSION = ".jsonl";
// The last line is normally a ~1 KB cost-state; 64 KB leaves room for long assistant lines.
const TAIL_BYTES = 64 * 1024;
const NO_PROMPT = "(no prompt)";

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
