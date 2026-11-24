// Secret detection and masking (ARCHITECTURE.md §7). Every text that leaves core passes here.

export interface Redacted {
  text: string;
  /** How many secrets were hidden. */
  count: number;
  /** The masks that replaced them (already safe to show); lets callers count distinct secrets. */
  masks: string[];
}

export const HIDDEN_FILE = "[hidden: sensitive file]";
const HIDDEN_KEY_BLOCK = "[hidden: private key]";
const DOTS = "••••••••";
const HINT_MIN_LENGTH = 16;

/** Keeps the last 4 characters as a hint, but only when the secret is long enough to spare them. */
function mask(secret: string, prefix = ""): string {
  const body = secret.slice(prefix.length);
  const hint = secret.length >= HINT_MIN_LENGTH ? body.slice(-4) : "";
  return `${prefix}${DOTS}${hint}`;
}

interface SecretPattern {
  name: string;
  regex: RegExp;
  /** Text kept in front of the mask so the reader can tell what kind of secret it was. */
  prefix?: (match: string) => string;
}

const leading = (re: RegExp) => (match: string) => re.exec(match)?.[0] ?? "";

// Order matters: specific formats before broader ones (sk-ant- before sk-).
const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: "anthropic", regex: /\bsk-ant-[A-Za-z0-9_-]{16,}/g, prefix: () => "sk-ant-" },
  {
    name: "stripe",
    regex: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{8,}/g,
    prefix: leading(/^[rs]k_\w+?_/),
  },
  { name: "openai", regex: /\bsk-[A-Za-z0-9_-]{16,}/g, prefix: () => "sk-" },
  {
    name: "github",
    regex: /\b(?:gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
    prefix: leading(/^(?:github_pat_|gh[opsur]_)/),
  },
  // Not \b: an underscore in front (`x_AKIA…`) would hide the key from a word boundary.
  { name: "aws", regex: /(?<![A-Z0-9])AKIA[A-Z0-9]{16}(?![A-Z0-9])/g, prefix: () => "AKIA" },
  { name: "slack", regex: /\bxox[abpr]-[A-Za-z0-9-]{10,}/g, prefix: leading(/^xox[abpr]-/) },
  {
    name: "slack-webhook",
    regex: /\bhooks\.slack\.com\/services\/[A-Za-z0-9/]{8,}/g,
    prefix: () => "hooks.slack.com/services/",
  },
  { name: "google", regex: /\bAIza[0-9A-Za-z_-]{35}/g, prefix: () => "AIza" },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
];

// A secret value must be 8+ characters with no spaces or brackets, so `TOKEN = getToken()` stays.
// A backslash ends it too, so the escapes of JSON stored inside a string (`\"`) stay intact.
const VALUE = String.raw`([^\s"'(),;{}\[\]<>\\]{8,})(?=$|[\s"',;)}\]\\])`;
const ASSIGN = String.raw`\\?["']?\s*[:=]\s*\\?["']?`;
// Bounded name lengths keep matching linear on hostile input like "KEYKEYKEY…".
const UPPER_NAME = String.raw`\b[A-Z0-9_]{0,40}(?:KEY|SECRET|TOKEN|PASS|CREDENTIAL)[A-Z0-9_]{0,40}`;
const CODE_NAME = String.raw`\b\w{0,40}(?:pass|passwd|password|secret|token|api_?key|access_?key|private_?key_?id|credentials?)`;

interface ValuePattern {
  /** Group 1 is kept, group 2 is the secret. */
  regex: RegExp;
  /**
   * Only hide values mixing letters and digits, like real keys and passwords. Code is full of
   * `STORAGE_KEY = "app.expenses"`-style constants that are not secrets.
   */
  mixedOnly: boolean;
}

