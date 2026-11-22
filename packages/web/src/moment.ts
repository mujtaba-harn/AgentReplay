// F1.22: the card's "biggest moment" — first fixed error › largest edit › longest command.
// Deterministic, and worded from counts and kinds only: never code, commands or folders.
import type { EventKind, ReplayEvent } from "@agentreplay/core";
import { failedStep, fixedBy } from "./errors";

export interface Moment {
  headline: string;
  /** 1-based, as the step list shows it. */
  step: number;
}

type Rule = (events: readonly ReplayEvent[], showFiles: boolean) => Moment | undefined;

const NOUN: Readonly<Partial<Record<EventKind, string>>> = {
  command: "command",
  edit: "edit",
  write: "file write",
  read: "file read",
  search: "search",
};

const fileName = (path: string): string => path.split(/[\\/]/).at(-1) ?? path;
const inFile = (event: ReplayEvent, showFiles: boolean): string =>
  showFiles && event.file !== undefined ? ` in ${fileName(event.file)}` : "";

/** A short span such as 45s, 3m 20s or 1h 2m. */
export function formatSpan(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const firstFixedError: Rule = (events, showFiles) => {
  for (let i = 0; i < events.length; i++) {
    const fix = fixedBy(events, i);
    const failed = failedStep(events, i);
    if (fix === undefined || !failed) continue;
    const retries = events.slice(i + 1, fix).filter((e) => e.kind === failed.kind).length;
    const tries = retries === 0 ? "on the next try" : `after ${retries + 1} failed tries`;
    const noun = NOUN[failed.kind] ?? "step";
    return {
      headline: `Fixed a failing ${noun}${inFile(failed, showFiles)} ${tries}`,
      step: fix + 1,
    };
  }
  return undefined;
};

const largestEdit: Rule = (events, showFiles) => {
  let best: number | undefined;
  let bestSize = 0;
  events.forEach((event, i) => {
    const size = (event.diff?.added ?? 0) + (event.diff?.removed ?? 0);
    if (event.diff && size > bestSize) [best, bestSize] = [i, size];
  });
  const event = best === undefined ? undefined : events[best];
  if (best === undefined || !event?.diff) return undefined;
  const { added, removed } = event.diff;
  return {
    headline: `Biggest change: +${added} −${removed} lines${inFile(event, showFiles)}`,
    step: best + 1,
  };
};

// Steps carry no end time, so a command's run time is the gap until the next step began.
const longestCommand: Rule = (events) => {
  let best: number | undefined;
  let bestSpan = -1;
  events.forEach((event, i) => {
    const span = (events[i + 1]?.t ?? event.t) - event.t;
    if (event.kind === "command" && span > bestSpan) [best, bestSpan] = [i, span];
  });
  if (best === undefined) return undefined;
  return { headline: `Longest command ran for ${formatSpan(bestSpan)}`, step: best + 1 };
};

const RULES: readonly Rule[] = [firstFixedError, largestEdit, longestCommand];

export function biggestMoment(
  events: readonly ReplayEvent[],
  showFiles: boolean,
): Moment | undefined {
  for (const rule of RULES) {
    const moment = rule(events, showFiles);
    if (moment) return moment;
  }
  return undefined;
}
