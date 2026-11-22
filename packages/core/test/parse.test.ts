import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "../src/index.js";
import { FAKE_SECRETS, restoreFakeSecrets } from "./support/public-fixtures.ts";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

function costState(file: string): { totalCostUSD: number; totalLinesAdded: number } {
  return JSON.parse(readFileSync(join(FIXTURES, file), "utf8").trim().split("\n").at(-1) ?? "{}");
}

describe("parse (public API)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "agentreplay-parse-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the summary, grouped events, stats and warnings", async () => {
    const file = "04-explain-read-only.jsonl";
    const session = await parse(join(FIXTURES, file));

    expect(session).toMatchObject({
      id: "04-explain-read-only",
      agent: "claude-code",
      title: "Read TASK.md and complete it fully.",
      project: "04-explain-library",
      stats: { toolCalls: 7, costSource: "exact", costUsd: costState(file).totalCostUSD },
      warnings: { skippedLines: 0, redactions: 0 },
    });
    expect(session.events.map((e) => e.title)).toContain("Read 5 files");
  });

  it("times events from the session start, so the first is at or after 0", async () => {
    const session = await parse(join(FIXTURES, "10-habit-tracker-resumed.jsonl"));
    const times = session.events.map((e) => e.t);

    expect(times[0]).toBeGreaterThanOrEqual(0);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times.at(-1)).toBeLessThanOrEqual(session.durationMs);
  });

  it("never lets a fake key out, anywhere in the result", async () => {
    const path = join(dir, "secrets.jsonl");
    writeFileSync(
      path,
      restoreFakeSecrets(readFileSync(join(FIXTURES, "08-secrets-fake.jsonl"), "utf8")),
    );

    const session = await parse(path);
    const everything = JSON.stringify(session);

    for (const secret of FAKE_SECRETS) expect(everything).not.toContain(secret.value);
    expect(session.warnings.redactions).toBeGreaterThan(0);
  });

  it("estimates the cost when the session never finished (no cost-state)", async () => {
    const path = join(dir, "crashed.jsonl");
    const lines = readFileSync(join(FIXTURES, "01-todo-app-short.jsonl"), "utf8")
      .trim()
      .split("\n");
    writeFileSync(path, lines.filter((l) => !l.includes('"type":"cost-state"')).join("\n"));

    const session = await parse(path);

    expect(session.stats.costSource).toBe("estimate");
    expect(session.stats.costUsd).toBeCloseTo(costState("01-todo-app-short.jsonl").totalCostUSD, 9);
  });
});
