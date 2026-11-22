// PRD US-3: an error shows "the next step that resolved it, if any".
import type { ReplayEvent } from "@agentreplay/core";

// core gives an error event the id of the tool call that failed, plus this suffix.
const ERROR_SUFFIX = "-error";

/** The step whose tool call produced the error at `errorIndex`. */
export function failedStep(
  events: readonly ReplayEvent[],
  errorIndex: number,
): ReplayEvent | undefined {
  const error = events[errorIndex];
  if (error?.kind !== "error" || !error.id.endsWith(ERROR_SUFFIX)) return undefined;
  const callId = error.id.slice(0, -ERROR_SUFFIX.length);
  return events
    .slice(0, errorIndex)
    .filter((e) => e.id === callId)
    .at(-1);
}

/**
 * The index of the next step that did what the failed step tried, and succeeded: same kind,
 * same file when there is one, and no error of its own. Undefined if nothing later fixed it.
 */
export function fixedBy(events: readonly ReplayEvent[], errorIndex: number): number | undefined {
  const failed = failedStep(events, errorIndex);
  if (!failed) return undefined;
  const failedIds = new Set(events.filter((e) => e.kind === "error").map((e) => e.id));
  const index = events.findIndex(
    (e, i) =>
      i > errorIndex &&
      e.kind === failed.kind &&
      e.file === failed.file &&
      !failedIds.has(`${e.id}${ERROR_SUFFIX}`),
  );
  return index === -1 ? undefined : index;
}
