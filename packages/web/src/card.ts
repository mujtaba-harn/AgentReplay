// Data for the recap card (PRD US-5). Only counts, step kinds and (if asked) file names:
// never code or file contents.
import type { EventKind, ReplayEvent, ReplaySession } from "@agentreplay/core";
import { formatDuration } from "@agentreplay/core/format";
import { formatCost, formatCount } from "./format";

export type BarKind = "edit" | "command" | "error" | "other";

export interface CardStat {
  label: string;
  value: string;
  /** Second value in a contrasting colour, e.g. lines removed. */
  extra?: string;
}

/** More bars than this would be thinner than a pixel on a 1080 px card. */
export const MAX_STRIP_BARS = 300;
/** The card has room for a 2×2 grid. */
export const MAX_CARD_STATS = 4;
const TOP_FILES = 3;

const BAR_OF_KIND: Readonly<Partial<Record<EventKind, BarKind>>> = {
  edit: "edit",
  write: "edit",
  command: "command",
  error: "error",
};

/** When steps share a bar, the most telling one colours it: an error must never disappear. */
const BAR_PRIORITY: readonly BarKind[] = ["error", "edit", "command", "other"];

const barOf = (event: ReplayEvent): BarKind => BAR_OF_KIND[event.kind] ?? "other";

function strongest(kinds: readonly BarKind[]): BarKind {
  return BAR_PRIORITY.find((kind) => kinds.includes(kind)) ?? "other";
}

function barKinds(events: readonly ReplayEvent[]): BarKind[] {
  const kinds = events.map(barOf);
  if (kinds.length <= MAX_STRIP_BARS) return kinds;
  const perBar = kinds.length / MAX_STRIP_BARS;
  return Array.from({ length: MAX_STRIP_BARS }, (_, bar) =>
    strongest(kinds.slice(Math.floor(bar * perBar), Math.floor((bar + 1) * perBar))),
  );
}

/**
 * One bar per step, or per group of neighbouring steps in a long session. `position` is the
 * bar's place in the strip, which is all that identifies it.
 */
export function stripBars(events: readonly ReplayEvent[]): { position: number; kind: BarKind }[] {
  return barKinds(events).map((kind, position) => ({ position, kind }));
}

const thousands = (n: number): string => n.toLocaleString("en-US");
const countKind = (session: ReplaySession, kind: EventKind): number =>
  session.events.filter((e) => e.kind === kind).length;

/** Every stat the card can show, in the order it shows them. */
export const CARD_STATS = [
  {
    id: "duration",
    stat: (s: ReplaySession): CardStat => ({
      label: "Duration",
      value: formatDuration(s.stats.durationMs),
    }),
  },
  {
    id: "files",
    stat: (s: ReplaySession): CardStat => ({
      label: "Files changed",
      value: thousands(s.stats.filesChanged),
    }),
  },
  {
    id: "lines",
    stat: (s: ReplaySession): CardStat => ({
      label: "Lines",
      value: `+${thousands(s.stats.linesAdded)}`,
      extra: `−${thousands(s.stats.linesRemoved)}`,
    }),
  },
  {
    id: "toolCalls",
    stat: (s: ReplaySession): CardStat => ({
      label: "Tool calls",
      value: thousands(s.stats.toolCalls),
    }),
  },
  {
    id: "tokens",
    stat: (s: ReplaySession): CardStat => {
      const t = s.stats.tokens;
      return { label: "Tokens", value: formatCount(t.in + t.out + t.cacheRead + t.cacheWrite) };
    },
  },
  {
    id: "steps",
    stat: (s: ReplaySession): CardStat => ({ label: "Steps", value: thousands(s.events.length) }),
  },
  {
    id: "errors",
    stat: (s: ReplaySession): CardStat => ({
      label: "Errors",
      value: thousands(countKind(s, "error")),
    }),
  },
  {
    id: "cost",
    stat: (s: ReplaySession): CardStat => ({ label: "Cost", value: formatCost(s.stats.costUsd) }),
  },
] as const;

export type CardStatId = (typeof CARD_STATS)[number]["id"];

export const DEFAULT_CARD_STATS: readonly CardStatId[] = ["files", "lines", "toolCalls", "cost"];

/** The chosen stats, in the card's fixed order, at most four. */
export function cardStats(session: ReplaySession, chosen: readonly CardStatId[]): CardStat[] {
  return CARD_STATS.filter(({ id }) => chosen.includes(id))
    .slice(0, MAX_CARD_STATS)
    .map(({ stat }) => stat(session));
}

/**
 * Longer titles get smaller type so the whole title fits in three lines, in every theme.
 * Sized for monospace (the widest theme font); found on a real card where 96px cut a title off.
 */
const TITLE_SIZES: readonly { maxLetters: number; px: number }[] = [
  { maxLetters: 32, px: 96 },
  { maxLetters: 44, px: 84 },
  { maxLetters: 60, px: 62 },
  { maxLetters: Number.POSITIVE_INFINITY, px: 46 },
];

export function titleSize(title: string): number {
  return TITLE_SIZES.find((size) => title.length <= size.maxLetters)?.px ?? 46;
}

/** The most-edited files' names, without folders (PRD US-5: shown only if the user opts in). */
export function topFileNames(events: readonly ReplayEvent[]): string[] {
  const editsPerPath = new Map<string, number>();
  for (const { kind, file } of events) {
    if (file === undefined || BAR_OF_KIND[kind] !== "edit") continue;
    editsPerPath.set(file, (editsPerPath.get(file) ?? 0) + 1);
  }
  return [...editsPerPath.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_FILES)
    .map(([path]) => path.split(/[\\/]/).at(-1) ?? path);
}
