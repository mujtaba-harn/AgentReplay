// @vitest-environment jsdom
import type { ReplaySession } from "@agentreplay/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, describe, expect, it } from "vitest";
import { RecapCard } from "../src/components/RecapCard";
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
    const { container } = render(<RecapCard session={session} theme="violet" />);
    const text = container.textContent ?? "";

    for (const expected of ["Built an expense tracker", "Claude Code", "29m", "4 steps"]) {
      expect(text).toContain(expected);
    }
    for (const expected of ["12", "+4,860", "−744", "215", "$8.97", "agentreplay"]) {
      expect(text).toContain(expected);
    }
  });

  it("draws one strip bar per step, coloured by kind", () => {
    const { container } = render(<RecapCard session={session} theme="terminal" />);
    const bars = [...container.querySelectorAll(".card-strip .card-bar")];

    expect(bars.map((b) => b.className.replace("card-bar bar-", ""))).toEqual([
      "other",
      "edit",
      "command",
      "error",
    ]);
  });

  it("never shows code, file names or command output", () => {
    const { container } = render(<RecapCard session={session} theme="clay" />);
    const text = container.textContent ?? "";

    expect(text).not.toContain("apiKey");
    expect(text).not.toContain("billing.ts");
    expect(text).not.toContain("secret-plans");
  });

  it("is 1080×1920 in every theme", () => {
    for (const theme of ["terminal", "violet", "clay"] as const) {
      const { container, unmount } = render(<RecapCard session={session} theme={theme} />);

      expect(container.firstElementChild?.className).toBe(`recap-card card-${theme}`);
      unmount();
    }
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
