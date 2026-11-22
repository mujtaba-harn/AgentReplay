// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const toBlob = vi.fn(async () => new Blob(["png"], { type: "image/png" }));
vi.mock("html-to-image", () => ({ toBlob }));

const { CARD_HEIGHT, CARD_WIDTH, cardFileName, copyCard, downloadCard, renderCard } = await import(
  "../src/export"
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("renderCard", () => {
  it("renders exactly 1080×1920, unscaled, without fetching fonts", async () => {
    const node = document.createElement("div");

    await renderCard(node);

    expect(CARD_WIDTH).toBe(1080);
    expect(CARD_HEIGHT).toBe(1920);
    expect(toBlob).toHaveBeenCalledWith(node, {
      width: 1080,
      height: 1920,
      canvasWidth: 1080,
      canvasHeight: 1920,
      pixelRatio: 1,
      skipFonts: true,
      style: { transform: "none" },
    });
  });

  it("explains when the browser could not draw the card", async () => {
    toBlob.mockResolvedValueOnce(null as unknown as Blob);

    await expect(renderCard(document.createElement("div"))).rejects.toThrow(
      "The browser could not draw the card.",
    );
  });
});

describe("cardFileName", () => {
  it("names the file after the day, never the project or files", () => {
    expect(cardFileName(new Date(2026, 10, 23))).toBe("agentreplay-card-2026-11-23.png");
  });
});

describe("downloadCard", () => {
  it("saves the PNG under the card's file name", async () => {
    URL.createObjectURL = vi.fn(() => "blob:card");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.useFakeTimers();

    const name = await downloadCard(document.createElement("div"), new Date(2026, 10, 23));

    expect(name).toBe("agentreplay-card-2026-11-23.png");
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card");
    vi.useRealTimers();
  });
});

describe("copyCard", () => {
  it("puts the PNG on the clipboard", async () => {
    const write = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { write } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(readonly items: Record<string, Blob>) {}
      },
    );

    await copyCard(document.createElement("div"));

    expect(write).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("explains when the browser cannot copy images", async () => {
    Object.assign(navigator, { clipboard: undefined });

    await expect(copyCard(document.createElement("div"))).rejects.toThrow(
      "This browser can't copy images. Use Download instead.",
    );
  });
});