/** Patterns where only one captured part (the value) is the secret. */
const VALUE_PATTERNS: readonly ValuePattern[] = [
  // postgres://user:PASSWORD@host — a password in an address is always a secret.
  { regex: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/"'\\]+:)([^\s@/"'\\]+)(?=@)/gi, mixedOnly: false },
  // API_KEY=value, DB_PASSWORD: value (environment-style names)
  { regex: new RegExp(String.raw`(${UPPER_NAME}${ASSIGN})${VALUE}`, "g"), mixedOnly: true },
  // password: "value", aws_secret_access_key = value, SecretAccessKey: value (code-style names)
  { regex: new RegExp(String.raw`(${CODE_NAME}${ASSIGN})${VALUE}`, "gi"), mixedOnly: true },
  // mysql -pPASSWORD
  { regex: /(\b(?:mysql|mysqldump|mariadb)\b[^\n]{0,200}?\s-p)([^\s"']{4,})/g, mixedOnly: false },
  // curl -u user:PASSWORD
  { regex: /(\s(?:-u|--user)\s+["']?[^\s:"']+:)([^\s"']{4,})/g, mixedOnly: false },
  // Authorization: Bearer TOKEN — shorter than the 32 characters the random-token rule needs.
  { regex: /(\bBearer\s+)([A-Za-z0-9._~+/=-]{12,})/g, mixedOnly: true },
];

const mixesLettersAndDigits = (text: string): boolean => /\d/.test(text) && /[A-Za-z]/.test(text);

/**
 * Words joined by - . or _ ("habitTracker.v1", "expense-tracker.budgets") are names, not secrets:
 * every part is a plain word or a short tag like "v1". "Abc123_Xyz789" is not a name.
 */
function looksLikeName(value: string): boolean {
  const parts = value.split(/[-._]/);
  return parts.length >= 2 && parts.every((p) => /^[A-Za-z]+$/.test(p) || /^\w{1,3}$/.test(p));
}

const looksLikeSecretValue = (value: string): boolean =>
  mixesLettersAndDigits(value) && !looksLikeName(value);

const RANDOM_TOKEN = /[A-Za-z0-9+=_-]{32,}/g;
const ENTROPY_LIMIT = 4.0;

function shannonEntropy(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

// Real keys mix letters and digits; long identifiers and words usually don't.
function looksRandom(token: string): boolean {
  return mixesLettersAndDigits(token) && shannonEntropy(token) > ENTROPY_LIMIT;
}

const ZERO_WIDTH = /[​-‍⁠﻿]/g;

const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export function redact(input: string): Redacted {
  const masks: string[] = [];
  const hide = (replacement: string): string => {
    masks.push(replacement);
    return replacement;
  };
  // An invisible character inside a key would split it into pieces too short to recognise.
  let text = input.replace(ZERO_WIDTH, "").replace(PRIVATE_KEY_BLOCK, () => hide(HIDDEN_KEY_BLOCK));
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern.regex, (match) => hide(mask(match, pattern.prefix?.(match))));
  }
  for (const { regex, mixedOnly } of VALUE_PATTERNS) {
    text = text.replace(regex, (match, before: string, secret: string) => {
      if (mixedOnly && !looksLikeSecretValue(secret)) return match;
      return `${before}${hide(mask(secret))}`;
    });
  }
  text = text.replace(RANDOM_TOKEN, (token) => (looksRandom(token) ? hide(mask(token)) : token));
  return { text, count: masks.length, masks };
}

/** Redacts every string inside a parsed JSON value, reporting each mask to `onMask`. */
export function redactDeep(value: unknown, onMask: (mask: string) => void): unknown {
  if (typeof value === "string") {
    const result = redact(value);
    for (const m of result.masks) onMask(m);
    return result.text;
  }
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, onMask));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, onMask)]));
}

// Case-insensitive: Windows and macOS treat `.Env` and `.env` as the same file.
const SENSITIVE_FILES: readonly RegExp[] = [
  /^\.env(rc|\..*)?$/i,
  /\.(pem|p12|pfx|tfstate)$/i,
  // Not every `*.key`: `e.key` is everyday JavaScript, so only the usual key-file names.
  /^(master|private|server|client|tls|ssl)\.key$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^(\.git-)?credentials/i,
  /^[._]?(netrc|npmrc|pgpass)$/i,
  /^secrets\.(json|ya?ml|toml|txt)$/i,
];

const SENSITIVE_DOTFILES: readonly string[] = [".env", ".envrc", ".netrc", ".npmrc", ".pgpass"];

/**
 * `.e*` may expand to `.env`; only the shell knows, so assume it does. Checking real names keeps
 * code like `runs?.[0]` and `/.*picker/` out; `**` is Markdown bold after a full stop.
 */
function wildcardMatchesDotfile(name: string): boolean {
  if (!name.startsWith(".") || !/[*?]/.test(name) || name.includes("**")) return false;
  const escaped = name.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`, "i");
  return SENSITIVE_DOTFILES.some((file) => pattern.test(file));
}

/** Files whose content must never be shown, whatever it contains. */
export function isSensitiveFile(path: string): boolean {
  const name = path.split(/[\\/]/).at(-1) ?? "";
  return SENSITIVE_FILES.some((re) => re.test(name)) || wildcardMatchesDotfile(name);
}

export const HIDDEN_OUTPUT = "[hidden: this command read sensitive data]";
export const HIDDEN_LINE = "[hidden: line from a sensitive file]";

// Spaces, quotes, `=` and shell punctuation separate the words of a command line.
const COMMAND_WORD_BREAKS = /[\s"'`;|&<>()=]+/;

// Commands that print every environment variable (`env`, `printenv`, PowerShell's `env:` drive)
// or one by name (`echo $env:API_KEY`). Using one inside a path (`"$env:TEMP\x.js"`) or setting
// one (`$env:X = …`) prints nothing secret.
const ENV_DUMPS: readonly RegExp[] = [
  /(?:^|[;&|]\s*)(?:env|printenv|set|export -p)\s*(?:$|[;&|])/m,
  /\bprintenv\b/,
  /\b(?:gci|ls|dir|Get-ChildItem)\s+env:/i,
  /(?:^|[;&|]\s*|\b(?:echo|Write-Output|Write-Host)\s+)["']?\$env:\w+\b(?!\s*=)/im,
];

const namesSensitiveFile = (text: string): boolean =>
  text.split(COMMAND_WORD_BREAKS).some((word) => word !== "" && isSensitiveFile(word));

/**
 * True when a command line names a sensitive file (e.g. `cat .env`) or prints the environment.
 * Pattern masking only catches key-shaped values, so such a command's whole output is hidden.
 */
export function readsSensitiveFile(command: string): boolean {
  return namesSensitiveFile(command) || ENV_DUMPS.some((re) => re.test(command));
}

/** Hides the lines of a search or listing that come from a sensitive file (`.env:3:PASS=…`). */
export function hideSensitiveLines(output: string): string {
  return output
    .split("\n")
    .map((line) => (namesSensitiveFile(line.replaceAll(":", " ")) ? HIDDEN_LINE : line))
    .join("\n");
}
