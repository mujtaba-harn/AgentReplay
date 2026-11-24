import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEvents } from "../src/adapters/claude-code/read-events.js";
import {
  HIDDEN_LINE,
  HIDDEN_OUTPUT,
  hideSensitiveLines,
  isSensitiveFile,
  readsSensitiveFile,
} from "../src/redact.js";

// A plain-word password: no key pattern or entropy check would catch it.
const ENV_CONTENTS = "DB_PASSWORD=correcthorsebatterystaple\nAPI_HOST=internal.example";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crafter-replay-sensitive-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A session where Claude runs one command and gets `output` back. */
const runCommand = (command: string, output: string, isError = false) =>
  runTool("Bash", { command }, output, isError);

async function runTool(name: string, input: object, output: string, isError = false) {
  const ts = "2026-01-01T10:00:00.000Z";
  const lines = [
    {
      type: "assistant",
      timestamp: ts,
      uuid: "a1",
      message: {
        id: "m1",
        model: "claude-opus-5-5",
        content: [{ type: "tool_use", id: "t1", name, input }],
      },
    },
    {
      type: "user",
      timestamp: ts,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: output, is_error: isError }],
      },
    },
  ];
  const path = join(dir, "session.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n"));
  return (await readEvents(path)).events;
}

describe("readsSensitiveFile", () => {
  it.each([
    "cat .env",
    "type .env.local",
    "Get-Content .\\config\\credentials.json",
    "cat ~/.ssh/id_rsa",
    'cat "certs/server.pem" | head',
    "grep TOKEN .env.production",
    // Found by the F1.25 review:
    "cat .ENV",
    "cat .e*",
    "F=.env; cat $F",
    "cat ~/.netrc",
    "type %USERPROFILE%\\_netrc",
    "cat .npmrc",
    "cat .envrc",
    "cat ~/.pgpass",
    "cat ~/.git-credentials",
    "cat ~/.ssh/id_ed25519",
    "cat server.key",
    "openssl pkcs12 -in cert.p12",
    "cat infra/terraform.tfstate",
    "cat config/secrets.yml",
    "printenv",
    "env",
    "cd app && env | sort",
    "Get-ChildItem env:",
    "echo $env:API_KEY",
  ])("is true for %j", (command) => {
    expect(readsSensitiveFile(command)).toBe(true);
  });

  it.each([
    "npm test",
    "cat README.md",
    "echo environment",
    "ls src/env/",
    "ls ./*.ts",
    "npm run env-check",
    "$env:CLAUDE_CONFIG_DIR = 'C:\\demo'; npx crafter-replay",
    "cat src/secrets.ts",
    "git log --format=%H",
    // False alarms found in real logs:
    'node "$env:LOCALAPPDATA\\Temp\\check.js"',
    "if (e.key === 'Enter') save();",
    "That is **the key point.**",
    'node -e "console.log(JSON.parse(s).workflow_runs?.[0])"',
    "grep -E '/.*picker' src",
  ])("is false for %j", (command) => {
    expect(readsSensitiveFile(command)).toBe(false);
  });
});

describe("isSensitiveFile ignores letter case", () => {
  it.each([".Env", "SERVER.PEM", "Credentials.json"])("%s", (name) => {
    expect(isSensitiveFile(`src/${name}`)).toBe(true);
  });
});

describe("hideSensitiveLines", () => {
  it("hides only the lines that come from a sensitive file", () => {
    const output = ["src/app.ts:3:const host = 1;", ".env:3:SMTP_PASS=plainwordpass"].join("\n");

    expect(hideSensitiveLines(output)).toBe(`src/app.ts:3:const host = 1;\n${HIDDEN_LINE}`);
  });

  it("handles Windows paths", () => {
    expect(hideSensitiveLines("C:\\app\\.env:3:SMTP_PASS=plainwordpass")).toBe(HIDDEN_LINE);
  });
});

describe("output of commands that read sensitive files", () => {
  it("hides the whole output, not just key-shaped values", async () => {
    const events = await runCommand("cat .env", ENV_CONTENTS);
    const command = events.find((e) => e.kind === "command");

    expect(command?.output).toBe(HIDDEN_OUTPUT);
    expect(JSON.stringify(events)).not.toContain("correcthorse");
  });

  it("hides the error text when such a command fails", async () => {
    const events = await runCommand("cat .env", `cat: ${ENV_CONTENTS}`, true);
    const error = events.find((e) => e.kind === "error");

    expect(error?.text).toBe(HIDDEN_OUTPUT);
    expect(JSON.stringify(events)).not.toContain("correcthorse");
  });

  it("hides a search's output when it searches a sensitive file", async () => {
    const events = await runTool("Grep", { pattern: "PASS", path: ".env" }, ENV_CONTENTS);

    expect(events.find((e) => e.kind === "search")?.output).toBe(HIDDEN_OUTPUT);
  });

  it("hides the matching lines a project-wide search found in a sensitive file", async () => {
    const output = "src/db.ts:4:connect()\n.env:1:DB_PASSWORD=correcthorsebatterystaple";
    const events = await runTool("Grep", { pattern: "PASS|connect" }, output);

    expect(events.find((e) => e.kind === "search")?.output).toBe(
      `src/db.ts:4:connect()\n${HIDDEN_LINE}`,
    );
  });

  it("keeps the output of ordinary commands", async () => {
    const events = await runCommand("npm test", "12 tests passed");

    expect(events.find((e) => e.kind === "command")?.output).toBe("12 tests passed");
  });
});
