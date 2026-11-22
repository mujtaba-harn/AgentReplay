export { type LocateOptions, locate, subagentFiles } from "./adapters/claude-code/locate.js";
export { summarize } from "./adapters/claude-code/summarize.js";
export type {
  AgentId,
  EventKind,
  ReplayEvent,
  ReplaySession,
  SessionStats,
  SessionSummary,
  TokenUsage,
} from "./types.js";

// Placeholder used by the CLI until F1.8 replaces it with the package version.
export const AGENTREPLAY_VERSION = "0.0.0";
