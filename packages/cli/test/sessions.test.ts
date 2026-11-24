import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findSessions, sessionAt } from "../src/sessions.js";

const FIXTURES = join(import.meta.dirname, "..", "..", "core", "test", "fixtures");

let configDir: string;

function addSession(project: string, fixture: string): string {
  const folder = join(configDir, "projects", project);
  mkdirSync(folder, { recursive: true });
  const target = join(folder, fixture);
  copyFileSync(join(FIXTURES, fixture), target);
  return target;
}

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "crafter-replay-sessions-"));
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

describe("findSessions", () => {
  it("lists every session newest first", async () => {
    addSession("a", "01-todo-app-short.jsonl");
    addSession("b", "10-habit-tracker-resumed.jsonl");
    addSession("b", "06-tiny-question.jsonl");

    const found = await findSessions({ env: { CLAUDE_CONFIG_DIR: configDir } });

    expect(found.summaries).toHaveLength(3);
    expect(found.unreadable).toBe(0);
    const starts = found.summaries.map((summary) => summary.startedAt);
    expect(starts).toEqual([...starts].sort((x, y) => y - x));
  });

  it("reports the folder it looked in when there are no sessions", async () => {
    const found = await findSessions({ env: { CLAUDE_CONFIG_DIR: configDir } });

    expect(found.summaries).toEqual([]);
    expect(found.folder).toBe(join(configDir, "projects"));
  });
});

describe("sessionAt", () => {
  it("summarizes the log at the given path", async () => {
    const path = addSession("a", "01-todo-app-short.jsonl");

    expect((await sessionAt(path))?.path).toBe(path);
  });

  it("returns undefined when there is no file at the path", async () => {
    expect(await sessionAt(join(configDir, "missing.jsonl"))).toBeUndefined();
  });
});
