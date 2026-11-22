// Small text helpers shared by summarize() and readEvents().
import { timestampedLineSchema, type UserLine } from "./schema.js";

const TITLE_MAX = 60;

// Editor context VS Code adds around a prompt; it is not what the user asked.
const CONTEXT_TAGS: readonly string[] = ["ide_opened_file", "ide_selection", "system-reminder"];
// Wrappers whose content *is* the prompt (e.g. pasted text).
const WRAPPER_TAGS: readonly string[] = ["pasted_content"];

export function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    // A broken line is skipped, never fatal (CLAUDE.md: tolerant parsing).
    return undefined;
  }
}

export function timestampOf(json: unknown): number | undefined {
  const line = timestampedLineSchema.safeParse(json);
  return line.success ? Date.parse(line.data.timestamp) : undefined;
}

/** The user's own words: editor context removed, wrappers unwrapped, line breaks kept. */
export function promptText(content: UserLine["message"]["content"]): string {
  let text =
    typeof content === "string"
      ? content
      : content.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("\n");
  for (const tag of CONTEXT_TAGS) {
    text = text.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}[^>]*>`, "g"), " ");
  }
  for (const tag of WRAPPER_TAGS) {
    text = text.replace(new RegExp(`</?${tag}[^>]*>`, "g"), " ");
  }
  return text.trim();
}

/** One line, at most 60 characters, cut at a word boundary with "…". */
export function toTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= TITLE_MAX) return line;
  let cut = line.slice(0, TITLE_MAX - 1);
  if (line[TITLE_MAX - 1] !== " " && cut.includes(" ")) cut = cut.slice(0, cut.lastIndexOf(" "));
  return `${cut.trimEnd()}…`;
}
