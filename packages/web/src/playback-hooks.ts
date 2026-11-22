// The two side effects of playback: a timer while playing, and keyboard shortcuts.
import { type Dispatch, useEffect } from "react";
import { nextVisible, type PlaybackAction, type PlaybackState, playbackDelay } from "./state";

/** ARCHITECTURE.md §9: a single timer advances the index while playing. */
export function usePlaybackTimer(state: PlaybackState, dispatch: Dispatch<PlaybackAction>): void {
  const { playing, index, speed } = state;
  const events = state.session.events;
  const next = nextVisible(state);
  useEffect(() => {
    if (!playing) return;
    const gap = (events[next ?? index]?.t ?? 0) - (events[index]?.t ?? 0);
    const timer = setTimeout(() => dispatch({ type: "tick" }), playbackDelay(gap, speed));
    return () => clearTimeout(timer);
  }, [playing, index, next, speed, events, dispatch]);
}

const KEY_ACTIONS: Readonly<Record<string, PlaybackAction>> = {
  ArrowLeft: { type: "previous" },
  ArrowRight: { type: "next" },
  " ": { type: "togglePlay" },
};

// Leave keys alone where the browser already gives them a meaning: typing, the scrubber's own
// arrow keys, and Space "clicking" a focused button.
function keyBelongsToTarget(key: string, target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.matches("textarea, select, input:not([type=range])")) {
    return true;
  }
  if (target.matches("input[type=range]")) return key !== " ";
  return key === " " && target.matches("button");
}

/** PRD US-2: ← / → step, Space plays and pauses. */
export function usePlaybackKeys(dispatch: Dispatch<PlaybackAction>): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = KEY_ACTIONS[event.key];
      if (!action || event.altKey || event.ctrlKey || event.metaKey) return;
      if (keyBelongsToTarget(event.key, event.target)) return;
      event.preventDefault(); // Space would otherwise scroll the page
      dispatch(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);
}
