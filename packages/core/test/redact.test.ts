import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readEvents } from "../src/adapters/claude-code/read-events.js";
import { readSession } from "../src/adapters/claude-code/read-session.js";
import { HIDDEN_FILE, redact } from "../src/redact.js";
import { FAKE_SECRETS, restoreFakeSecrets } from "./support/public-fixtures.ts";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** Small deterministic random generator so the "random wrapping" test is repeatable. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const WRAPPERS: readonly ((s: string) => string)[] = [
  (s) => s,
  (s) => `"${s}"`,
  (s) => `'${s}'`,
  (s) => `export API_KEY=${s}`,
  (s) => `{"token": "${s}"}`,
  (s) => `curl -H "Authorization: Bearer ${s}" https://api.example.com`,
  (s) => `line one\n${s}\nline three`,
  (s) => `Here is my key ${s}, please keep it safe.`,
  (s) => `const config = { secret: "${s}" };`,
  (s) => `(${s})`,
];

const BENIGN: readonly string[] = [
  "Read TASK.md and complete it fully.",
  "src/adapters/claude-code/read-events.ts",
  "C:/Users/demo-user/AppData/Local/Temp/agentreplay-locate-x1/projects/a.jsonl",
  "aaaaaaaa-1111-4111-8111-111111111111",
  "e7756c5b2a9f0c3d4e5f60718293a4b5c6d7e8f9",
  "https://example.com/docs?page=2&sort=asc",
  "const TOKEN = getToken();",
  "maxTokens: 64000",
  "sk-learn is a Python library",
  "The password must be at least 8 characters long.",
  "node --test 2>&1 | grep -E '^(not )?ok'",
  "git@github.com:mujtaba/agentreplay.git",
  'const STORAGE_KEY = "habit-tracker-v1";',
  'const STORAGE_KEY = "habitTracker.v1";',
  'var BUDGETS_KEY = "expense-tracker.budgets";',
];

describe("redact on single strings", () => {
  it.each(FAKE_SECRETS.map((s) => [s.placeholder, s.value]))("hides %s", (_, secret) => {
    const result = redact(`value: ${secret}`);

    expect(result.text).not.toContain(secret);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("keeps a short hint: the known prefix and the last 4 characters", () => {
    const stripe = FAKE_SECRETS.find((s) => s.placeholder === "{{FAKE_STRIPE_KEY}}")?.value ?? "";

    expect(redact(stripe).text).toBe(`sk_live_••••••••${stripe.slice(-4)}`);
  });

  it("hides only the password of a database address", () => {
    const url = FAKE_SECRETS.find((s) => s.placeholder === "{{FAKE_DB_URL}}")?.value ?? "";

    expect(redact(url).text).toBe("postgres://demo_user:••••••••@db.example.com:5432/app");
  });

  it("hides setting values that look like passwords, not names", () => {
    expect(redact("DB_PASSWORD=Abc123_Xyz789").text).toBe("DB_PASSWORD=••••••••");
    expect(redact('{"password": "hunter2hunter2"}').text).toBe('{"password": "••••••••"}');
  });

  it("hides whole private key blocks", () => {
    const block = [
      "-----BEGIN",
      "RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----",
    ].join(" ");

    expect(redact(`key:\n${block}\nend`).text).toBe("key:\n[hidden: private key]\nend");
  });

  it("hides long random-looking strings of unknown formats", () => {
    const unknownKey = "Zq8xK2mP9vL4nR7tY1wB6cF3hJ5gD0sA";

    expect(redact(`apiKey ${unknownKey}`).text).not.toContain(unknownKey);
  });

  it.each(BENIGN)("leaves ordinary text alone: %s", (text) => {
    expect(redact(text)).toMatchObject({ text, count: 0 });
  });
});

describe("redact survives random wrapping", () => {
  it("hides every fake key in 200 random surroundings", () => {
    const random = seeded(42);
    for (let i = 0; i < 200; i++) {
      const secret = FAKE_SECRETS[Math.floor(random() * FAKE_SECRETS.length)]?.value ?? "";
      const wrap = WRAPPERS[Math.floor(random() * WRAPPERS.length)] ?? ((s: string) => s);
      const out = redact(wrap(secret)).text;

      expect(out).not.toContain(secret);
      // No long piece of the secret either. For a database address only the password is secret.
      const piece = secret.includes("://")
        ? (/:([^:@/]+)@/.exec(secret)?.[1] ?? secret)
        : secret.slice(-16, -4);
      expect(out).not.toContain(piece);
    }
  });
});

describe("redaction inside parsing", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "agentreplay-redact-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("no fake key survives anywhere in the secrets session", async () => {
    const path = join(dir, "secrets.jsonl");
    const raw = readFileSync(join(FIXTURES, "08-secrets-fake.jsonl"), "utf8");
    writeFileSync(path, restoreFakeSecrets(raw));

    const session = await readSession(path);
    const everything = JSON.stringify(session.events);

    for (const secret of FAKE_SECRETS) expect(everything).not.toContain(secret.value);
    expect(session.redactions).toBeGreaterThan(0);
  });

  it("replaces the content of sensitive files entirely", async () => {
    const path = join(dir, "env-write.jsonl");
    const base = { timestamp: "2026-01-01T10:00:00.000Z", cwd: "/home/dev/app" };
    const lines = [
      {
        ...base,
        type: "assistant",
        uuid: "a1",
        message: {
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Write",
              input: { file_path: "/home/dev/app/.env.local", content: "DEBUG=1\nNAME=demo" },
            },
          ],
        },
      },
      {
        ...base,
        type: "user",
        uuid: "u1",
        message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "File created" }] },
        toolUseResult: { type: "create", content: "DEBUG=1\nNAME=demo" },
      },
    ];
    writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n"));

    const { events } = await readEvents(path);
    const write = events.find((e) => e.kind === "write");

    expect(write?.file).toBe(".env.local");
    expect(write?.diff).toMatchObject({ before: HIDDEN_FILE, after: HIDDEN_FILE, added: 2 });
  });
});
