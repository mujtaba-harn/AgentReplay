// The calm terminal output while a replay is running (F1.11, PRD US-6).
import { styleText } from "node:util";
import type { SessionSummary } from "@agentreplay/core";
import { sessionDetails } from "./picker.js";

export type BrowserState = "opened" | "skipped" | "failed";

const BROWSER_NOTES: Readonly<Record<BrowserState, string>> = {
  opened: "Opened in your browser.",
  skipped: "Open this address in your browser.",
  failed: "Couldn't open a browser; open this address yourself.",
};

/** The web UI reads `session` from the query string to know which replay to load. */
export function replayUrl(serverUrl: string, sessionId: string): string {
  return `${serverUrl}/?session=${encodeURIComponent(sessionId)}`;
}

export function runningSummary(
  session: SessionSummary,
  url: string,
  browser: BrowserState,
  now = Date.now(),
): string[] {
  return [
    "",
    `  ${styleText("bold", session.title)}`,
    `  ${styleText("dim", sessionDetails(session, now))}`,
    "",
    `  ${styleText("cyan", url)}`,
    `  ${BROWSER_NOTES[browser]}`,
    "",
    `  ${styleText("green", "Data never leaves your computer.")}`,
    `  ${styleText("dim", "Press Ctrl+C to stop.")}`,
    "",
  ];
}
