// @vitest-environment jsdom
import type { ReplaySession } from "@crafter-replay/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultCardOptions, RecapCard } from "../src/components/RecapCard";
import { Replay } from "../src/components/Replay";

const CODE = "const apiKey = process.env.SECRET_TOKEN;";
const FILE = "src/secret-plans/billing.ts";

// A session full of things the card must never show: code, file names, command output.
const session = {
  title: "Built an expense tracker",
  events: [
    { id: "u", kind: "user", t: 0, title: "Build it", text: `Use ${CODE}` },
    {
      id: "e",
      kind: "edit",
      t: 1,
      title: `Edited ${FILE}`,
      file: FILE,
      diff: { before: "", after: CODE, added: 1, removed: 0 },
    },
    { id: "c", kind: "command", t: 2, title: "Ran npm test", text: "npm test", output: CODE },
    { id: "c-error", kind: "error", t: 3, title: "Error: failed", text: CODE, file: FILE },
  ],
  stats: {
    durationMs: 29 * 60_000,
    filesChanged: 12,
    linesAdded: 4860,
    linesRemoved: 744,
    toolCalls: 215,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 8.97,
    costSource: "exact",
  },
  warnings: { skippedLines: 0, redactions: 0 },
} as unknown as ReplaySession;

afterEach(cleanup);

describe("RecapCard", () => {
  it("shows the title, agent, duration, step count and the four stats", () => {
    const { container } = render(
      <RecapCard session={session} options={{ ...defaultCardOptions(), theme: "violet" }} />,
    );
    const text = container.textContent ?? "";

    for (const expected of ["Built an expense tracker", "Claude Code", "29m", "4 steps"]) {
      expect(text).toContain(expected);
    }
    for (const expected of ["12", "+4,860", "−744", "215", "$8.97", "crafter-replay"]) {
      expect(text).toContain(expected);
    }
  });

  it("shows the biggest moment and where it happened", () => {
    const { container } = render(<RecapCard session={session} options={defaultCardOptions()} />);
    const moment = container.querySelector(".card-moment")?.textContent ?? "";

    expect(moment).toContain("Biggest moment");
    expect(moment).toContain("Biggest change: +1 −0 lines");
    expect(moment).toContain("Step 2 of 4");
  });

  it("draws one strip bar per step, coloured by kind", () => {
    const { container } = render(
      <RecapCard session={session} options={{ ...defaultCardOptions(), theme: "terminal" }} />,
    );
    const bars = [...container.querySelectorAll(".card-strip .card-bar")];

    expect(bars.map((b) => b.className.replace("card-bar bar-", ""))).toEqual([
      "other",
      "edit",
      "command",
      "error",
    ]);
  });

  it("never shows code, file names or command output", () => {
    const { container } = render(
      <RecapCard session={session} options={{ ...defaultCardOptions(), theme: "clay" }} />,
    );
    const text = container.textContent ?? "";

    expect(text).not.toContain("apiKey");
    expect(text).not.toContain("billing.ts");
    expect(text).not.toContain("secret-plans");
  });

  it("is 1080×1920 in every theme", () => {
    for (const theme of ["terminal", "violet", "clay"] as const) {
      const { container, unmount } = render(
        <RecapCard session={session} options={{ ...defaultCardOptions(), theme }} />,
      );

      expect(container.firstElementChild?.className).toBe(`recap-card card-${theme}`);
      unmount();
    }
  });
});

describe("editing the card", () => {
  const withSizes = ({ children }: { children: ReactNode }) => (
    <VirtuosoMockContext.Provider value={{ viewportHeight: 300, itemHeight: 30 }}>
      {children}
    </VirtuosoMockContext.Provider>
  );
  const card = () => document.querySelector(".recap-card")?.textContent ?? "";

  beforeEach(() => {
    render(<Replay session={session} />, { wrapper: withSizes });
    fireEvent.click(screen.getByRole("button", { name: "Recap card" }));
  });

  it("uses the typed title, and the session's own title when cleared", () => {
    const title = screen.getByRole("textbox", { name: "Title" });

    fireEvent.change(title, { target: { value: "Shipped expenses v1" } });
    expect(card()).toContain("Shipped expenses v1");

    fireEvent.change(title, { target: { value: "" } });
    expect(card()).toContain("Built an expense tracker");
  });

  it("lets you pick at most four stats", () => {
    expect(screen.getByRole("checkbox", { name: "Duration" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("checkbox", { name: "Cost" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Duration" }));

    expect(card()).not.toContain("$8.97");
    expect(card()).toContain("Duration");
    expect(screen.getByText("Stats (4 of 4)")).toBeTruthy();
  });

  it("hides file names until they are turned on, and never shows folders", () => {
    const toggle = screen.getByRole("checkbox", { name: "Show file names" });
    expect(toggle).toHaveProperty("checked", false);
    expect(card()).not.toContain("billing.ts");

    fireEvent.click(toggle);

    expect(card()).toContain("billing.ts");
    expect(card()).not.toContain("secret-plans");
    expect(card()).not.toContain("apiKey");
  });
});

describe("opening the card from the replay", () => {
  const withSizes = ({ children }: { children: ReactNode }) => (
    <VirtuosoMockContext.Provider value={{ viewportHeight: 300, itemHeight: 30 }}>
      {children}
    </VirtuosoMockContext.Provider>
  );

  it("opens, switches theme and goes back", () => {
    render(<Replay session={session} />, { wrapper: withSizes });

    fireEvent.click(screen.getByRole("button", { name: "Recap card" }));
    fireEvent.click(screen.getByRole("button", { name: "Clay" }));

    expect(document.querySelector(".recap-card")?.className).toContain("card-clay");
    expect(screen.getByRole("button", { name: "Clay" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "← Back to replay" }));
    expect(screen.getByRole("region", { name: "Steps" })).toBeTruthy();
  });
});
