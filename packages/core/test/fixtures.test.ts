import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  collectStrings,
  FAKE_SECRETS,
  KEPT_LINE_TYPES,
  KEPT_STRING_KEYS,
  KEY_SHAPED_PATTERNS,
  lineType,
  restoreFakeSecrets,
  STUB,
  STUBBED_LINE_TYPES,
} from "./support/public-fixtures.ts";

const PUBLIC_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));
const PRIVATE_DIR = fileURLToPath(new URL("./fixtures-private/", import.meta.url));
const SECRETS_FIXTURE = "08-secrets-fake.jsonl";
const FIXTURES = readdirSync(PUBLIC_DIR).filter((name) => name.endsWith(".jsonl"));
// Hand-written fixtures (e.g. 11-vscode-pasted-prompt) have no full log to compare against.
const RECORDED = FIXTURES.filter((name) => existsSync(join(PRIVATE_DIR, name)));

function readLines(dir: string, name: string): string[] {
  return readFileSync(join(dir, name), "utf8")
    .split("\n")
    .filter((line) => line !== "");
}

function isStubbed(parsed: unknown): boolean {
  const type = lineType(parsed);
  return type !== undefined && STUBBED_LINE_TYPES.includes(type);
}

describe("committed fixtures", () => {
  it("cover at least 10 sessions", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(FIXTURES)("%s: every line is JSON with a type", (name) => {
    for (const line of readLines(PUBLIC_DIR, name)) {
      expect(lineType(JSON.parse(line))).toBeTypeOf("string");
    }
  });

  it.each(FIXTURES)("%s: contains no key-shaped strings", (name) => {
    const text = readFileSync(join(PUBLIC_DIR, name), "utf8");
    for (const pattern of KEY_SHAPED_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it.each(FIXTURES)("%s: replaced lines hold no real text", (name) => {
    const stubbed = readLines(PUBLIC_DIR, name)
      .map((line): unknown => JSON.parse(line))
      .filter(isStubbed);
    for (const { key, text } of stubbed.flatMap((parsed) => collectStrings(parsed))) {
      if (!KEPT_STRING_KEYS.has(key)) expect(text).toBe(STUB);
    }
  });

  it("secrets fixture gets its fake keys back at runtime", () => {
    const text = restoreFakeSecrets(readFileSync(join(PUBLIC_DIR, SECRETS_FIXTURE), "utf8"));
    for (const secret of FAKE_SECRETS) expect(text).toContain(secret.value);
    expect(text).not.toContain("{{FAKE_");
  });
});

describe.skipIf(!existsSync(PRIVATE_DIR))(
  "public fixtures vs full logs in fixtures-private/",
  () => {
    it.each(RECORDED)("%s: same line types in the same order", (name) => {
      const types = (dir: string) => readLines(dir, name).map((line) => lineType(JSON.parse(line)));
      expect(types(PUBLIC_DIR)).toEqual(types(PRIVATE_DIR));
    });

    it.each(RECORDED)("%s: user, assistant and cost-state lines are unchanged", (name) => {
      const full = readLines(PRIVATE_DIR, name);
      readLines(PUBLIC_DIR, name).forEach((line, i) => {
        const type = lineType(JSON.parse(line));
        if (type === undefined || !KEPT_LINE_TYPES.includes(type)) return;
        expect(restoreFakeSecrets(line)).toBe(full[i]);
      });
    });

    it("no Claude Code system prompt text survives", () => {
      const textLines = (parsed: readonly unknown[]) =>
        new Set(
          parsed
            .flatMap((p) => collectStrings(p))
            .flatMap(({ text }) => text.split("\n"))
            .map((l) => l.trim())
            .filter((l) => l.length >= 60),
        );
      const fullParsed = RECORDED.flatMap((name) =>
        readLines(PRIVATE_DIR, name).map((line): unknown => JSON.parse(line)),
      );
      const conversation = textLines(fullParsed.filter((p) => !isStubbed(p)));
      const systemOnly = [...textLines(fullParsed.filter(isStubbed))].filter(
        (l) => !conversation.has(l),
      );
      const publicText = textLines(
        FIXTURES.flatMap((name) =>
          readLines(PUBLIC_DIR, name).map((line): unknown => JSON.parse(line)),
        ),
      );

      expect(systemOnly.length).toBeGreaterThan(100);
      expect(systemOnly.filter((l) => publicText.has(l))).toEqual([]);
    });
  },
);
