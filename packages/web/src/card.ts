// Data for the recap card (PRD US-5). Only counts and step kinds: never code or file contents.
import type { EventKind, ReplayEvent, ReplaySession } from "@agentreplay/core";
import { formatCost } from "./format";

export type BarKind = "edit" | "command" | "error" | "other";

export interface CardStat {
  label: string;
  value: string;
  /** Second value in a contrasting colour, e.g. lines removed. */
  extra?: string;
}

/** More bars than this would be thinner than a pixel on a 1080 px card. */
export const MAX_STRIP_BARS = 300;

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

/** The four stats the card shows by default (F1.21 lets the user choose others). */
export function cardStats({ stats }: ReplaySession): CardStat[] {
  return [
    { label: "Files changed", value: thousands(stats.filesChanged) },
    {
      label: "Lines",
      value: `+${thousands(stats.linesAdded)}`,
      extra: `−${thousands(stats.linesRemoved)}`,
    },
    { label: "Tool calls", value: thousands(stats.toolCalls) },
    { label: "Cost", value: formatCost(stats.costUsd) },
  ];
}
