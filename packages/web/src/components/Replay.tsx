import type { ReplaySession } from "@agentreplay/core";
import { useReducer } from "react";
import { initialPlayback, playbackReducer } from "../state";
import { EventTrack } from "./EventTrack";

/** The replay itself: owns playback state and hands each part what it needs. */
export function Replay({ session }: { session: ReplaySession }) {
  const [state, dispatch] = useReducer(playbackReducer, session, initialPlayback);
  const { events } = session;
  const current = events[state.index];
  return (
    <section className="replay" aria-label="Replay">
      <EventTrack
        events={events}
        index={state.index}
        filter={state.filter}
        onJump={(index) => dispatch({ type: "jump", index })}
      />
      <p className="current-step" aria-live="polite">
        Step {state.index + 1} of {events.length}
        {current && <span className="current-title"> · {current.title}</span>}
      </p>
    </section>
  );
}
