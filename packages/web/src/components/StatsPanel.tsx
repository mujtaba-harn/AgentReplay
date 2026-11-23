// PRD US-4 stats and the US-6 privacy notice. Every number comes from core's stats.ts as-is.
import type { SessionStats, SharedSession } from "@agentreplay/core";
import { formatDuration } from "@agentreplay/core/format";
import { formatCost, formatCount } from "../format";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function tokenSummary({ tokens }: SessionStats): string {
  const cache = tokens.cacheRead + tokens.cacheWrite;
  return `${formatCount(tokens.in)} in · ${formatCount(tokens.out)} out · ${formatCount(cache)} cache`;
}

/** The tiles, in display order. */
const TILES: readonly { label: string; value: (stats: SessionStats) => string }[] = [
  { label: "Duration", value: (s) => formatDuration(s.durationMs) },
  { label: "Files changed", value: (s) => String(s.filesChanged) },
  { label: "Lines", value: (s) => `+${s.linesAdded} −${s.linesRemoved}` },
  { label: "Tool calls", value: (s) => String(s.toolCalls) },
  { label: "Tokens", value: tokenSummary },
  { label: "Cost", value: (s) => `${formatCost(s.costUsd)} ${s.costSource}` },
];

export function StatsPanel({ session }: { session: SharedSession }) {
  const { stats, warnings } = session;
  return (
    <section className="stats" aria-label="Session stats">
      <dl className="stat-tiles">
        {TILES.map(({ label, value }) => (
          <div key={label} className="stat-tile">
            <dt>{label}</dt>
            <dd>{value(stats)}</dd>
          </div>
        ))}
      </dl>
      {warnings.redactions > 0 && (
        <p className="privacy-notice">
          We hid {plural(warnings.redactions, "possible secret")} before showing this session.
        </p>
      )}
      {warnings.skippedLines > 0 && (
        <p className="skipped-notice">
          {plural(warnings.skippedLines, "line")} of the log couldn't be read and{" "}
          {warnings.skippedLines === 1 ? "was" : "were"} skipped.
        </p>
      )}
    </section>
  );
}
