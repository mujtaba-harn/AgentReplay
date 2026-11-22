import type { ReplayEvent } from "@agentreplay/core";
import { compressedTimes } from "@agentreplay/core/timeline";
import { useMemo } from "react";
import { type Filter, isVisible } from "../state";

interface EventTrackProps {
  events: readonly ReplayEvent[];
  index: number;
  filter: Filter;
  onJump: (index: number) => void;
}

/**
 * Each event's position along the track, 0–100. Uses squeezed time (idle gaps capped at a
 * minute), the same time playback follows, so one long break doesn't crush everything else.
 */
export function markerPositions(events: readonly ReplayEvent[]): number[] {
  const times = compressedTimes(events);
  const first = times[0] ?? 0;
  const span = (times.at(-1) ?? 0) - first;
  return times.map((t) => (span === 0 ? 0 : ((t - first) / span) * 100));
}

/** PRD US-2: one coloured marker per event, positioned by time; click to jump. */
export function EventTrack({ events, index, filter, onJump }: EventTrackProps) {
  const positions = useMemo(() => markerPositions(events), [events]);
  return (
    <fieldset className="event-track" aria-label="Event track">
      {events.map((event, i) => {
        const shown = isVisible(event.kind, filter);
        return (
          <button
            key={event.id}
            type="button"
            // Arrow keys step through events (F1.18); one tab stop per marker would be thousands.
            tabIndex={-1}
            className={`marker marker-${event.kind}${shown ? "" : " is-hidden"}`}
            style={{ left: `${positions[i] ?? 0}%` }}
            aria-label={event.title}
            aria-current={i === index ? "step" : undefined}
            title={event.title}
            disabled={!shown}
            onClick={() => onJump(i)}
          />
        );
      })}
    </fieldset>
  );
}
