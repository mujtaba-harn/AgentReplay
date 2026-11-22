import type { EventKind, ReplayEvent, ReplaySession } from "@agentreplay/core";
import { describe, expect, it } from "vitest";
import { stripBars as barsOf, cardStats, MAX_STRIP_BARS } from "../src/card";

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

describe("cardStats", () => {
  it("shows files changed, lines, tool calls and cost, with thousands separators", () => {
    const session = {
      stats: {
        durationMs: 0,
        filesChanged: 12,
        linesAdded: 4860,
        linesRemoved: 744,
        toolCalls: 215,
        tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
        costUsd: 8.9706,
        costSource: "exact",
      },
    } as unknown as ReplaySession;

    expect(cardStats(session)).toEqual([
      { label: "Files changed", value: "12" },
      { label: "Lines", value: "+4,860", extra: "−744" },
      { label: "Tool calls", value: "215" },
      { label: "Cost", value: "$8.97" },
    ]);
  });
});
