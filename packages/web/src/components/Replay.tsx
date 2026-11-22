import type { ReplaySession } from "@agentreplay/core";
import { useReducer } from "react";
import { initialPlayback, playbackReducer } from "../state";
import { EventTrack } from "./EventTrack";
import { FilterBar } from "./FilterBar";
import { StepDetail } from "./StepDetail";
import { StepList } from "./StepList";

/** The replay itself: owns playback state and hands each part what it needs. */
export function Replay({ session }: { session: ReplaySession }) {
  const [state, dispatch] = useReducer(playbackReducer, session, initialPlayback);
  const { events } = session;
  const current = events[state.index];
  const jump = (index: number) => dispatch({ type: "jump", index });
  return (
    <section className="replay" aria-label="Replay">
      <EventTrack events={events} index={state.index} filter={state.filter} onJump={jump} />
      <p className="current-step" aria-live="polite">
        Step {state.index + 1} of {events.length}
        {current && <span className="current-title"> · {current.title}</span>}
      </p>
      <FilterBar
        events={events}
        filter={state.filter}
        onChange={(filter) => dispatch({ type: "setFilter", filter })}
      />
      <div className="replay-body">
        <StepList events={events} index={state.index} filter={state.filter} onJump={jump} />
        <StepDetail events={events} index={state.index} onJump={jump} />
      </div>
    </section>
  );
}
