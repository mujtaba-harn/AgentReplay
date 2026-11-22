// PRD US-5: the 1080×1920 recap card. Shows counts and step kinds only — never code or file
// contents, and no file names.
import type { ReplaySession } from "@agentreplay/core";
import { formatDuration } from "@agentreplay/core/format";
import { useMemo } from "react";
import { type BarKind, cardStats, stripBars } from "../card";

export type CardTheme = "terminal" | "violet" | "clay";

export const CARD_THEMES: readonly { value: CardTheme; label: string }[] = [
  { value: "terminal", label: "Terminal" },
  { value: "violet", label: "Violet" },
  { value: "clay", label: "Clay" },
];

const LEGEND: readonly { kind: BarKind; label: string }[] = [
  { kind: "edit", label: "edits" },
  { kind: "command", label: "commands" },
  { kind: "error", label: "errors" },
];

/** A theme's own touch above the title; only Terminal has words there. */
const KICKER: Readonly<Record<CardTheme, string>> = {
  terminal: "$ agentreplay --recap",
  violet: "",
  clay: "",
};

interface RecapCardProps {
  session: ReplaySession;
  theme: CardTheme;
}

export function RecapCard({ session, theme }: RecapCardProps) {
  const bars = useMemo(() => stripBars(session.events), [session.events]);
  const stats = cardStats(session);
  const steps = session.events.length;
  return (
    <div className={`recap-card card-${theme}`}>
      <div className="card-top">
        <span className="card-agent">Claude Code</span>
        <span>{formatDuration(session.stats.durationMs)}</span>
      </div>
      <div className="card-heading">
        <span className="card-kicker">{KICKER[theme]}</span>
        <h1 className="card-title">{session.title}</h1>
      </div>
      <div className="card-strip-block">
        <div className="card-strip">
          {bars.map((bar) => (
            <span key={bar.position} className={`card-bar bar-${bar.kind}`} />
          ))}
        </div>
        <div className="card-legend">
          <span>{steps === 1 ? "1 step" : `${steps.toLocaleString("en-US")} steps`}</span>
          <span className="card-legend-keys">
            {LEGEND.map(({ kind, label }) => (
              <span key={kind} className="card-legend-key">
                <span className={`card-swatch bar-${kind}`} />
                {label}
              </span>
            ))}
          </span>
        </div>
      </div>
      <dl className="card-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="card-stat">
            <dt>{stat.label}</dt>
            <dd>
              {stat.value}
              {stat.extra && <span className="card-stat-extra"> {stat.extra}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="card-footer">
        <span className="card-wordmark">
          agent<span>replay</span>
        </span>
        <span>Replayed locally · npx agentreplay</span>
      </div>
    </div>
  );
}
