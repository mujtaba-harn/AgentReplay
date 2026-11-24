import type { ReplayEvent } from "@crafter-replay/core";
import { useEffect, useMemo, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { formatClock } from "../format";
import { FILTERS, type Filter, visibleIndexes } from "../state";
import { Notice } from "./Notice";

interface StepListProps {
  events: readonly ReplayEvent[];
  index: number;
  filter: Filter;
  onJump: (index: number) => void;
}

/** PRD US-2: every step in order, virtualized so 2,000+ steps stay smooth. */
export function StepList({ events, index, filter, onJump }: StepListProps) {
  const shown = useMemo(() => visibleIndexes(events, filter), [events, filter]);
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
