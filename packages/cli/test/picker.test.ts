import { stripVTControlCharacters } from "node:util";
import type { SessionSummary } from "@agentreplay/core";
import { describe, expect, it } from "vitest";
import { fitTitle, formatAge, sessionDetails, sessionRow } from "../src/picker.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 10, 23, 12, 0).getTime();

describe("formatAge", () => {
  it.each([
    [10_000, "just now"],
    [5 * MINUTE, "5 min ago"],
    [3 * HOUR, "3 h ago"],
    [DAY + HOUR, "1 day ago"],
    [4 * DAY, "4 days ago"],
  ])("shows a session started %d ms ago as %s", (ago, text) => {
    expect(formatAge(NOW - ago, NOW)).toBe(text);
  });

  it("shows the local date for sessions older than a week", () => {
    expect(formatAge(new Date(2026, 9, 1, 9, 30).getTime(), NOW)).toBe("2026-10-01");
  });

  it("treats a start time in the future (clock skew) as just now", () => {
    expect(formatAge(NOW + MINUTE, NOW)).toBe("just now");
  });
});

const summary: SessionSummary = {
  id: "s",
  agent: "claude-code",
  path: "s.jsonl",
  title: "Fix the login bug",
  project: "todo-app",
  startedAt: NOW - 2 * HOUR,
  durationMs: 14 * MINUTE,
};

describe("sessionDetails", () => {
  it("joins project, duration and age", () => {
    expect(sessionDetails(summary, NOW)).toBe("todo-app · 14m · 2 h ago");
  });
});

describe("fitTitle", () => {
  it("keeps a title that fits", () => {
    expect(fitTitle("Fix the login bug", 40)).toBe("Fix the login bug");
  });

  it("shortens a long title with an ellipsis", () => {
    expect(fitTitle("Read CLAUDE.md and everything in docs", 22)).toBe("Read CLAUDE.md and ev…");
  });

  it("never shrinks a title below 20 characters on very narrow terminals", () => {
    expect(fitTitle("Read CLAUDE.md and everything in docs", 5)).toBe("Read CLAUDE.md and…");
  });
});

describe("sessionRow", () => {
  it("fits title and details on one 80-column line", () => {
    const long = { ...summary, title: "x".repeat(60), project: "expense-tracker" };

    const row = stripVTControlCharacters(sessionRow(long, NOW, 80));

    expect(row.length).toBeLessThanOrEqual(80 - 6);
    expect(row).toContain("expense-tracker · 14m · 2 h ago");
  });
});
