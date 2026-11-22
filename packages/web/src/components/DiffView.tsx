// Loaded on demand (React.lazy): the diff library is only needed when an edit is opened.
import type { ReplayEvent } from "@agentreplay/core";
import { type Change, diffLines } from "diff";
import { useMemo } from "react";
import { ShowMore } from "./ShowMore";

type Diff = NonNullable<ReplayEvent["diff"]>;
type Sign = "+" | "-" | " ";

interface DiffLine {
  /** Position in the diff: a line's identity, since the same text can appear twice. */
  n: number;
  sign: Sign;
  text: string;
}

const MAX_DIFF_LINES = 400;
const LINE_CLASS: Readonly<Record<Sign, string>> = {
  "+": "diff-add",
  "-": "diff-remove",
  " ": "diff-same",
};

function signOf(part: Change): Sign {
  if (part.added) return "+";
  if (part.removed) return "-";
  return " ";
}

/** Unified diff lines from core's before/after text. */
export function diffRows(diff: Diff): DiffLine[] {
  return diffLines(diff.before, diff.after)
    .flatMap((part) =>
      part.value
        .replace(/\n$/, "")
        .split("\n")
        .map((text) => ({ sign: signOf(part), text })),
    )
    .map((line, n) => ({ n, ...line }));
}

export default function DiffView({ diff }: { diff: Diff }) {
  const rows = useMemo(() => diffRows(diff), [diff]);
  return (
    <ShowMore items={rows} limit={MAX_DIFF_LINES} noun="lines">
      {(visible) => (
        <pre className="diff">
          {visible.map((row) => (
            <span key={row.n} className={`diff-line ${LINE_CLASS[row.sign]}`}>
              {row.sign} {row.text}
              {"\n"}
            </span>
          ))}
        </pre>
      )}
    </ShowMore>
  );
}
