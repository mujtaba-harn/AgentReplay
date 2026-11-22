// PRD US-5: the 1080×1920 recap card. Shows counts and step kinds only — never code or file
// contents, and file names only when the user turns them on.
import type { ReplaySession } from "@agentreplay/core";
import { formatDuration } from "@agentreplay/core/format";
import { useMemo } from "react";
import {
  type BarKind,
  type CardStatId,
  cardStats,
  DEFAULT_CARD_STATS,
  stripBars,
  topFileNames,
} from "../card";
import { biggestMoment } from "../moment";

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

/** What the user chose for their card (F1.21). */
export interface CardOptions {
  theme: CardTheme;
  /** Empty means "use the session's own title". */
  title: string;
  stats: readonly CardStatId[];
  /** PRD US-5: file names are hidden unless the user turns them on. */
  showFiles: boolean;
}

export const defaultCardOptions = (): CardOptions => ({
  theme: "terminal",
  title: "",
  stats: DEFAULT_CARD_STATS,
  showFiles: false,
});

interface RecapCardProps {
  session: ReplaySession;
  options: CardOptions;
}

export function RecapCard({ session, options }: RecapCardProps) {
  const { theme } = options;
  const bars = useMemo(() => stripBars(session.events), [session.events]);
  const files = useMemo(() => topFileNames(session.events), [session.events]);
  const moment = useMemo(
    () => biggestMoment(session.events, options.showFiles),
    [session.events, options.showFiles],
  );
  const stats = cardStats(session, options.stats);
  const steps = session.events.length;
  const title = options.title.trim() || session.title;
  return (
    <div className={`recap-card card-${theme}`}>
      <div className="card-top">
        <span className="card-agent">Claude Code</span>
        <span>{formatDuration(session.stats.durationMs)}</span>
      </div>
      <div className="card-heading">
        <span className="card-kicker">{KICKER[theme]}</span>
        <h1 className="card-title">{title}</h1>
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
      {options.showFiles && files.length > 0 && (
        <p className="card-files">
          <span className="card-files-label">Most edited</span> {files.join(" · ")}
        </p>
      )}
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
      {moment && (
        <div className="card-moment">
          <span className="card-moment-label">Biggest moment</span>
          <span className="card-moment-headline">{moment.headline}</span>
          <span className="card-moment-step">
            Step {moment.step.toLocaleString("en-US")} of {steps.toLocaleString("en-US")}
          </span>
        </div>
      )}
      <div className="card-footer">
        <span className="card-wordmark">
          agent<span>replay</span>
        </span>
        <span>Replayed locally · npx agentreplay</span>
      </div>
    </div>
  );
}
