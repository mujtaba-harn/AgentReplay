import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { locate, sessionsFolder, subagentFiles } from "../src/adapters/claude-code/locate.js";

const SESSION_A = "11111111-1111-1111-1111-111111111111";
const SESSION_B = "22222222-2222-2222-2222-222222222222";

let home: string;

function touch(...parts: string[]): string {
  const file = join(...parts);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "{}\n");
  return file;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "agentreplay-locate-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("locate", () => {
  it("finds sessions in every project folder under ~/.claude/projects", async () => {
    const projects = join(home, ".claude", "projects");
    const a = touch(projects, "C--work-todo-app", `${SESSION_A}.jsonl`);
    const b = touch(projects, "-home-dev-notes", `${SESSION_B}.jsonl`);

    const found = await locate({ homedir: home, env: {} });

    expect([...found].sort()).toEqual([a, b].sort());
  });

  it("uses CLAUDE_CONFIG_DIR instead of the home folder when set", async () => {
    const configDir = join(home, "custom-claude");
    touch(home, ".claude", "projects", "ignored", `${SESSION_A}.jsonl`);
    const wanted = touch(configDir, "projects", "proj", `${SESSION_B}.jsonl`);

    const found = await locate({ homedir: home, env: { CLAUDE_CONFIG_DIR: configDir } });

    expect(found).toEqual([wanted]);
  });

  it("treats an empty CLAUDE_CONFIG_DIR as not set", async () => {
    const wanted = touch(home, ".claude", "projects", "proj", `${SESSION_A}.jsonl`);

    const found = await locate({ homedir: home, env: { CLAUDE_CONFIG_DIR: "" } });

    expect(found).toEqual([wanted]);
  });

  it("returns an empty list when the projects folder does not exist", async () => {
    expect(await locate({ homedir: home, env: {} })).toEqual([]);
  });

  it("ignores memory, subagent logs, other files and stray files at the top level", async () => {
    const projects = join(home, ".claude", "projects");
    const project = join(projects, "proj");
    const wanted = touch(project, `${SESSION_A}.jsonl`);
    touch(project, "memory", "notes.jsonl");
    touch(project, SESSION_A, "subagents", "agent-abc123.jsonl");
    touch(project, "notes.txt");
    touch(projects, "stray.jsonl");

    const found = await locate({ homedir: home, env: {} });

    expect(found).toEqual([wanted]);
  });
});

describe("sessionsFolder", () => {
  it("is the projects folder that locate searches", () => {
    expect(sessionsFolder({ homedir: home, env: {} })).toBe(join(home, ".claude", "projects"));
    expect(sessionsFolder({ homedir: home, env: { CLAUDE_CONFIG_DIR: join(home, "c") } })).toBe(
      join(home, "c", "projects"),
    );
  });
});

describe("subagentFiles", () => {
  it("finds a session's subagent logs and skips their metadata files", async () => {
    const project = join(home, ".claude", "projects", "proj");
    const session = touch(project, `${SESSION_A}.jsonl`);
    const agent1 = touch(project, SESSION_A, "subagents", "agent-aaa.jsonl");
    const agent2 = touch(project, SESSION_A, "subagents", "agent-bbb.jsonl");
    touch(project, SESSION_A, "subagents", "agent-aaa.meta.json");
    touch(project, SESSION_B, "subagents", "agent-other.jsonl");

    const found = await subagentFiles(session);

    expect([...found].sort()).toEqual([agent1, agent2].sort());
  });

  it("returns an empty list for a session without subagents", async () => {
    const session = touch(home, ".claude", "projects", "proj", `${SESSION_A}.jsonl`);

    expect(await subagentFiles(session)).toEqual([]);
  });
});
