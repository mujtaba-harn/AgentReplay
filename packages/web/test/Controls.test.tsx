// @vitest-environment jsdom
import type { EventKind, ReplayEvent, ReplaySession } from "@crafter-replay/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Replay } from "../src/components/Replay";

const KINDS: EventKind[] = ["user", "read", "edit", "command", "assistant"];
// One second between steps, and a ten-minute break before the last one.
const TIMES = [0, 1000, 2000, 3000, 603_000];

const events: ReplayEvent[] = KINDS.map((kind, i) => ({
  id: `e${i}`,
  kind,
  t: TIMES[i] ?? 0,
  title: `${kind} ${i}`,
}));
const session = { title: "t", events } as unknown as ReplaySession;

const withSizes = ({ children }: { children: ReactNode }) => (
  <VirtuosoMockContext.Provider value={{ viewportHeight: 300, itemHeight: 30 }}>
    {children}
  </VirtuosoMockContext.Provider>
);

const step = () => screen.getByText(/Step \d+ of 5/).textContent?.match(/Step (\d+)/)?.[1];
const press = (key: string, target: Element = document.body) =>
  act(() => {
    fireEvent.keyDown(target, { key });
  });
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  render(<Replay session={session} />, { wrapper: withSizes });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("play and pause", () => {
  it("plays through the steps at the real pace, then stops at the end", () => {
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    wait(999);
    expect(step()).toBe("1");

    wait(1);
    expect(step()).toBe("2");

    // Each step's timer starts after the previous step renders, so advance one gap at a time.
    wait(1000);
    wait(1000);
    expect(step()).toBe("4");

    // The ten-minute break takes only 1.5 s.
    wait(1500);
    expect(step()).toBe("5");
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("pauses", () => {
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    wait(5000);

    expect(step()).toBe("1");
  });

  it("goes faster at 20×", () => {
    fireEvent.click(screen.getByRole("button", { name: "20×" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    wait(150);

    expect(step()).toBe("2");
    expect(screen.getByRole("button", { name: "20×" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("scrubber", () => {
  it("jumps to the step it is dragged to", () => {
    fireEvent.change(screen.getByRole("slider", { name: "Scrub through steps" }), {
      target: { value: "3" },
    });

    expect(step()).toBe("4");
  });

  it("only covers the steps the filter shows", () => {
    fireEvent.click(screen.getByRole("button", { name: /^Edits/ }));

    expect(screen.getByRole("slider").getAttribute("max")).toBe("0");
  });
});

describe("keyboard", () => {
  it("steps with the arrow keys", () => {
    press("ArrowRight");
    press("ArrowRight");
    press("ArrowLeft");

    expect(step()).toBe("2");
  });

  it("plays and pauses with Space", () => {
    press(" ");
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    press(" ");
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("leaves Space alone on a focused button, which the browser already clicks", () => {
    press(" ", screen.getByRole("button", { name: "5×" }));

    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });
});
