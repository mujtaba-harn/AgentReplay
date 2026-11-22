// Playback state: one reducer, no store library (ARCHITECTURE.md §9). Indexes always point into
// session.events; the filter only decides which of those steps can be visited.
import type { EventKind, ReplaySession } from "@agentreplay/core";

export type Filter = "all" | "edits" | "commands" | "errors";
export type Speed = 1 | 5 | 20;

export interface PlaybackState {
  session: ReplaySession;
  index: number;
  playing: boolean;
  speed: Speed;
  filter: Filter;
}

export type PlaybackAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "togglePlay" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "tick" }
  | { type: "jump"; index: number }
  | { type: "setSpeed"; speed: Speed }
  | { type: "setFilter"; filter: Filter };

/** PRD US-2 filters: All · Edits · Commands · Errors. "all" has no entry: it shows everything. */
const FILTER_KINDS: Readonly<Record<Exclude<Filter, "all">, readonly EventKind[]>> = {
  edits: ["edit", "write"],
  commands: ["command"],
  errors: ["error"],
};

/** The longest pause between two steps while playing, whatever the real gap was. */
export const MAX_STEP_DELAY_MS = 1500;

export function isVisible(kind: EventKind, filter: Filter): boolean {
  return filter === "all" || FILTER_KINDS[filter].includes(kind);
}

export function initialPlayback(session: ReplaySession): PlaybackState {
  return { session, index: 0, playing: false, speed: 1, filter: "all" };
}

/** The nearest visible index from `from` in `direction`, or undefined if there is none. */
function findVisible(state: PlaybackState, from: number, direction: 1 | -1): number | undefined {
  const { events } = state.session;
  for (let i = from; i >= 0 && i < events.length; i += direction) {
    const event = events[i];
    if (event && isVisible(event.kind, state.filter)) return i;
  }
  return undefined;
}

function step(state: PlaybackState, direction: 1 | -1): PlaybackState {
  const index = findVisible(state, state.index + direction, direction);
  return index === undefined ? state : { ...state, index };
}

function play(state: PlaybackState): PlaybackState {
  const hasNext = findVisible(state, state.index + 1, 1) !== undefined;
  if (hasNext) return { ...state, playing: true };
  const first = findVisible(state, 0, 1);
  return first === undefined ? state : { ...state, index: first, playing: true };
}

function tick(state: PlaybackState): PlaybackState {
  const index = findVisible(state, state.index + 1, 1);
  return index === undefined ? { ...state, playing: false } : { ...state, index };
}

function setFilter(state: PlaybackState, filter: Filter): PlaybackState {
  const filtered = { ...state, filter };
  const index = findVisible(filtered, state.index, 1) ?? findVisible(filtered, state.index, -1);
  return index === undefined ? { ...filtered, playing: false } : { ...filtered, index };
}

function jump(state: PlaybackState, index: number): PlaybackState {
  const inside = index >= 0 && index < state.session.events.length;
  return inside ? { ...state, index } : state;
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case "play":
      return play(state);
    case "pause":
      return { ...state, playing: false };
    case "togglePlay":
      return state.playing ? { ...state, playing: false } : play(state);
    case "next":
      return step(state, 1);
    case "previous":
      return step(state, -1);
    case "tick":
      return tick(state);
    case "jump":
      return jump(state, action.index);
    case "setSpeed":
      return { ...state, speed: action.speed };
    case "setFilter":
      return setFilter(state, action.filter);
  }
}

/** How long to wait before the next step: the real gap sped up, capped so idle time compresses. */
export function playbackDelay(realGapMs: number, speed: Speed): number {
  return Math.min(Math.max(0, realGapMs) / speed, MAX_STEP_DELAY_MS);
}
