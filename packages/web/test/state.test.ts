import type { EventKind, ReplaySession } from "@agentreplay/core";
import { describe, expect, it } from "vitest";
import {
  initialPlayback,
  isVisible,
  nextVisible,
  type PlaybackState,
  playbackDelay,
  playbackReducer,
} from "../src/state";

// index:          0       1       2         3        4       5          6
const KINDS: EventKind[] = ["user", "read", "edit", "command", "error", "write", "assistant"];

const session = {
  title: "t",
  events: KINDS.map((kind, i) => ({ id: `e${i}`, kind, t: i * 1000, title: kind })),
} as unknown as ReplaySession;

const start = initialPlayback(session);
const at = (index: number, extra: Partial<PlaybackState> = {}): PlaybackState => ({
  ...start,
  index,
  ...extra,
});

describe("initialPlayback", () => {
  it("starts paused on the first step, at 1×, showing everything", () => {
    expect(start).toMatchObject({ index: 0, playing: false, speed: 1, filter: "all" });
  });
});

describe("isVisible", () => {
  it.each([
    ["all", "user", true],
    ["edits", "edit", true],
    ["edits", "write", true],
    ["edits", "read", false],
    ["commands", "command", true],
    ["errors", "error", true],
    ["errors", "command", false],
  ] as const)("filter %s shows %s: %s", (filter, kind, shown) => {
    expect(isVisible(kind, filter)).toBe(shown);
  });
});

describe("playbackReducer", () => {
  it("steps forward and back through every step", () => {
    expect(playbackReducer(at(2), { type: "next" }).index).toBe(3);
    expect(playbackReducer(at(2), { type: "previous" }).index).toBe(1);
  });

  it("stays put at either end", () => {
    expect(playbackReducer(at(6), { type: "next" }).index).toBe(6);
    expect(playbackReducer(at(0), { type: "previous" }).index).toBe(0);
  });

  it("skips steps the filter hides", () => {
    const edits = at(2, { filter: "edits" });

    expect(playbackReducer(edits, { type: "next" }).index).toBe(5);
    expect(playbackReducer(at(5, { filter: "edits" }), { type: "previous" }).index).toBe(2);
  });

  it("jumps to a step", () => {
    expect(playbackReducer(at(0), { type: "jump", index: 4 }).index).toBe(4);
  });

  it("ignores a jump outside the session", () => {
    expect(playbackReducer(at(1), { type: "jump", index: 99 }).index).toBe(1);
    expect(playbackReducer(at(1), { type: "jump", index: -1 }).index).toBe(1);
  });

  it("plays, pauses and toggles", () => {
    const playing = playbackReducer(at(1), { type: "play" });

    expect(playing.playing).toBe(true);
    expect(playbackReducer(playing, { type: "pause" }).playing).toBe(false);
    expect(playbackReducer(playing, { type: "togglePlay" }).playing).toBe(false);
  });

  it("starts over when play is pressed on the last step", () => {
    expect(playbackReducer(at(6), { type: "play" })).toMatchObject({ index: 0, playing: true });
  });

  it("starts over at the first visible step under a filter", () => {
    const state = at(5, { filter: "edits" });

    expect(playbackReducer(state, { type: "play" })).toMatchObject({ index: 2, playing: true });
  });

  it("advances on each tick", () => {
    expect(playbackReducer(at(4, { playing: true }), { type: "tick" })).toMatchObject({
      index: 5,
      playing: true,
    });
  });

  it("stops as soon as it reaches the last step", () => {
    expect(playbackReducer(at(5, { playing: true }), { type: "tick" })).toMatchObject({
      index: 6,
      playing: false,
    });
  });

  it("changes speed", () => {
    expect(playbackReducer(start, { type: "setSpeed", speed: 20 }).speed).toBe(20);
  });

  it("keeps the current step when the new filter still shows it", () => {
    expect(playbackReducer(at(3), { type: "setFilter", filter: "commands" }).index).toBe(3);
  });

  it("moves to the next visible step when the new filter hides the current one", () => {
    expect(playbackReducer(at(1), { type: "setFilter", filter: "edits" }).index).toBe(2);
  });

  it("moves back when no visible step comes after", () => {
    expect(playbackReducer(at(6), { type: "setFilter", filter: "errors" }).index).toBe(4);
  });

  it("keeps the step and pauses when the filter shows nothing", () => {
    const noErrors = {
      ...session,
      events: session.events.filter((e) => e.kind !== "error"),
    } as ReplaySession;
    const state = { ...initialPlayback(noErrors), index: 1, playing: true };

    expect(playbackReducer(state, { type: "setFilter", filter: "errors" })).toMatchObject({
      index: 1,
      playing: false,
      filter: "errors",
    });
  });
});

describe("nextVisible", () => {
  it("is the next step the filter shows, or undefined at the end", () => {
    expect(nextVisible(at(2, { filter: "edits" }))).toBe(5);
    expect(nextVisible(at(5, { filter: "edits" }))).toBeUndefined();
  });
});

describe("playbackDelay", () => {
  it("divides the real gap by the speed", () => {
    expect(playbackDelay(1000, 5)).toBe(200);
  });

  it("never waits longer than 1.5 s, so idle gaps are compressed", () => {
    expect(playbackDelay(10 * 60_000, 1)).toBe(1500);
  });

  it("waits at least 0.1 s, so steps that happened together are still visible one by one", () => {
    expect(playbackDelay(0, 20)).toBe(100);
    expect(playbackDelay(-50, 1)).toBe(100);
  });
});
