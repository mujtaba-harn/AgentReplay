import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { summarize } from "../src/adapters/claude-code/summarize.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const TASK = "Read TASK.md and complete it fully.";

// Hand-checked against each fixture's first prompt, cwd and final cost-state line.
const EXPECTED: readonly [
  file: string,
  title: string,
  project: string,
  start: number,
  ms: number,
][] = [
  ["01-todo-app-short.jsonl", TASK, "01-todo-app", 1795330490896, 46002],
  ["02-notes-cli-multi-turn.jsonl", TASK, "02-notes-cli", 1795330537402, 208693],
  ["03-bugfix-failing-tests.jsonl", TASK, "03-bugfix-calculator", 1795330748914, 42742],
  ["04-explain-read-only.jsonl", TASK, "04-explain-library", 1795330792282, 24096],
  ["05-expense-tracker-long.jsonl", TASK, "05-expense-tracker", 1795330816975, 1769579],
  [
    "06-tiny-question.jsonl",
    "Without using any tools, answer in two sentences: what does…",
    "06-tiny-question",
    1795332591821,
    4978,
  ],
  ["07-interrupted-max-turns.jsonl", TASK, "07-interrupted", 1795332597710, 24031],
  ["08-secrets-fake.jsonl", TASK, "08-fake-secrets", 1795332622256, 45463],
  ["09-model-switch.jsonl", TASK, "09-model-switch", 1795332668318, 44197],
  ["10-habit-tracker-resumed.jsonl", TASK, "10-habit-tracker", 1795332714300, 383807],
  [
    "11-vscode-pasted-prompt.jsonl",
    "Plan the next step for the demo notes app, then list the…",
    "demo-notes",
    1795341600000,
    9500,
  ],
];

describe("summarize on real fixtures", () => {
  it.each(EXPECTED)("%s", async (file, title, project, startedAt, durationMs) => {
    const path = join(FIXTURES, file);

    expect(await summarize(path)).toEqual({
      id: file.replace(".jsonl", ""),
      agent: "claude-code",
      path,
      title,
      project,
      startedAt,
      durationMs,
    });
  });

  it("summarizes 200 sessions in under 1 second", async () => {
    const paths = Array.from({ length: 200 }, (_, i) =>
      join(FIXTURES, EXPECTED[i % 11]?.[0] ?? ""),
    );
    const started = performance.now();
    for (let i = 0; i < paths.length; i += 8) {
      await Promise.all(paths.slice(i, i + 8).map(summarize));
    }
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("summarize on unusual files", () => {
  let dir: string;
  const write = (name: string, lines: readonly unknown[]): string => {
    const path = join(dir, "C--work-fallback-project", name);
    mkdirSync(join(dir, "C--work-fallback-project"), { recursive: true });
    writeFileSync(
      path,
      lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n"),
    );
    return path;
  };
  const user = (content: unknown, timestamp: string, extra: object = {}) => ({
    type: "user",
    timestamp,
    cwd: "/home/dev/my-app",
    message: { role: "user", content },
    ...extra,
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agentreplay-summarize-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to timestamps when a crashed session has no cost-state", async () => {
    const path = write("crashed.jsonl", [
      user("Fix the login bug", "2026-01-01T10:00:00.000Z"),
      { type: "assistant", timestamp: "2026-01-01T10:05:30.000Z", message: { content: [] } },
    ]);

    const summary = await summarize(path);

    expect(summary.startedAt).toBe(Date.parse("2026-01-01T10:00:00.000Z"));
    expect(summary.durationMs).toBe(330_000);
    expect(summary.project).toBe("my-app");
  });

  it("skips broken lines, meta lines and tool results before the first real prompt", async () => {
    const path = write("messy.jsonl", [
      "{not json",
      user("<command-meta>", "2026-01-01T10:00:00.000Z", { isMeta: true }),
      user([{ type: "tool_result", content: "ok" }], "2026-01-01T10:00:01.000Z"),
      user("  Add   dark mode\n to the settings page ", "2026-01-01T10:00:02.000Z"),
    ]);

    expect((await summarize(path)).title).toBe("Add dark mode to the settings page");
  });

  it("handles an empty file without crashing", async () => {
    const path = write("empty.jsonl", []);

    const summary = await summarize(path);

    expect(summary).toMatchObject({ title: "(no prompt)", project: "C--work-fallback-project" });
    expect(summary.durationMs).toBe(0);
    expect(summary.startedAt).toBeGreaterThan(0);
  });
});
