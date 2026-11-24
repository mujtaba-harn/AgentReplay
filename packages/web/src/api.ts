// Talks to the local Crafter Replay server (ARCHITECTURE.md §8). Every failure becomes a named
// problem, so the UI can always show a sentence and a next step instead of a blank page.
import type { SharedSession } from "@agentreplay/core";

export type Problem = "noSession" | "unreachable" | "notFound" | "unreadable" | "unexpected";

export type LoadResult = { ok: true; session: SharedSession } | { ok: false; problem: Problem };

type Fetcher = (url: string) => Promise<Response>;

const PROBLEM_BY_STATUS: Readonly<Record<number, Problem>> = { 404: "notFound", 500: "unreadable" };

/** `--card`: lets the CLI finish. If it has already stopped there is nobody left to tell. */
export function reportCardDone(saved: boolean): void {
  fetch(`/api/card-done?saved=${saved ? 1 : 0}`).catch(() => undefined);
}

/** The CLI opens `/?session=<id>`. */
export function sessionIdFrom(search: string): string | undefined {
  const id = new URLSearchParams(search).get("session");
  return id === null || id === "" ? undefined : id;
}

/** A cheap shape check at the boundary; the server builds this data from core's own types. */
function isSharedSession(value: unknown): value is SharedSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    Array.isArray(candidate.events) &&
    typeof candidate.stats === "object" &&
    candidate.stats !== null
  );
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined; // not JSON: reported below as an unexpected reply
  }
}

export async function loadReplay(id: string, fetcher: Fetcher = fetch): Promise<LoadResult> {
  let response: Response;
  try {
    response = await fetcher(`/api/sessions/${encodeURIComponent(id)}`);
  } catch {
    return { ok: false, problem: "unreachable" }; // fetch only throws when the server is gone
  }
  if (!response.ok) {
    return { ok: false, problem: PROBLEM_BY_STATUS[response.status] ?? "unexpected" };
  }
  const body = await bodyOf(response);
  return isSharedSession(body) ? { ok: true, session: body } : { ok: false, problem: "unexpected" };
}
