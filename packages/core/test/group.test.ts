import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readSession } from "../src/adapters/claude-code/read-session.js";
import { compressedTimes, groupConsecutiveReads, IDLE_GAP_MAX_MS } from "../src/group.js";
import type { ReplayEvent } from "../src/types.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const eventsOf = async (file: string) => (await readSession(join(FIXTURES, file))).events;

const at = (t: number, kind: ReplayEvent["kind"] = "assistant"): ReplayEvent => ({
  id: `e${t}`,
  kind,
  t,
  title: kind,
});

function totalOut(events: readonly ReplayEvent[]): number {
  return events.reduce((sum, e) => sum + (e.tokens?.out ?? 0), 0);
}

describe("groupConsecutiveReads", () => {
  it("merges a run of reads into one 'Read N files' step listing the files", async () => {
    const grouped = groupConsecutiveReads(await eventsOf("04-explain-read-only.jsonl"));
    const run = grouped.find((e) => e.groupSize !== undefined);

    expect(grouped.map((e) => e.kind)).toEqual(["user", "read", "search", "read", "assistant"]);
    expect(run).toMatchObject({ kind: "read", title: "Read 5 files", groupSize: 5 });
    expect(run?.text?.split("\n")).toHaveLength(5);
  });

  it("leaves single reads and everything else unchanged", async () => {
    const events = await eventsOf("01-todo-app-short.jsonl");

    expect(groupConsecutiveReads(events)).toEqual(events);
  });

  it.each([
    "02-notes-cli-multi-turn.jsonl",
    "05-expense-tracker-long.jsonl",
    "10-habit-tracker-resumed.jsonl",
  ])("%s: keeps every token and event id unique", async (file) => {
    const events = await eventsOf(file);
    const grouped = groupConsecutiveReads(events);
    const ids = grouped.map((e) => e.id);

    expect(totalOut(grouped)).toBe(totalOut(events));
    expect(new Set(ids).size).toBe(ids.length);
    expect(grouped.length).toBeLessThan(events.length);
  });

  it("does not change the events it was given", async () => {
    const events = await eventsOf("04-explain-read-only.jsonl");
    const copy = structuredClone(events);
    groupConsecutiveReads(events);

    expect(events).toEqual(copy);
  });
});

describe("compressedTimes", () => {
  it("counts any pause longer than a minute as one minute", () => {
    const minute = IDLE_GAP_MAX_MS;
    const events = [
      at(0),
      at(10_000),
      at(10_000 + 5 * minute),
      at(10_000 + 5 * minute + 2 * 86_400_000),
    ];

    expect(compressedTimes(events)).toEqual([0, 10_000, 10_000 + minute, 10_000 + 2 * minute]);
  });

  it("keeps real times when there are no long pauses", async () => {
    const events = await eventsOf("01-todo-app-short.jsonl");

    expect(compressedTimes(events)).toEqual(events.map((e) => e.t));
  });

  it("shortens the long session's two idle gaps and never goes backwards", async () => {
    const events = await eventsOf("05-expense-tracker-long.jsonl");
    const times = compressedTimes(events);

    expect(times.at(-1)).toBeLessThan(events.at(-1)?.t ?? 0);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("is empty for no events", () => {
    expect(compressedTimes([])).toEqual([]);
  });
});
