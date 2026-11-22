import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEvents } from "../src/adapters/claude-code/read-events.js";
import type { TokenUsage } from "../src/types.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const SUBAGENT = "05-expense-tracker-subagent.jsonl";

// Prompt counts from test/fixtures/README.md, recorded when the sessions were made.
const PROMPTS: readonly [file: string, prompts: number][] = [
  ["01-todo-app-short.jsonl", 1],
  ["02-notes-cli-multi-turn.jsonl", 3],
  ["03-bugfix-failing-tests.jsonl", 1],
  ["04-explain-read-only.jsonl", 1],
  ["05-expense-tracker-long.jsonl", 5],
  [SUBAGENT, 1],
  ["06-tiny-question.jsonl", 1],
  ["07-interrupted-max-turns.jsonl", 1],
  ["08-secrets-fake.jsonl", 1],
  ["09-model-switch.jsonl", 2],
  ["10-habit-tracker-resumed.jsonl", 3],
  ["11-vscode-pasted-prompt.jsonl", 1],
];

const ZERO: TokenUsage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };

function addTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    in: a.in + b.in,
    out: a.out + b.out,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}

interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

/** Claude Code's own per-model totals from the file's final cost-state line. */
function costStateTokens(file: string): Record<string, TokenUsage> {
  const lines = readFileSync(join(FIXTURES, file), "utf8").split("\n").filter(Boolean);
  const last = lines
    .map((l) => JSON.parse(l) as { type: string; modelUsage?: Record<string, ModelUsage> })
    .filter((o) => o.type === "cost-state")
    .at(-1);
  const result: Record<string, TokenUsage> = {};
  for (const [model, u] of Object.entries(last?.modelUsage ?? {})) {
    result[model] = {
      in: u.inputTokens,
      out: u.outputTokens,
      cacheRead: u.cacheReadInputTokens,
      cacheWrite: u.cacheCreationInputTokens,
    };
  }
  return result;
}

describe("readEvents on real fixtures", () => {
  it.each(PROMPTS)("%s: one user event per prompt", async (file, prompts) => {
    const { events } = await readEvents(join(FIXTURES, file));

    expect(events.filter((e) => e.kind === "user")).toHaveLength(prompts);
  });

  it.each(PROMPTS)("%s: times start at 0 and never go backwards", async (file) => {
    const { events } = await readEvents(join(FIXTURES, file));
    const times = events.map((e) => e.t);

    expect(times[0]).toBeGreaterThanOrEqual(0);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it.each(PROMPTS)("%s: no broken or unrecognised lines", async (file) => {
    expect((await readEvents(join(FIXTURES, file))).skippedLines).toBe(0);
  });

  it.each(PROMPTS.filter(([f]) => !f.startsWith("05-")))(
    "%s: tokens match Claude Code's own totals",
    async (file) => {
      expect((await readEvents(join(FIXTURES, file))).tokensByModel).toEqual(costStateTokens(file));
    },
  );

  it("long session plus its subagent matches Claude Code's totals (they include the subagent)", async () => {
    const main = await readEvents(join(FIXTURES, "05-expense-tracker-long.jsonl"));
    const sub = await readEvents(join(FIXTURES, SUBAGENT));
    const model = "claude-opus-5-5";

    expect(addTokens(main.tokensByModel[model] ?? ZERO, sub.tokensByModel[model] ?? ZERO)).toEqual(
      costStateTokens("05-expense-tracker-long.jsonl")[model],
    );
  });

  it("a reply's tokens are attached to one event only", async () => {
    const { events, tokensByModel } = await readEvents(
      join(FIXTURES, "11-vscode-pasted-prompt.jsonl"),
    );
    const withTokens = events.filter((e) => e.tokens !== undefined);

    expect(withTokens).toHaveLength(1);
    expect(withTokens[0]).toMatchObject({ kind: "assistant", model: "claude-sonnet-5-5" });
    expect(tokensByModel).toEqual({
      "claude-sonnet-5-5": { in: 10, out: 5, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it("prompt events drop editor context and keep the user's words", async () => {
    const { events } = await readEvents(join(FIXTURES, "11-vscode-pasted-prompt.jsonl"));
    const prompt = events.find((e) => e.kind === "user");

    expect(prompt?.text).toBe(
      "Plan the   next step for the demo notes app,\nthen list the files you would change first.",
    );
    expect(prompt?.title).toBe("Plan the next step for the demo notes app, then list the…");
    expect(prompt?.t).toBe(1000);
  });
});

describe("readEvents on damaged files", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agentreplay-read-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("counts broken and malformed conversation lines, ignores unknown line types", async () => {
    const path = join(dir, "damaged.jsonl");
    const ts = "2026-01-01T10:00:00.000Z";
    const lines = [
      JSON.stringify({ type: "user", timestamp: ts, uuid: "u1", message: { content: "Hi" } }),
      "{broken json",
      JSON.stringify({ type: "assistant", timestamp: ts, message: "not an object" }),
      JSON.stringify({ type: "some-future-line-type", whatever: true }),
      JSON.stringify({ type: "mode", mode: "default", sessionId: "s" }),
    ];
    writeFileSync(path, lines.join("\n"));

    const result = await readEvents(path);

    expect(result.skippedLines).toBe(2);
    expect(result.events.map((e) => e.kind)).toEqual(["user"]);
  });
});
