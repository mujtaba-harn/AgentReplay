// Timeline shaping: merge runs of reads, and squeeze long idle pauses for drawing the track.
import type { ReplayEvent, TokenUsage } from "./types.js";

/** PRD US-2: idle gaps longer than a minute are compressed. */
export const IDLE_GAP_MAX_MS = 60_000;

function sumTokens(events: readonly ReplayEvent[]): TokenUsage | undefined {
  const withTokens = events.filter((e) => e.tokens !== undefined);
  if (withTokens.length === 0) return undefined;
  return withTokens.reduce<TokenUsage>(
    (sum, e) => ({
      in: sum.in + (e.tokens?.in ?? 0),
      out: sum.out + (e.tokens?.out ?? 0),
      cacheRead: sum.cacheRead + (e.tokens?.cacheRead ?? 0),
      cacheWrite: sum.cacheWrite + (e.tokens?.cacheWrite ?? 0),
    }),
    { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
  );
}

function mergeReads(first: ReplayEvent, rest: readonly ReplayEvent[]): ReplayEvent {
  if (rest.length === 0) return first;
  const run = [first, ...rest];
  // File names only — never contents — so the list is safe to show.
  const files = run.map((e) => e.file ?? e.title.replace(/^Read /, ""));
  const merged: ReplayEvent = {
    id: first.id,
    kind: "read",
    t: first.t,
    title: `Read ${run.length} files`,
    text: files.join("\n"),
    groupSize: run.length,
  };
  const model = run.find((e) => e.model !== undefined)?.model;
  if (model !== undefined) merged.model = model;
  const tokens = sumTokens(run);
  if (tokens !== undefined) merged.tokens = tokens;
  return merged;
}

/** Two or more reads in a row become one "Read N files" step. Returns a new array. */
export function groupConsecutiveReads(events: readonly ReplayEvent[]): ReplayEvent[] {
  const result: ReplayEvent[] = [];
  let run: ReplayEvent[] = [];
  const flush = () => {
    const [first, ...rest] = run;
    if (first !== undefined) result.push(mergeReads(first, rest));
    run = [];
  };
  for (const event of events) {
    if (event.kind === "read") {
      run.push(event);
      continue;
    }
    flush();
    result.push(event);
  }
  flush();
  return result;
}

/** Event times for drawing the track, with every pause capped at a minute. Real `t` is untouched. */
export function compressedTimes(events: readonly ReplayEvent[]): number[] {
  const times: number[] = [];
  let previousReal = events[0]?.t ?? 0;
  let shown = previousReal;
  for (const event of events) {
    shown += Math.min(event.t - previousReal, IDLE_GAP_MAX_MS);
    previousReal = event.t;
    times.push(shown);
  }
  return times;
}
