// Turns a full Claude Code log line into the line we commit publicly.
// Full logs stay in test/fixtures-private/ (git-ignored); see test/fixtures/README.md.

export const KEPT_LINE_TYPES: readonly string[] = ["user", "assistant", "cost-state"];

// These carry Claude Code's system prompt, tool descriptions and request copies.
export const STUBBED_LINE_TYPES: readonly string[] = [
  "attachment",
  "api-request",
  "api-request-shape",
  "api-request-blob",
];

export const STUB = "stub";

// Strings the parser may need (linking, timing, project folder, OS); every other string is stubbed.
export const KEPT_STRING_KEYS: ReadonlySet<string> = new Set([
  "type",
  "uuid",
  "parentUuid",
  "timestamp",
  "sessionId",
  "agentId",
  "cwd",
  "version",
  "gitBranch",
  "userType",
  "entrypoint",
  "workingDirectory",
  "platform",
]);

// Assembled from pieces so the repo never stores a key-shaped string; tests put them back at runtime.
export const FAKE_SECRETS: readonly { placeholder: string; value: string }[] = [
  {
    placeholder: "{{FAKE_STRIPE_KEY}}",
    value: ["sk", "live", "FAKE51Hx9aQ2bC3dE4fG5hI6jK7lM8nO9pQ"].join("_"),
  },
  {
    placeholder: "{{FAKE_OPENAI_KEY}}",
    value: ["sk", "FAKEproj", "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"].join("-"),
  },
  {
    placeholder: "{{FAKE_GITHUB_TOKEN}}",
    value: ["ghp", "FAKE0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"].join("_"),
  },
  { placeholder: "{{FAKE_AWS_KEY_ID}}", value: ["AKIA", "FAKE1234567890AB"].join("") },
  {
    placeholder: "{{FAKE_DB_URL}}",
    value: ["postgres://demo_user", "FakePassw0rd123@db.example.com:5432/app"].join(":"),
  },
  {
    placeholder: "{{EXAMPLE_DB_URL}}",
    value: ["postgres://user", "password@host:port/database"].join(":"),
  },
];

// Shapes from ARCHITECTURE.md §7 that identify a credential on sight.
export const KEY_SHAPED_PATTERNS: readonly RegExp[] = [
  /\b[rs]k_live_[A-Za-z0-9]{8,}/,
  /\bsk-[A-Za-z0-9-]{16,}/,
  /\bgh[opsur]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{35}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/"\\]+:[^\s@/"\\]+@/,
];

export function hideFakeSecrets(text: string): string {
  return FAKE_SECRETS.reduce((out, s) => out.replaceAll(s.value, s.placeholder), text);
}

export function restoreFakeSecrets(text: string): string {
  return FAKE_SECRETS.reduce((out, s) => out.replaceAll(s.placeholder, s.value), text);
}

export function lineType(parsed: unknown): string | undefined {
  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) return undefined;
  return typeof parsed.type === "string" ? parsed.type : undefined;
}

function stubValue(value: unknown, key: string): unknown {
  if (typeof value === "string") return KEPT_STRING_KEYS.has(key) ? value : STUB;
  if (Array.isArray(value)) return value.slice(0, 1).map((item) => stubValue(item, key));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stubValue(v, k)]));
}

export function toPublicLine(line: string): string {
  const parsed: unknown = JSON.parse(line);
  const type = lineType(parsed);
  if (type !== undefined && STUBBED_LINE_TYPES.includes(type)) {
    return JSON.stringify(stubValue(parsed, ""));
  }
  return hideFakeSecrets(line);
}

/** Every string inside a value, paired with the object key it sits under. */
export function collectStrings(value: unknown, key = ""): { key: string; text: string }[] {
  if (typeof value === "string") return [{ key, text: value }];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, key));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => collectStrings(v, k));
}
