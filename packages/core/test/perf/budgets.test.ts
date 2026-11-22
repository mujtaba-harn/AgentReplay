// Performance budgets from ARCHITECTURE.md §11. Run on their own (`pnpm test` does this as a
// second step) so other test files can't slow the machine down while we measure.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { summarize } from "../../src/adapters/claude-code/summarize.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));
const SESSIONS = readdirSync(FIXTURES).filter(
  (f) => f.endsWith(".jsonl") && !f.includes("subagent"),
);

describe("performance budgets", () => {
  it("summarizes 200 sessions in under 1 second (picker budget)", async () => {
    const paths = Array.from({ length: 200 }, (_, i) =>
      join(FIXTURES, SESSIONS[i % SESSIONS.length] ?? ""),
    );
    const summarizeAll = async () => {
      for (let i = 0; i < paths.length; i += 8) {
        await Promise.all(paths.slice(i, i + 8).map(summarize));
      }
    };
    // One untimed round first: the OS's first look at freshly written files (e.g. virus
    // scanning on Windows) once took 1.5 s here, versus 0.3–0.6 s normally.
    await summarizeAll();
    const started = performance.now();
    await summarizeAll();

    expect(performance.now() - started).toBeLessThan(1000);
  });
});
