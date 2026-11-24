// F1.23: turn the recap card into a 1080×1920 PNG. html-to-image is loaded only when needed.

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;
const RELEASE_DELAY_MS = 1000;

/** The card's PNG. The preview shrinks the card with a transform, so the export undoes it. */
export async function renderCard(node: HTMLElement): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    canvasWidth: CARD_WIDTH,
    canvasHeight: CARD_HEIGHT,
    pixelRatio: 1,
    // The card uses system fonts only; skipping embedding also means no font is ever fetched.
    skipFonts: true,
    style: { transform: "none" },
  });
  if (!blob) throw new Error("The browser could not draw the card.");
  return blob;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Named after the day only: no project or file names leak through the file name. */
export function cardFileName(day: Date): string {
  const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  return `crafter-replay-card-${date}.png`;
}

/** Saves the card through the browser's normal download; returns the file name used. */
export async function downloadCard(node: HTMLElement, today = new Date()): Promise<string> {
  const blob = await renderCard(node);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = cardFileName(today);
  link.click();
  // Freeing the URL in the same instant can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), RELEASE_DELAY_MS);
  return link.download;
}

export async function copyCard(node: HTMLElement): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("This browser can't copy images. Use Download instead.");
  }
  const blob = await renderCard(node);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
