import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEvents } from "../src/adapters/claude-code/read-events.js";
import { describeActivity, readSession } from "../src/adapters/claude-code/read-session.js";
import type { ReplayEvent } from "../src/types.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const MAIN = join(FIXTURES, "05-expense-tracker-long.jsonl");
const SUB = join(FIXTURES, "05-expense-tracker-subagent.jsonl");
const AGENT_ID = "a372465551c1a3cba";

const fixtureFinder = async (id: string) => (id === AGENT_ID ? SUB : undefined);

function costStateOpusTokens() {
  const last = readFileSync(MAIN, "utf8").trim().split("\n").at(-1) ?? "{}";
  const u = (JSON.parse(last) as { modelUsage: Record<string, Record<string, number>> }).modelUsage[
    "claude-opus-5-5"
  ];
  return {
    in: u?.inputTokens,
    out: u?.outputTokens,
    cacheRead: u?.cacheReadInputTokens,
    cacheWrite: u?.cacheCreationInputTokens,
  };
}

describe("readSession with a subagent (decision 4d: summary only)", () => {
  it("shows the subagent as one step whose output starts with what it did", async () => {
    const session = await readSession(MAIN, fixtureFinder);
    const step = session.events.find((e) => e.kind === "subagent");

    expect(session.events.filter((e) => e.kind === "subagent")).toHaveLength(1);
    expect(step?.output?.split("\n")[0]).toBe("Read 11 files · ran 4 commands · searched 2 times");
    expect(step?.output?.length).toBeGreaterThan(100); // followed by the subagent's report
  });

  it("keeps the subagent's steps off the timeline but available for stats", async () => {
    const session = await readSession(MAIN, fixtureFinder);
    const alone = await readEvents(MAIN);

    expect(session.events).toHaveLength(alone.events.length);
    expect(session.subagentEvents).toHaveLength((await readEvents(SUB)).events.length);
  });

  it("includes the subagent's tokens, matching Claude Code's own totals", async () => {
    const session = await readSession(MAIN, fixtureFinder);

    expect(session.tokensByModel["claude-opus-5-5"]).toEqual(costStateOpusTokens());
  });

  it("leaves the step as it is when the subagent's log is missing", async () => {
    const session = await readSession(MAIN, async () => undefined);
    const step = session.events.find((e) => e.kind === "subagent");

    expect(step?.output?.startsWith("Read 11 files")).toBe(false);
    expect(session.subagentEvents).toEqual([]);
  });
});

describe("readSession finds subagent logs on disk", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agentreplay-session-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("looks in <session-id>/subagents/agent-<agentId>.jsonl", async () => {
    const session = join(dir, "abc.jsonl");
    copyFileSync(MAIN, session);
    mkdirSync(join(dir, "abc", "subagents"), { recursive: true });
    copyFileSync(SUB, join(dir, "abc", "subagents", `agent-${AGENT_ID}.jsonl`));

    const result = await readSession(session);

    expect(result.subagentEvents.length).toBeGreaterThan(0);
  });
});

describe("describeActivity", () => {
  const ev = (kind: ReplayEvent["kind"]): ReplayEvent => ({ id: kind, kind, t: 0, title: kind });

  it("uses singular and plural forms and skips kinds that did not happen", () => {
    expect(describeActivity([ev("read"), ev("edit"), ev("edit"), ev("error")])).toBe(
      "Read 1 file · made 2 edits · hit 1 error",
    );
  });

  it("says so when the subagent used no tools", () => {
    expect(describeActivity([ev("assistant")])).toBe("Did no tool work");
  });
});
