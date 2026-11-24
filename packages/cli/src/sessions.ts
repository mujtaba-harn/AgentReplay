// Finding sessions for the picker (US-1). Only summaries are read here; the full parse waits for a pick.
import { resolve } from "node:path";
import {
  type LocateOptions,
  locate,
  type SessionSummary,
  sessionsFolder,
  summarize,
} from "@crafter-replay/core";

export interface FoundSessions {
  /** Where we looked, for the "nothing found" message. */
  folder: string;
  /** Newest first. */
  summaries: SessionSummary[];
  /** Logs that exist but could not be read (e.g. permissions); reported, not fatal. */
  unreadable: number;
}

export async function findSessions(options: LocateOptions = {}): Promise<FoundSessions> {
  const paths = await locate(options);
  const results = await Promise.allSettled(paths.map((path) => summarize(path)));
  const summaries = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .sort((a, b) => b.startedAt - a.startedAt);
  return {
    folder: sessionsFolder(options),
    summaries,
    unreadable: paths.length - summaries.length,
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** The session the user named with --path, or undefined when no file is there. */
export async function sessionAt(path: string): Promise<SessionSummary | undefined> {
  try {
    return await summarize(resolve(path));
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}
