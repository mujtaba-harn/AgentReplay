// How Claude Code tool calls become timeline events. Tool names verified against test/fixtures.
import type { EventKind } from "../../types.js";
import type { ContentBlock } from "./schema.js";
import { shortPath } from "./text.js";

type ToolInput = Readonly<Record<string, unknown>>;

export const TOOL_TO_KIND: Readonly<Record<string, EventKind>> = {
  Read: "read",
  Edit: "edit",
  MultiEdit: "edit",
  Write: "write",
  Bash: "command",
  PowerShell: "command",
  Grep: "search",
  Glob: "search",
  TaskCreate: "task",
  TaskUpdate: "task",
  Agent: "subagent",
};

/** Kinds whose result is worth keeping. Reads return whole files and edits a stock sentence. */
export const KINDS_WITH_OUTPUT: ReadonlySet<EventKind> = new Set(["command", "search", "subagent"]);

function field(input: ToolInput, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function firstLine(text: string | undefined): string | undefined {
  return text?.split("\n")[0]?.trim();
}

// `cd "<project>" && npm test` should read "Ran npm test"; the full command stays in `text`.
const LEADING_CD = /^cd\s+("[^"]*"|'[^']*'|\S+)\s*(&&|;)\s*/;

function commandTitle(input: ToolInput): string {
  const command = firstLine(field(input, "command"))?.replace(LEADING_CD, "");
  return `Ran ${command || "a command"}`;
}

const TITLES: Readonly<Record<string, (input: ToolInput, file: string | undefined) => string>> = {
  Read: (_, file) => `Read ${file ?? "a file"}`,
  Edit: (_, file) => `Edited ${file ?? "a file"}`,
  MultiEdit: (_, file) => `Edited ${file ?? "a file"}`,
  Write: (_, file) => `Wrote ${file ?? "a file"}`,
  Bash: commandTitle,
  PowerShell: commandTitle,
  Grep: (input) => `Searched for "${field(input, "pattern") ?? "text"}"`,
  Glob: (input) => `Looked for files ${field(input, "pattern") ?? ""}`.trim(),
  TaskCreate: (input) => `Added task: ${field(input, "subject") ?? "untitled"}`,
  TaskUpdate: (input) =>
    `Marked task ${field(input, "taskId") ?? ""} ${(field(input, "status") ?? "updated").replaceAll("_", " ")}`,
  Agent: (input) => `Started subagent: ${field(input, "description") ?? "task"}`,
};

export function toolTitle(name: string, input: ToolInput, file: string | undefined): string {
  return TITLES[name]?.(input, file === undefined ? undefined : shortPath(file)) ?? name;
}

/** The command text shown in step detail, for kinds where that is meaningful. */
export function toolText(name: string, input: ToolInput): string | undefined {
  if (TOOL_TO_KIND[name] === "command") return field(input, "command");
  if (TOOL_TO_KIND[name] === "subagent") return field(input, "prompt");
  return undefined;
}

/**
 * Path relative to the session's working folder, with "/" separators.
 * Case-insensitive prefix match, because Windows logs mix drive-letter case (C:\ vs c:\).
 */
export function relativeFile(input: ToolInput, cwd: string | undefined): string | undefined {
  const file = field(input, "file_path");
  if (file === undefined) return undefined;
  const base = cwd?.replace(/[\\/]+$/, "");
  const inside =
    base !== undefined &&
    file.toLowerCase().startsWith(base.toLowerCase()) &&
    /[\\/]/.test(file.charAt(base.length));
  return (inside ? file.slice(base.length + 1) : file).replaceAll("\\", "/");
}

export function resultText(block: ContentBlock): string {
  const content = block.content;
  if (content === undefined) return "";
  if (typeof content === "string") return content;
  return content.map((part) => part.text ?? "").join("\n");
}
