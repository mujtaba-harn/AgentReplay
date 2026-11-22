// Session summary numbers (PRD US-4). Subagent steps count too: they are part of the work.
import { estimateCost } from "./pricing.js";
import type { EventKind, ReplayEvent, SessionStats, TokenUsage } from "./types.js";

const TOOL_KINDS: ReadonlySet<EventKind> = new Set([
  "read",
  "edit",
  "write",
  "command",
  "search",
  "task",
  "subagent",
]);

export interface StatsInput {
  events: readonly ReplayEvent[];
  subagentEvents: readonly ReplayEvent[];
  tokensByModel: Readonly<Record<string, TokenUsage>>;
  /** 5-minute cache writes per model; makes the estimate exact (see pricing.ts). */
  shortCacheWritesByModel?: Readonly<Record<string, number>>;
  durationMs: number;
  /** Claude Code's own total from the log's cost-state, when there is one. */
  exactCostUsd?: number;
}

function totalTokens(tokensByModel: Readonly<Record<string, TokenUsage>>): TokenUsage {
  const total: TokenUsage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  for (const t of Object.values(tokensByModel)) {
    total.in += t.in;
    total.out += t.out;
    total.cacheRead += t.cacheRead;
    total.cacheWrite += t.cacheWrite;
  }
  return total;
}

/** Expects events before read grouping, so each read is one tool call. */
export function computeStats(input: StatsInput): SessionStats {
  const all = [...input.events, ...input.subagentEvents];
  const changes = all.filter((e) => e.diff !== undefined);
  const exact = input.exactCostUsd;
  return {
    durationMs: input.durationMs,
    filesChanged: new Set(changes.map((e) => e.file)).size,
    linesAdded: changes.reduce((sum, e) => sum + (e.diff?.added ?? 0), 0),
    linesRemoved: changes.reduce((sum, e) => sum + (e.diff?.removed ?? 0), 0),
    toolCalls: all.filter((e) => TOOL_KINDS.has(e.kind)).length,
    tokens: totalTokens(input.tokensByModel),
    costUsd: exact ?? estimateCost(input.tokensByModel, input.shortCacheWritesByModel),
    costSource: exact === undefined ? "estimate" : "exact",
  };
}
