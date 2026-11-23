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
  { name: "aws", regex: /\bAKIA[A-Z0-9]{16}\b/g, prefix: () => "AKIA" },
  { name: "slack", regex: /\bxox[abpr]-[A-Za-z0-9-]{10,}/g, prefix: leading(/^xox[abpr]-/) },
  { name: "google", regex: /\bAIza[0-9A-Za-z_-]{35}/g, prefix: () => "AIza" },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
];

// A secret value must be 8+ characters with no spaces or brackets, so `TOKEN = getToken()` stays.
const VALUE = String.raw`([^\s"'(),;{}\[\]<>]{8,})(?=$|[\s"',;)}\]])`;
const ASSIGN = String.raw`["']?\s*[:=]\s*["']?`;

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
  {
    regex: new RegExp(
      String.raw`(\b[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*${ASSIGN})${VALUE}`,
      "g",
    ),
    mixedOnly: true,
  },
  // password: "value", apiKey = value, csrfToken: value (code-style names)
  {
    regex: new RegExp(
      String.raw`(\b\w*(?:password|passwd|secret|token|api_?key)${ASSIGN})${VALUE}`,
      "gi",
    ),
    mixedOnly: true,
  },
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

const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export function redact(input: string): Redacted {
  const masks: string[] = [];
  const hide = (replacement: string): string => {
    masks.push(replacement);
    return replacement;
  };
  let text = input.replace(PRIVATE_KEY_BLOCK, () => hide(HIDDEN_KEY_BLOCK));
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

const SENSITIVE_FILES: readonly RegExp[] = [/^\.env(\..*)?$/, /\.pem$/, /^id_rsa/, /^credentials/];

/** Files whose content must never be shown, whatever it contains. */
export function isSensitiveFile(path: string): boolean {
  const name = path.split(/[\\/]/).at(-1) ?? "";
  return SENSITIVE_FILES.some((re) => re.test(name));
}

export const HIDDEN_OUTPUT = "[hidden: this command read a sensitive file]";

// Spaces, quotes and shell punctuation separate the words of a command line.
const COMMAND_WORD_BREAKS = /[\s"'`;|&<>()]+/;

/**
 * True when a command line names a sensitive file (e.g. `cat .env`). Pattern masking only
 * catches key-shaped values, so such a command's whole output is hidden instead.
 */
export function readsSensitiveFile(command: string): boolean {
  return command.split(COMMAND_WORD_BREAKS).some((word) => word !== "" && isSensitiveFile(word));
}
