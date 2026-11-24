// @vitest-environment jsdom
import type { ReplaySession } from "@crafter-replay/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const downloadCard = vi.fn(async () => "crafter-replay-card-2026-11-23.png");
const copyCard = vi.fn(async () => {});
vi.mock("../src/export", () => ({ downloadCard, copyCard }));

const { CardExport } = await import("../src/components/CardExport");
const { CardView } = await import("../src/components/CardView");

const session = {
  title: "Built an expense tracker",
  events: [{ id: "u", kind: "user", t: 0, title: "Build it" }],
  stats: {
    durationMs: 60_000,
    filesChanged: 1,
    linesAdded: 1,
    linesRemoved: 0,
    toolCalls: 1,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.1,
    costSource: "exact",
  },
  warnings: { skippedLines: 0, redactions: 0 },
} as unknown as ReplaySession;

const fetchMock = vi.fn(async () => new Response("{}"));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("CardView buttons", () => {
  it("downloads the card and says where it went", async () => {
    render(<CardView session={session} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Download PNG" }));

    expect(await screen.findByText("Saved crafter-replay-card-2026-11-23.png")).toBeTruthy();
    expect(downloadCard).toHaveBeenCalledWith(document.querySelector(".recap-card"));
  });

  it("copies the card", async () => {
    render(<CardView session={session} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));

    expect(await screen.findByText("Copied. Paste it anywhere.")).toBeTruthy();
  });

  it("explains a failed copy in plain words", async () => {
    copyCard.mockRejectedValueOnce(
      new Error("This browser can't copy images. Use Download instead."),
    );
    render(<CardView session={session} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));

    const message = await screen.findByText(/can't copy images/);
    expect(message.className).toContain("is-failed");
  });
});

describe("CardExport (--card)", () => {
  it("downloads the card by itself and tells the CLI it was saved", async () => {
    render(<CardExport session={session} />);

    expect(await screen.findByText(/Saved crafter-replay-card-2026-11-23.png/)).toBeTruthy();
    expect(downloadCard).toHaveBeenCalledOnce();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/card-done?saved=1"));
  });

  it("tells the CLI when the card could not be saved", async () => {
    downloadCard.mockRejectedValueOnce(new Error("The browser could not draw the card."));
    render(<CardExport session={session} />);

    expect(await screen.findByText("Your card couldn't be saved.")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/card-done?saved=0"));
  });
});
