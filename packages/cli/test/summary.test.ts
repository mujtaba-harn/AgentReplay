import { stripVTControlCharacters } from "node:util";
import type { SessionSummary } from "@agentreplay/core";
import { describe, expect, it } from "vitest";
import { replayUrl, runningSummary } from "../src/summary.js";

const NOW = new Date(2026, 10, 23, 12, 0).getTime();
const session: SessionSummary = {
  id: "abc-123",
  agent: "claude-code",
  path: "C:\\Users\\someone\\.claude\\projects\\p\\abc-123.jsonl",
  title: "Fix the login bug",
  project: "todo-app",
  startedAt: NOW - 2 * 3_600_000,
  durationMs: 14 * 60_000,
};
const plain = (lines: readonly string[]): string => stripVTControlCharacters(lines.join("\n"));

describe("replayUrl", () => {
  it("points the browser at the picked session", () => {
    expect(replayUrl("http://127.0.0.1:4317", "abc-123")).toBe(
      "http://127.0.0.1:4317/?session=abc-123",
    );
  });
});

describe("runningSummary", () => {
  const url = "http://127.0.0.1:4317/?session=abc-123";

  it("names the session, the address, the privacy promise and how to stop", () => {
    const text = plain(runningSummary(session, url, "opened", NOW));

    expect(text).toContain("Fix the login bug");
    expect(text).toContain("todo-app · 14m · 2 h ago");
    expect(text).toContain(url);
    expect(text).toContain("Opened in your browser.");
    expect(text).toContain("Data never leaves your computer.");
    expect(text).toContain("Press Ctrl+C to stop.");
  });

  it("asks the user to open the address when --no-open was given", () => {
    expect(plain(runningSummary(session, url, "skipped", NOW))).toContain(
      "Open this address in your browser.",
    );
  });

  it("explains when the browser could not be opened", () => {
    expect(plain(runningSummary(session, url, "failed", NOW))).toContain(
      "Couldn't open a browser; open this address yourself.",
    );
  });

  it("never prints the log's file path", () => {
    expect(plain(runningSummary(session, url, "opened", NOW))).not.toContain("someone");
  });
});
