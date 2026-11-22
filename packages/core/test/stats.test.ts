import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readSession } from "../src/adapters/claude-code/read-session.js";
import { estimateCost } from "../src/pricing.js";
import { computeStats } from "../src/stats.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const RECORDED = readdirSync(FIXTURES).filter(
  (f) => f.endsWith(".jsonl") && !f.includes("subagent") && !f.startsWith("11-"),
);
const SUBAGENT = join(FIXTURES, "05-expense-tracker-subagent.jsonl");

interface CostState {
  totalCostUSD: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalDuration: number;
}

function costState(file: string): CostState {
  const last = readFileSync(join(FIXTURES, file), "utf8").trim().split("\n").at(-1) ?? "{}";
  return JSON.parse(last) as CostState;
}

// The long session's subagent log is stored under a fixture name, not agent-<id>.jsonl.
const findSubagent = async () => SUBAGENT;

async function statsFor(file: string, exactCostUsd?: number) {
  const session = await readSession(join(FIXTURES, file), findSubagent);
  return computeStats({
    events: session.events,
    subagentEvents: session.subagentEvents,
    tokensByModel: session.tokensByModel,
    shortCacheWritesByModel: session.shortCacheWritesByModel,
    durationMs: costState(file).totalDuration,
    ...(exactCostUsd === undefined ? {} : { exactCostUsd }),
  });
}

describe("computeStats on real fixtures", () => {
  it.each(RECORDED)("%s: lines and exact cost match Claude Code's own totals", async (file) => {
    const cs = costState(file);
    const stats = await statsFor(file, cs.totalCostUSD);

    expect(stats).toMatchObject({
      linesAdded: cs.totalLinesAdded,
      linesRemoved: cs.totalLinesRemoved,
      durationMs: cs.totalDuration,
      costUsd: cs.totalCostUSD,
      costSource: "exact",
    });
  });

  it.each(RECORDED)("%s: the estimate equals Claude Code's real cost", async (file) => {
    const stats = await statsFor(file);

    expect(stats.costSource).toBe("estimate");
    expect(stats.costUsd).toBeCloseTo(costState(file).totalCostUSD, 9);
  });

  it("counts tool calls and the files a session changed", async () => {
    const readOnly = await statsFor("04-explain-read-only.jsonl");
    const todo = await statsFor("01-todo-app-short.jsonl");

    expect(readOnly).toMatchObject({ toolCalls: 7, filesChanged: 0 }); // 6 reads + 1 search
    expect(todo).toMatchObject({ toolCalls: 7, filesChanged: 3 }); // 1 read, 3 writes, 2 commands, 1 search
  });

  it("includes the subagent's tool calls and tokens", async () => {
    const withSub = await statsFor("05-expense-tracker-long.jsonl");
    const mainOnly = await readSession(
      join(FIXTURES, "05-expense-tracker-long.jsonl"),
      async () => undefined,
    );
    const mainStats = computeStats({ ...mainOnly, durationMs: 0 });

    expect(withSub.toolCalls).toBe(mainStats.toolCalls + 17); // subagent: 11 reads, 4 commands, 2 searches
    expect(withSub.tokens.out).toBeGreaterThan(mainStats.tokens.out);
  });
});

describe("estimateCost", () => {
  it("prices each model with its own rates", () => {
    const million = { in: 1_000_000, out: 1_000_000, cacheRead: 0, cacheWrite: 0 };

    expect(estimateCost({ "claude-opus-5-5": million })).toBe(24);
    expect(estimateCost({ "claude-sonnet-5-5": million })).toBe(12);
    expect(estimateCost({ "claude-haiku-5-5": million })).toBeCloseTo(0.6, 10);
  });

  it("matches model ids with a date suffix", () => {
    const tokens = { in: 1_000_000, out: 0, cacheRead: 0, cacheWrite: 0 };

    expect(estimateCost({ "claude-opus-5-5-20261101": tokens })).toBe(4);
  });

  it("never prices Claude Code's synthetic replies or unknown models", () => {
    const tokens = { in: 1_000_000, out: 1_000_000, cacheRead: 0, cacheWrite: 0 };

    expect(estimateCost({ "<synthetic>": tokens, unknown: tokens, "gpt-x": tokens })).toBe(0);
  });
});
