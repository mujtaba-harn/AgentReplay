// @vitest-environment jsdom
import { join } from "node:path";
import { parse, type ReplaySession } from "@crafter-replay/core";
import { formatDuration } from "@crafter-replay/core/format";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatsPanel } from "../src/components/StatsPanel";
import { formatCost, formatCount } from "../src/format";

const FIXTURES = join(import.meta.dirname, "..", "..", "core", "test", "fixtures");

afterEach(cleanup);

// Each tile is a <dt> label followed by its <dd> value.
const tile = (label: string): string =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? "";

describe("StatsPanel", () => {
  it("shows exactly the numbers stats.ts computed for a real session", async () => {
    const session = await parse(join(FIXTURES, "05-expense-tracker-long.jsonl"));
    const { stats } = session;
    render(<StatsPanel session={session} />);

    expect(tile("Duration")).toBe(formatDuration(stats.durationMs));
    expect(tile("Files changed")).toBe(String(stats.filesChanged));
    expect(tile("Lines")).toBe(`+${stats.linesAdded} −${stats.linesRemoved}`);
    expect(tile("Tool calls")).toBe(String(stats.toolCalls));
    expect(tile("Tokens")).toBe(
      `${formatCount(stats.tokens.in)} in · ${formatCount(stats.tokens.out)} out · ${formatCount(
        stats.tokens.cacheRead + stats.tokens.cacheWrite,
      )} cache`,
    );
    expect(tile("Cost")).toBe(`${formatCost(stats.costUsd)} exact`);
  });

  const base = {
    title: "t",
    events: [],
    stats: {
      durationMs: 0,
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      toolCalls: 0,
      tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0.5,
      costSource: "estimate",
    },
    warnings: { skippedLines: 0, redactions: 0 },
  } as unknown as ReplaySession;

  it("labels a calculated cost as an estimate", () => {
    render(<StatsPanel session={base} />);

    expect(tile("Cost")).toBe("$0.50 estimate");
  });

  it("says how many possible secrets were hidden", () => {
    render(<StatsPanel session={{ ...base, warnings: { skippedLines: 0, redactions: 3 } }} />);

    expect(screen.getByText("We hid 3 possible secrets before showing this session.")).toBeTruthy();
  });

  it("uses the singular for one secret, and says nothing when none were found", () => {
    const { unmount } = render(
      <StatsPanel session={{ ...base, warnings: { skippedLines: 0, redactions: 1 } }} />,
    );
    expect(screen.getByText("We hid 1 possible secret before showing this session.")).toBeTruthy();
    unmount();

    render(<StatsPanel session={base} />);
    expect(screen.queryByText(/We hid/)).toBeNull();
  });

  it("says when log lines could not be read", () => {
    render(<StatsPanel session={{ ...base, warnings: { skippedLines: 2, redactions: 0 } }} />);

    expect(screen.getByText("2 lines of the log couldn't be read and were skipped.")).toBeTruthy();
  });

  it("uses the singular for one skipped line", () => {
    render(<StatsPanel session={{ ...base, warnings: { skippedLines: 1, redactions: 0 } }} />);

    expect(screen.getByText("1 line of the log couldn't be read and was skipped.")).toBeTruthy();
  });
});
