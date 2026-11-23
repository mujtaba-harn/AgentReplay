// The only definition of session and event shapes. cli, web and future surfaces import these.

export type EventKind =
  | "user"
  | "assistant"
  | "read"
  | "edit"
  | "write"
  | "command"
  | "search"
  | "task"
  | "subagent"
  | "error";

export type AgentId = "claude-code";

export interface TokenUsage {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ReplayEvent {
  id: string;
  kind: EventKind;
  /** Milliseconds since the session started. */
  t: number;
  /** Short human label, e.g. "Edited src/globals.css". */
  title: string;
  /** Relative to the session's working folder. */
  file?: string;
  diff?: { before: string; after: string; added: number; removed: number };
  /** Prompt, reply, command or error message. Always redacted before it leaves core. */
  text?: string;
  /** What a command, search or subagent returned. Always redacted before it leaves core. */
  output?: string;
  tokens?: TokenUsage;
  model?: string;
  /** Set by group.ts when consecutive reads are merged into one event. */
  groupSize?: number;
}

/** Cheap to compute: enough for the session picker without a full parse. */
export interface SessionSummary {
  id: string;
  agent: AgentId;
  path: string;
  title: string;
  project: string;
  /** Epoch milliseconds. A number, not a Date, so it survives JSON to the browser unchanged. */
  startedAt: number;
  durationMs: number;
}

export interface SessionStats {
  durationMs: number;
  /** Unique file paths edited or written. */
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  toolCalls: number;
  tokens: TokenUsage;
  costUsd: number;
  /** "exact" when the log's own cost-state supplied it; "estimate" when pricing.ts computed it. */
  costSource: "exact" | "estimate";
}

export interface ReplaySession extends SessionSummary {
  events: readonly ReplayEvent[];
  stats: SessionStats;
  warnings: { skippedLines: number; redactions: number };
}

/**
 * What the browser receives (and, in Phase 2, what a share link uploads): no local file path,
 * which would reveal the OS user name. Only the CLI needs `path`.
 */
export type SharedSummary = Omit<SessionSummary, "path">;
export type SharedSession = Omit<ReplaySession, "path">;
