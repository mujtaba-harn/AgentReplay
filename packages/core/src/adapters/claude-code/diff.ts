import type { ReplayEvent } from "../../types.js";
import { editResultSchema } from "./schema.js";

type Diff = NonNullable<ReplayEvent["diff"]>;

// Same rule Claude Code uses for its own totalLinesAdded, so our totals match its cost-state.
function newFileLines(text: string): number {
  return text.split("\n").length;
}

/** Before/after text and line counts for an Edit or Write, from Claude Code's ready-made patch. */
export function diffOf(toolUseResult: unknown): Diff | undefined {
  const result = editResultSchema.safeParse(toolUseResult);
  if (!result.success) return undefined;
  const r = result.data;
  if (r.type === "create") {
    const after = r.content ?? "";
    return { before: "", after, added: newFileLines(after), removed: 0 };
  }
  if (r.structuredPatch === undefined) return undefined;
  const lines = r.structuredPatch.flatMap((hunk) => hunk.lines);
  return {
    // An Edit records just the replaced snippet; a Write replaces the whole file.
    before: r.oldString ?? r.originalFile ?? "",
    after: r.newString ?? r.content ?? "",
    added: lines.filter((line) => line.startsWith("+")).length,
    removed: lines.filter((line) => line.startsWith("-")).length,
  };
}
