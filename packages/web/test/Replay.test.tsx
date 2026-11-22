// @vitest-environment jsdom
import type { EventKind, ReplayEvent, ReplaySession } from "@agentreplay/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, describe, expect, it } from "vitest";
import { Replay } from "../src/components/Replay";
import { formatClock } from "../src/components/StepList";

const KINDS: EventKind[] = ["user", "read", "edit", "command", "error", "command", "assistant"];

const event = (i: number, kind: EventKind): ReplayEvent => ({
  id: `e${i}`,
  kind,
  t: i * 65_000,
  title: `${kind} ${i}`,
});

const sessionOf = (events: ReplayEvent[]) => ({ title: "t", events }) as unknown as ReplaySession;

// jsdom has no layout, so give Virtuoso fixed sizes: a 300px list of 30px rows shows ~10 rows.
const withSizes = ({ children }: { children: ReactNode }) => (
  <VirtuosoMockContext.Provider value={{ viewportHeight: 300, itemHeight: 30 }}>
    {children}
  </VirtuosoMockContext.Provider>
);

const list = () => screen.getByRole("region", { name: "Steps" });
const rows = () => within(list()).getAllByRole("button");

afterEach(cleanup);

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [65_000, "1:05"],
    [3_725_000, "1:02:05"],
  ])("shows %d ms as %s", (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe("step list", () => {
  it("lists every step in order with its time", () => {
    render(<Replay session={sessionOf(KINDS.map((k, i) => event(i, k)))} />, {
      wrapper: withSizes,
    });

    expect(rows().map((r) => r.textContent)).toEqual([
      "0:00user 0",
      "1:05read 1",
      "2:10edit 2",
      "3:15command 3",
      "4:20error 4",
      "5:25command 5",
      "6:30assistant 6",
    ]);
  });

  it("highlights the current step and jumps when a row is clicked", () => {
    render(<Replay session={sessionOf(KINDS.map((k, i) => event(i, k)))} />, {
      wrapper: withSizes,
    });

    fireEvent.click(within(list()).getByRole("button", { name: /edit 2/ }));

    expect(
      within(list())
        .getByRole("button", { name: /edit 2/ })
        .getAttribute("aria-current"),
    ).toBe("step");
    expect(screen.getByText(/Step 3 of 7/)).toBeTruthy();
  });

  it("renders only the rows in view for a 2,000-step session", () => {
    const events = Array.from({ length: 2000 }, (_, i) => event(i, "command"));
    render(<Replay session={sessionOf(events)} />, { wrapper: withSizes });

    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThan(50);
  });
});

describe("filters", () => {
  it("shows how many steps each filter matches", () => {
    render(<Replay session={sessionOf(KINDS.map((k, i) => event(i, k)))} />, {
      wrapper: withSizes,
    });

    const filters = screen.getByRole("group", { name: "Filter steps" });
    expect(
      within(filters)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["All7", "Edits1", "Commands2", "Errors1"]);
  });

  it("lists only matching steps and moves to one of them", () => {
    render(<Replay session={sessionOf(KINDS.map((k, i) => event(i, k)))} />, {
      wrapper: withSizes,
    });

    fireEvent.click(screen.getByRole("button", { name: /^Commands/ }));

    expect(rows().map((r) => r.textContent)).toEqual(["3:15command 3", "5:25command 5"]);
    expect(screen.getByRole("button", { name: /^Commands/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByText(/Step 4 of 7/)).toBeTruthy();
  });

  it("says so when a filter matches nothing", () => {
    const events = [event(0, "user"), event(1, "assistant")];
    render(<Replay session={sessionOf(events)} />, { wrapper: withSizes });

    fireEvent.click(screen.getByRole("button", { name: /^Errors/ }));

    expect(screen.getByText("No errors in this session.")).toBeTruthy();
  });
});
