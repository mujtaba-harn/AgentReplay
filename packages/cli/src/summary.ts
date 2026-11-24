// The calm terminal output while a replay is running (F1.11, PRD US-6).
import { styleText } from "node:util";
import type { SessionSummary } from "@crafter-replay/core";
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

/** `--card`: the same page in card-only mode, which downloads the PNG by itself. */
export function cardUrl(serverUrl: string, sessionId: string): string {
  return `${replayUrl(serverUrl, sessionId)}&card=1`;
}

const PRIVACY = `  ${styleText("green", "Data never leaves your computer.")}`;

function sessionLines(session: SessionSummary, now: number): string[] {
  return [
    "",
    `  ${styleText("bold", session.title)}`,
    `  ${styleText("dim", sessionDetails(session, now))}`,
    "",
  ];
}

export function runningSummary(
  session: SessionSummary,
  url: string,
  browser: BrowserState,
  now = Date.now(),
): string[] {
  return [
    ...sessionLines(session, now),
    `  ${styleText("cyan", url)}`,
    `  ${BROWSER_NOTES[browser]}`,
    "",
    PRIVACY,
    `  ${styleText("dim", "Press Ctrl+C to stop.")}`,
    "",
  ];
}

export function cardSummary(
  session: SessionSummary,
  url: string,
  browser: BrowserState,
  now = Date.now(),
): string[] {
  return [
    ...sessionLines(session, now),
    "  Making your recap card. Your browser draws it and saves it to its Downloads folder.",
    `  ${styleText("cyan", url)}`,
    `  ${BROWSER_NOTES[browser]}`,
    "",
    PRIVACY,
    "",
  ];
}

/** What to print when the card page reports back. */
export function cardDoneMessage(saved: boolean): string {
  return saved
    ? "Your recap card is in your browser's Downloads folder."
    : "The browser couldn't save the card. Open the replay and use Download PNG instead.";
}
