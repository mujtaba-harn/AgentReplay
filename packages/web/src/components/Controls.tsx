import { type Dispatch, useMemo } from "react";
import { type PlaybackAction, type PlaybackState, type Speed, visibleIndexes } from "../state";

const SPEEDS: readonly Speed[] = [1, 5, 20];

interface ControlsProps {
  state: PlaybackState;
  dispatch: Dispatch<PlaybackAction>;
}

/** PRD US-2: play/pause, speed, and a scrubber over the steps the filter shows. */
export function Controls({ state, dispatch }: ControlsProps) {
  const { events } = state.session;
  const shown = useMemo(() => visibleIndexes(events, state.filter), [events, state.filter]);
  const position = Math.max(0, shown.indexOf(state.index));
  return (
    <div className="controls">
      <button
        type="button"
        className="play-button"
        aria-label={state.playing ? "Pause" : "Play"}
        disabled={shown.length === 0}
        onClick={() => dispatch({ type: "togglePlay" })}
      >
        {state.playing ? "❚❚" : "▶"}
      </button>
      <input
        type="range"
        className="scrubber"
        aria-label="Scrub through steps"
        min={0}
        max={Math.max(0, shown.length - 1)}
        value={position}
        disabled={shown.length < 2}
        onChange={(e) => {
          const index = shown[Number(e.target.value)];
          if (index !== undefined) dispatch({ type: "jump", index });
        }}
      />
      <fieldset className="speeds" aria-label="Speed">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className="speed-button"
            aria-pressed={state.speed === speed}
            onClick={() => dispatch({ type: "setSpeed", speed })}
          >
            {speed}×
          </button>
        ))}
      </fieldset>
    </div>
  );
}
