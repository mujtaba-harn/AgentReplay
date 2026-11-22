// The full parse of one Claude Code session: everything the UI shows, already redacted.
import { groupConsecutiveReads } from "../../group.js";
import { computeStats } from "../../stats.js";
import type { ReplaySession } from "../../types.js";
import { readSession } from "./read-session.js";
import { summaryFacts } from "./summarize.js";

export async function parse(path: string): Promise<ReplaySession> {
  const [{ summary, exactCostUsd }, session] = await Promise.all([
    summaryFacts(path),
    readSession(path),
  ]);
  // Events were timed from the first timestamped line; the summary's start can be slightly
  // earlier (cost-state's startTime), so shift them to share one origin.
  const shift = Math.max(0, (session.origin ?? summary.startedAt) - summary.startedAt);
  const events = groupConsecutiveReads(session.events).map((e) => ({ ...e, t: e.t + shift }));
  // PRD US-4: duration runs to the last event. Claude Code's own total can end a few seconds
  // earlier in resumed sessions, which would leave events past the end of the timeline.
  const durationMs = Math.max(summary.durationMs, events.at(-1)?.t ?? 0);
  const stats = computeStats({
    events: session.events,
    subagentEvents: session.subagentEvents,
    tokensByModel: session.tokensByModel,
    shortCacheWritesByModel: session.shortCacheWritesByModel,
    durationMs,
    ...(exactCostUsd === undefined ? {} : { exactCostUsd }),
  });
  return {
    ...summary,
    durationMs,
    events,
    stats,
    warnings: { skippedLines: session.skippedLines, redactions: session.redactions },
  };
}
