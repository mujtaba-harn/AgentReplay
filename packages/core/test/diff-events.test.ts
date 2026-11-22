import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readEvents } from "../src/adapters/claude-code/read-events.js";
import type { ReplayEvent } from "../src/types.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
// Subagent logs have no cost-state line of their own.
const WITH_TOTALS = readdirSync(FIXTURES).filter(
  (f) => f.endsWith(".jsonl") && !f.includes("subagent"),
);

function claudeLineTotals(file: string): { added: number; removed: number } {
  const last = readFileSync(join(FIXTURES, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map(
      (l) =>
        JSON.parse(l) as { type: string; totalLinesAdded?: number; totalLinesRemoved?: number },
    )
    .filter((o) => o.type === "cost-state")
    .at(-1);
  return { added: last?.totalLinesAdded ?? 0, removed: last?.totalLinesRemoved ?? 0 };
}

const changes = (events: readonly ReplayEvent[]) =>
  events.filter((e) => e.kind === "edit" || e.kind === "write");

describe("edit and write diffs on real fixtures", () => {
  it.each(WITH_TOTALS)("%s: lines added/removed match Claude Code's own totals", async (file) => {
    const { events } = await readEvents(join(FIXTURES, file));
    const sum = changes(events).reduce(
      (acc, e) => ({
        added: acc.added + (e.diff?.added ?? 0),
        removed: acc.removed + (e.diff?.removed ?? 0),
      }),
      { added: 0, removed: 0 },
    );

    expect(sum).toEqual(claudeLineTotals(file));
  });

  it.each(WITH_TOTALS)("%s: every successful edit and write has a diff", async (file) => {
    const { events } = await readEvents(join(FIXTURES, file));
    const failed = new Set(events.filter((e) => e.kind === "error").map((e) => e.id));

    for (const change of changes(events)) {
      if (failed.has(`${change.id}-error`)) continue;
      expect(change.diff).toBeDefined();
    }
  });

  it("a new file is a write from nothing; an edit records the replaced snippet", async () => {
    const { events } = await readEvents(join(FIXTURES, "03-bugfix-failing-tests.jsonl"));
    const edit = events.find((e) => e.kind === "edit");
    const { events: created } = await readEvents(join(FIXTURES, "01-todo-app-short.jsonl"));
    const write = created.find((e) => e.kind === "write");

    expect(write?.diff?.before).toBe("");
    expect(write?.diff?.after.length).toBeGreaterThan(0);
    expect(write?.diff?.removed).toBe(0);
    expect(edit?.diff?.before).not.toBe(edit?.diff?.after);
    expect(edit?.diff?.added).toBeGreaterThan(0);
  });
});
