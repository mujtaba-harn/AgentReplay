import type { EventKind, ReplayEvent, ReplaySession } from "@agentreplay/core";
import { describe, expect, it } from "vitest";
import {
  stripBars as barsOf,
  CARD_STATS,
  cardStats,
  DEFAULT_CARD_STATS,
  MAX_CARD_STATS,
  MAX_STRIP_BARS,
  topFileNames,
} from "../src/card";

const events = (kinds: readonly EventKind[]): ReplayEvent[] =>
  kinds.map((kind, i) => ({ id: `e${i}`, kind, t: i, title: kind }));
const stripBars = (list: readonly ReplayEvent[]) => barsOf(list).map((bar) => bar.kind);

describe("stripBars", () => {
  it("gives one bar per step, grouped into edits, commands, errors and other", () => {
    const bars = stripBars(events(["user", "edit", "write", "command", "error", "read"]));

    expect(bars).toEqual(["other", "edit", "edit", "command", "error", "other"]);
  });

  it(`merges neighbouring steps when there are more than ${MAX_STRIP_BARS}`, () => {
    const bars = stripBars(events(Array.from({ length: 2000 }, () => "read")));

    expect(bars).toHaveLength(MAX_STRIP_BARS);
  });

  it("keeps an error visible when it is merged with other steps", () => {
    const kinds: EventKind[] = Array.from({ length: 900 }, () => "read");
    kinds[451] = "error";

    expect(stripBars(events(kinds))).toContain("error");
  });

  it("prefers edits over commands when merging", () => {
    const kinds: EventKind[] = Array.from({ length: 900 }, (_, i) =>
      i % 3 === 0 ? "edit" : "command",
    );

    expect(new Set(stripBars(events(kinds)))).toEqual(new Set(["edit"]));
  });
});

const session = {
  events: events(["user", "edit", "error", "command", "error"]),
  stats: {
    durationMs: 29 * 60_000,
    filesChanged: 12,
    linesAdded: 4860,
    linesRemoved: 744,
    toolCalls: 215,
    tokens: { in: 206, out: 160_691, cacheRead: 13_318_275, cacheWrite: 271_209 },
    costUsd: 8.9706,
    costSource: "exact",
  },
} as unknown as ReplaySession;

describe("cardStats", () => {
  it("defaults to files changed, lines, tool calls and cost, with thousands separators", () => {
    expect(cardStats(session, DEFAULT_CARD_STATS)).toEqual([
      { label: "Files changed", value: "12" },
      { label: "Lines", value: "+4,860", extra: "−744" },
      { label: "Tool calls", value: "215" },
      { label: "Cost", value: "$8.97" },
    ]);
  });

  it("shows any chosen stats, always in the same order", () => {
    expect(cardStats(session, ["errors", "duration", "tokens", "steps"])).toEqual([
      { label: "Duration", value: "29m" },
      { label: "Tokens", value: "14M" },
      { label: "Steps", value: "5" },
      { label: "Errors", value: "2" },
    ]);
  });

  it(`never shows more than ${MAX_CARD_STATS}`, () => {
    const all = CARD_STATS.map((stat) => stat.id);

    expect(cardStats(session, all)).toHaveLength(MAX_CARD_STATS);
  });
});

describe("topFileNames", () => {
  const edit = (file: string, kind: EventKind = "edit"): ReplayEvent => ({
    id: file,
    kind,
    t: 0,
    title: "x",
    file,
  });

  it("names the most-edited files, most first, without their folders", () => {
    const list = [
      edit("src/a.ts"),
      edit("src/b.ts"),
      edit("src/b.ts", "write"),
      edit("lib/c.ts"),
      edit("src/b.ts"),
      edit("lib/c.ts"),
      edit("docs/d.md"),
    ];

    expect(topFileNames(list)).toEqual(["b.ts", "c.ts", "a.ts"]);
  });

  it("ignores files that were only read", () => {
    expect(topFileNames([edit("src/a.ts", "read")])).toEqual([]);
  });

  it("handles Windows paths", () => {
    expect(topFileNames([edit("src\\deep\\App.tsx")])).toEqual(["App.tsx"]);
  });
});
