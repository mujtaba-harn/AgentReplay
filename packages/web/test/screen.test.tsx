import type { ReplaySession } from "@agentreplay/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReplayScreen } from "../src/App";
import type { Problem } from "../src/api";

const session = {
  id: "abc",
  agent: "claude-code",
  path: "",
  title: "Fix the login bug",
  project: "todo-app",
  startedAt: 0,
  durationMs: 14 * 60_000,
  events: [{ id: "e1", kind: "user", t: 0, title: "Fix the login bug" }],
  stats: { durationMs: 14 * 60_000 },
  warnings: { skippedLines: 0, redactions: 0 },
} as unknown as ReplaySession;

// React escapes apostrophes in HTML; turn them back so tests read like the visible text.
const render = (state: Parameters<typeof ReplayScreen>[0]["state"]): string =>
  renderToStaticMarkup(<ReplayScreen state={state} />).replaceAll("&#x27;", "'");

describe("ReplayScreen", () => {
  it("says it is loading", () => {
    expect(render({ status: "loading" })).toContain("Loading your session…");
  });

  it.each<[Problem, string]>([
    ["noSession", "No session chosen."],
    ["unreachable", "Can't reach AgentReplay."],
    ["notFound", "This session isn't available."],
    ["unreadable", "This session couldn't be read."],
    ["unexpected", "Something unexpected came back."],
  ])("explains the %s problem with a next step", (problem, title) => {
    const html = render({ status: "failed", problem });

    expect(html).toContain(title);
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/npx agentreplay|Claude Code version/);
  });

  it("shows the session's title, project, duration and step count", () => {
    const html = render({ status: "ready", session });

    expect(html).toContain("Fix the login bug");
    expect(html).toContain("todo-app · 14m · 1 step");
  });

  it("says so when a session has no steps", () => {
    const html = render({ status: "ready", session: { ...session, events: [] } });

    expect(html).toContain("This session has no steps to replay.");
  });
});
