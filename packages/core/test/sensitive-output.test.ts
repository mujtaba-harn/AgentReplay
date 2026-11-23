import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEvents } from "../src/adapters/claude-code/read-events.js";
import { HIDDEN_OUTPUT, readsSensitiveFile } from "../src/redact.js";

// A plain-word password: no key pattern or entropy check would catch it.
const ENV_CONTENTS = "DB_PASSWORD=correcthorsebatterystaple\nAPI_HOST=internal.example";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agentreplay-sensitive-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A session where Claude runs one command and gets `output` back. */
async function runCommand(command: string, output: string, isError = false) {
  const ts = "2026-01-01T10:00:00.000Z";
  const lines = [
    {
      type: "assistant",
      timestamp: ts,
      uuid: "a1",
      message: {
        id: "m1",
        model: "claude-opus-5-5",
        content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command } }],
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
  ])("is true for %j", (command) => {
    expect(readsSensitiveFile(command)).toBe(true);
  });

  it.each(["npm test", "cat README.md", "echo environment", "ls src/env/"])(
    "is false for %j",
    (command) => {
      expect(readsSensitiveFile(command)).toBe(false);
    },
  );
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

  it("keeps the output of ordinary commands", async () => {
    const events = await runCommand("npm test", "12 tests passed");

    expect(events.find((e) => e.kind === "command")?.output).toBe("12 tests passed");
  });
});
