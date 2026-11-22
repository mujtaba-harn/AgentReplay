import type { ReplayEvent } from "@agentreplay/core";
import { useEffect, useMemo, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { FILTERS, type Filter, isVisible } from "../state";
import { Notice } from "./Notice";

interface StepListProps {
  events: readonly ReplayEvent[];
  index: number;
  filter: Filter;
  onJump: (index: number) => void;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Time since the session started, as m:ss or h:mm:ss. */
export function formatClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const clock = `${pad(minutes)}:${pad(seconds % 60)}`;
  return hours > 0 ? `${hours}:${clock}` : clock.replace(/^0/, "");
}

/** PRD US-2: every step in order, virtualized so 2,000+ steps stay smooth. */
export function StepList({ events, index, filter, onJump }: StepListProps) {
  // Positions in session.events of the steps this filter shows — derived, never stored.
  const shown = useMemo(
    () => events.flatMap((e, i) => (isVisible(e.kind, filter) ? [i] : [])),
    [events, filter],
  );
  const list = useRef<VirtuosoHandle>(null);
  const row = shown.indexOf(index);

  useEffect(() => {
    if (row >= 0) list.current?.scrollIntoView({ index: row });
  }, [row]);

  if (shown.length === 0) {
    const empty = FILTERS.find((f) => f.value === filter)?.empty ?? "";
    return <Notice title={empty} />;
  }
  return (
    <section className="step-list" aria-label="Steps">
      <Virtuoso
        ref={list}
        data={shown}
        computeItemKey={(_, eventIndex) => events[eventIndex]?.id ?? eventIndex}
        itemContent={(_, eventIndex) => {
          const event = events[eventIndex];
          if (!event) return null;
          return (
            <button
              type="button"
              className="step-row"
              aria-current={eventIndex === index ? "step" : undefined}
              onClick={() => onJump(eventIndex)}
            >
              <span className="step-time">{formatClock(event.t)}</span>
              <span className={`kind-dot kind-${event.kind}`} aria-hidden="true" />
              <span className="step-title">{event.title}</span>
            </button>
          );
        }}
      />
    </section>
  );
}
