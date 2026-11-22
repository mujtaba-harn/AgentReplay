// @vitest-environment jsdom
import type { EventKind, ReplayEvent } from "@agentreplay/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventTrack, markerPositions } from "../src/components/EventTrack";

const MINUTE = 60_000;

const event = (i: number, kind: EventKind, t: number): ReplayEvent => ({
  id: `e${i}`,
  kind,
  t,
  title: `${kind} ${i}`,
});

afterEach(cleanup);

describe("markerPositions", () => {
  it("spreads events from 0% to 100% by time", () => {
    const events = [event(0, "user", 0), event(1, "read", 10_000), event(2, "edit", 40_000)];

    expect(markerPositions(events)).toEqual([0, 25, 100]);
  });

  it("squeezes idle gaps longer than a minute, so a long break doesn't crush the rest", () => {
    const events = [
      event(0, "user", 0),
      event(1, "read", MINUTE),
      event(2, "edit", 2 * MINUTE + 60 * MINUTE),
    ];

    expect(markerPositions(events)).toEqual([0, 50, 100]);
  });

  it("puts every marker at the start when no time passes", () => {
    expect(markerPositions([event(0, "user", 5), event(1, "assistant", 5)])).toEqual([0, 0]);
    expect(markerPositions([])).toEqual([]);
  });
});

describe("EventTrack", () => {
  const events = [event(0, "user", 0), event(1, "edit", 1000), event(2, "command", 2000)];

  it("draws one marker per event, coloured by kind", () => {
    render(<EventTrack events={events} index={0} filter="all" onJump={() => {}} />);

    const markers = screen.getAllByRole("button");
    expect(markers).toHaveLength(3);
    expect(markers[1]?.className).toContain("kind-edit");
  });

  it("outlines the current step", () => {
    render(<EventTrack events={events} index={2} filter="all" onJump={() => {}} />);

    expect(screen.getByRole("button", { name: "command 2" }).getAttribute("aria-current")).toBe(
      "step",
    );
    expect(screen.getByRole("button", { name: "user 0" }).getAttribute("aria-current")).toBeNull();
  });

  it("jumps to a step when its marker is clicked", () => {
    const onJump = vi.fn();
    render(<EventTrack events={events} index={0} filter="all" onJump={onJump} />);

    fireEvent.click(screen.getByRole("button", { name: "edit 1" }));

    expect(onJump).toHaveBeenCalledWith(1);
  });

  it("dims and disables markers the filter hides", () => {
    const onJump = vi.fn();
    render(<EventTrack events={events} index={1} filter="edits" onJump={onJump} />);

    const hidden = screen.getByRole("button", { name: "command 2" });
    fireEvent.click(hidden);

    expect(hidden).toHaveProperty("disabled", true);
    expect(onJump).not.toHaveBeenCalled();
  });
});
