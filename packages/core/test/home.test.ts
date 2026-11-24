// F1.25 review: the OS user name (part of the home folder path) must not reach the page.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEvents } from "../src/adapters/claude-code/read-events.js";
import { summarize } from "../src/adapters/claude-code/summarize.js";
import { homeHider, projectFromLogFolder } from "../src/home.js";

describe("homeHider", () => {
  const windows = homeHider("C:\\Users\\alice");
  const posix = homeHider("/home/alice");

  it.each([
    ["C:\\Users\\alice\\AppData\\notes.txt", "~\\AppData\\notes.txt"],
    ["c:/users/Alice/app", "~/app"],
    ["cd /c/Users/alice/app && ls", "cd ~/app && ls"],
    ['"C:\\\\Users\\\\alice\\\\x"', '"~\\\\x"'],
    ["C:\\Users\\alice", "~"],
  ])("Windows: %s", (text, expected) => {
    expect(windows(text)).toBe(expected);
  });

  it("leaves other users' folders alone", () => {
    expect(windows("C:\\Users\\alicea\\x")).toBe("C:\\Users\\alicea\\x");
    expect(posix("/home/alice2/x")).toBe("/home/alice2/x");
  });

  it("POSIX: /home/alice/app", () => {
    expect(posix("cat /home/alice/app/a.ts")).toBe("cat ~/app/a.ts");
  });
});

describe("projectFromLogFolder", () => {
  it.each([
    ["C--Users-alice-Desktop-secretproj", "Desktop-secretproj"],
    ["C--Users-alice", "~"],
    ["C--work-fallback-project", "C--work-fallback-project"],
  ])("%s → %s", (folder, expected) => {
    expect(projectFromLogFolder(folder, "C:\\Users\\alice")).toBe(expected);
  });
});

describe("parsing hides the home folder", () => {
  let dir: string;
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  const home = process.platform === "win32" ? "C:\\Users\\alice" : "/home/alice";
  const sep = process.platform === "win32" ? "\\" : "/";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "crafter-replay-home-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env.HOME = saved.HOME;
    process.env.USERPROFILE = saved.USERPROFILE;
  });

  it("in file paths outside the project, prompts and the project name", async () => {
    const ts = "2026-01-01T10:00:00.000Z";
    const outside = [home, "AppData", "notes.txt"].join(sep);
    const lines = [
      {
        type: "user",
        timestamp: ts,
        uuid: "u1",
        cwd: [home, "proj"].join(sep),
        message: { role: "user", content: `Summarize ${outside}` },
      },
      {
        type: "assistant",
        timestamp: ts,
        uuid: "a1",
        cwd: [home, "proj"].join(sep),
        message: {
          id: "m1",
          model: "claude-opus-5-5",
          content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: outside } }],
        },
      },
    ];
    const path = join(dir, "session.jsonl");
    writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n"));

    const { events } = await readEvents(path);
    const summary = await summarize(path);

    expect(JSON.stringify(events)).not.toContain("alice");
    expect(events.find((e) => e.kind === "read")?.file).toBe("~/AppData/notes.txt");
    expect(summary.title).not.toContain("alice");
    expect(summary.project).toBe("proj");
  });
});
