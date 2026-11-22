// The interactive session list (US-1): arrows + Enter, Ctrl+C cancels.
import { styleText } from "node:util";
import { formatDuration, type SessionSummary } from "@agentreplay/core";
import { isCancel, select } from "@clack/prompts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const VISIBLE_ROWS = 10;
const DEFAULT_COLUMNS = 80;
/** clack draws "│  ○ " before each row, plus one spare column so the cursor never wraps. */
const ROW_PREFIX_WIDTH = 6;
const MIN_TITLE_WIDTH = 20;
const GAP = "  ";

/** Local calendar date as YYYY-MM-DD, without pulling in a date library. */
function localDate(epochMs: number): string {
  const date = new Date(epochMs);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatAge(startedAt: number, now: number): string {
  const age = Math.max(0, now - startedAt);
  if (age < MINUTE) return "just now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  const days = Math.floor(age / DAY);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  return localDate(startedAt);
}

/** The grey text after a title: project · duration · age. */
export function sessionDetails(summary: SessionSummary, now: number): string {
  return [
    summary.project,
    formatDuration(summary.durationMs),
    formatAge(summary.startedAt, now),
  ].join(" · ");
}

/** Shortens a title so it fits in `width` characters, keeping each row on one line. */
export function fitTitle(title: string, width: number): string {
  const room = Math.max(MIN_TITLE_WIDTH, width);
  return title.length <= room ? title : `${title.slice(0, room - 1).trimEnd()}…`;
}

/** One row: title, then grey details, sized to the terminal so long titles don't wrap. */
export function sessionRow(summary: SessionSummary, now: number, columns: number): string {
  const details = sessionDetails(summary, now);
  const title = fitTitle(summary.title, columns - ROW_PREFIX_WIDTH - GAP.length - details.length);
  return `${title}${GAP}${styleText("dim", details)}`;
}

/** Lets the user pick one session; undefined means they pressed Ctrl+C or Esc. */
export async function pickSession(
  summaries: readonly SessionSummary[],
  now = Date.now(),
): Promise<SessionSummary | undefined> {
  const columns = process.stdout.columns ?? DEFAULT_COLUMNS;
  const options = summaries.map((summary) => ({
    value: summary,
    label: sessionRow(summary, now, columns),
  }));
  const picked = await select({
    message: "Which session do you want to replay?",
    options,
    maxItems: VISIBLE_ROWS,
  });
  return isCancel(picked) ? undefined : picked;
}
