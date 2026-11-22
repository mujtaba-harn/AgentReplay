// Public API — kept small (ARCHITECTURE.md §3). Everything returned is already redacted.
export {
  type LocateOptions,
  locate,
  sessionsFolder,
  subagentFiles,
} from "./adapters/claude-code/locate.js";
export { parse } from "./adapters/claude-code/parse.js";
export { summarize } from "./adapters/claude-code/summarize.js";
export { formatDuration } from "./format.js";
export { compressedTimes, IDLE_GAP_MAX_MS } from "./group.js";
export type {
  AgentId,
  EventKind,
  ReplayEvent,
  ReplaySession,
  SessionStats,
  SessionSummary,
  TokenUsage,
} from "./types.js";
