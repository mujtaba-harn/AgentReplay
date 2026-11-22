import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readEvents } from "../src/adapters/claude-code/read-events.js";
import type { EventKind, ReplayEvent, TokenUsage } from "../src/types.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

type ToolCounts = Partial<Record<EventKind, number>>;

// Counted from the raw tool_use / tool_result blocks of each fixture (F1.4b review, 22 Nov 2026).
const TOOL_COUNTS: readonly [file: string, counts: ToolCounts][] = [
  ["01-todo-app-short.jsonl", { read: 1, write: 3, command: 2, search: 1, error: 1 }],
  [
    "02-notes-cli-multi-turn.jsonl",
    { read: 4, edit: 4, write: 7, command: 8, search: 1, error: 4 },
  ],
  ["03-bugfix-failing-tests.jsonl", { read: 3, edit: 6, command: 8, search: 1, error: 1 }],
  ["04-explain-read-only.jsonl", { read: 6, search: 1 }],
  [
    "05-expense-tracker-long.jsonl",
    { read: 20, edit: 80, write: 18, command: 31, search: 2, task: 63, subagent: 1, error: 12 },
  ],
  ["05-expense-tracker-subagent.jsonl", { read: 11, command: 4, search: 2 }],
  ["06-tiny-question.jsonl", {}],
  ["07-interrupted-max-turns.jsonl", { read: 1, command: 2, search: 1, task: 5, error: 2 }],
  ["08-secrets-fake.jsonl", { read: 2, write: 3, command: 2, search: 1, error: 1 }],
  ["09-model-switch.jsonl", { read: 3, write: 2, command: 3, error: 2 }],
  [
    "10-habit-tracker-resumed.jsonl",
    { read: 6, edit: 15, write: 7, command: 14, search: 2, error: 6 },
  ],
  ["11-vscode-pasted-prompt.jsonl", {}],
];

// These hold replies made only of thinking + a skipped tool (ToolSearch, Skill): their tokens
// count in the totals but sit on no event.
const REPLIES_WITHOUT_EVENTS: ReadonlySet<string> = new Set([
  "05-expense-tracker-long.jsonl",
  "07-interrupted-max-turns.jsonl",
]);

const TOOL_KINDS: readonly EventKind[] = [
  "read",
  "edit",
  "write",
  "command",
  "search",
  "task",
  "subagent",
  "error",
];

const TITLE_STARTS: Partial<Record<EventKind, string>> = {
  read: "Read ",
  edit: "Edited ",
  write: "Wrote ",
  command: "Ran ",
  subagent: "Started subagent: ",
  error: "Error: ",
};

const eventsOf = async (file: string): Promise<ReplayEvent[]> =>
  (await readEvents(join(FIXTURES, file))).events;

describe("tool events on real fixtures", () => {
  it.each(TOOL_COUNTS)("%s: one event per tool call and per failed result", async (file, want) => {
    const events = await eventsOf(file);
    const got: ToolCounts = {};
    for (const kind of TOOL_KINDS) {
      const n = events.filter((e) => e.kind === kind).length;
      if (n > 0) got[kind] = n;
    }

    expect(got).toEqual(want);
  });

  it.each(TOOL_COUNTS)("%s: a reply's tokens never sit on two events", async (file) => {
    const { events, tokensByModel } = await readEvents(join(FIXTURES, file));
    const onEvents: Record<string, TokenUsage> = {};
    for (const e of events) {
      if (e.tokens === undefined || e.model === undefined) continue;
      const sum = onEvents[e.model] ?? { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
      onEvents[e.model] = {
        in: sum.in + e.tokens.in,
        out: sum.out + e.tokens.out,
        cacheRead: sum.cacheRead + e.tokens.cacheRead,
        cacheWrite: sum.cacheWrite + e.tokens.cacheWrite,
      };
    }

    if (!REPLIES_WITHOUT_EVENTS.has(file)) {
      expect(onEvents).toEqual(tokensByModel);
      return;
    }
    for (const [model, total] of Object.entries(tokensByModel)) {
      const shown = onEvents[model];
      expect(shown?.out).toBeLessThan(total.out);
      expect(shown?.in).toBeLessThanOrEqual(total.in);
    }
  });

  it.each(TOOL_COUNTS)(
    "%s: commands carry their text and either output or an error",
    async (file) => {
      const events = await eventsOf(file);
      const errorIds = new Set(events.filter((e) => e.kind === "error").map((e) => e.id));

      for (const command of events.filter((e) => e.kind === "command")) {
        expect(command.text).toBeTruthy();
        expect(command.output !== undefined || errorIds.has(`${command.id}-error`)).toBe(true);
      }
    },
  );

  it.each(TOOL_COUNTS)("%s: project files are relative, all paths use /", async (file) => {
    for (const e of (await eventsOf(file)).filter((x) => x.file !== undefined)) {
      expect(e.file).not.toContain("\\");
      // Only files outside the project (e.g. a temp folder) may stay absolute.
      if (/^[A-Za-z]:|^\//.test(e.file ?? "")) expect(e.file).not.toContain("mini-projects");
    }
  });

  it.each(TOOL_COUNTS)("%s: titles are short and say what happened", async (file) => {
    for (const e of await eventsOf(file)) {
      expect(e.title.length).toBeLessThanOrEqual(60);
      const start = TITLE_STARTS[e.kind];
      if (start !== undefined) expect(e.title.startsWith(start)).toBe(true);
    }
  });

  it("an error comes after the call that failed and keeps its message and file", async () => {
    const events = await eventsOf("10-habit-tracker-resumed.jsonl");
    for (const [i, error] of events.entries()) {
      if (error.kind !== "error") continue;
      const callIndex = events.findIndex((e) => `${e.id}-error` === error.id);
      const call = events[callIndex];

      expect(callIndex).toBeGreaterThanOrEqual(0);
      expect(callIndex).toBeLessThan(i);
      expect(error.text).toBeTruthy();
      expect(error.file).toBe(call?.file);
    }
  });
});
