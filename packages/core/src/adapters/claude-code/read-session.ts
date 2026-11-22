// Internal: a session's own events plus its subagents. Phase 1 shows each subagent as a single
// step with an activity summary (decision 4d "C"); its steps stay hidden but still count in stats.
import { access } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { EventKind, ReplayEvent } from "../../types.js";
import { type EventsRead, readEvents } from "./read-events.js";
import { mergeTokens } from "./tokens.js";

export interface SessionRead extends Omit<EventsRead, "subagentIds"> {
  /** Every subagent step, for stats only; not on the timeline. */
  subagentEvents: ReplayEvent[];
}

export type SubagentFinder = (agentId: string) => Promise<string | undefined>;

/** Finds `<session-id>/subagents/agent-<agentId>.jsonl` next to the session log. */
export function subagentFinder(sessionPath: string): SubagentFinder {
  const dir = join(dirname(sessionPath), basename(sessionPath, ".jsonl"), "subagents");
  return async (agentId) => {
    const path = join(dir, `agent-${agentId}.jsonl`);
    try {
      await access(path);
      return path;
    } catch {
      // No log for this subagent (e.g. it never started): show the step without a summary.
      return undefined;
    }
  };
}

const ACTIVITY: readonly [kind: EventKind, one: string, many: string][] = [
  ["read", "read 1 file", "read # files"],
  ["edit", "made 1 edit", "made # edits"],
  ["write", "wrote 1 file", "wrote # files"],
  ["command", "ran 1 command", "ran # commands"],
  ["search", "searched once", "searched # times"],
  ["error", "hit 1 error", "hit # errors"],
];

/** e.g. "Read 11 files · ran 4 commands · searched 2 times". */
export function describeActivity(events: readonly ReplayEvent[]): string {
  const parts = ACTIVITY.flatMap(([kind, one, many]) => {
    const n = events.filter((e) => e.kind === kind).length;
    if (n === 0) return [];
    return [n === 1 ? one : many.replace("#", String(n))];
  });
  const text = parts.length > 0 ? parts.join(" · ") : "did no tool work";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function readSession(
  path: string,
  findSubagent: SubagentFinder = subagentFinder(path),
): Promise<SessionRead> {
  const { subagentIds, ...main } = await readEvents(path);
  const session: SessionRead = { ...main, subagentEvents: [] };
  for (const event of main.events.filter((e) => e.kind === "subagent")) {
    const agentId = subagentIds[event.id];
    const subPath = agentId === undefined ? undefined : await findSubagent(agentId);
    if (subPath === undefined) continue;
    // Subagents of subagents are not followed; Claude Code does not nest them today.
    const sub = await readEvents(subPath);
    const report = event.output === undefined ? "" : `\n\n${event.output}`;
    event.output = `${describeActivity(sub.events)}${report}`;
    session.subagentEvents.push(...sub.events);
    session.skippedLines += sub.skippedLines;
    session.redactions += sub.redactions;
    mergeTokens(session.tokensByModel, sub.tokensByModel);
    for (const [model, n] of Object.entries(sub.shortCacheWritesByModel)) {
      session.shortCacheWritesByModel[model] = (session.shortCacheWritesByModel[model] ?? 0) + n;
    }
  }
  return session;
}
