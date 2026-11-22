import open from "open";
import type { BrowserState } from "./summary.js";

/**
 * Opens the replay in the default browser. Never throws: the address is printed either way,
 * so a missing browser (e.g. over SSH) only changes the hint we show.
 */
export async function openBrowser(url: string): Promise<BrowserState> {
  try {
    const child = await open(url);
    // A launcher that can't start reports it as an 'error' event; without a listener Node would
    // crash the whole CLI. A missing pid is how we notice that failure in time to say so.
    child.once("error", () => undefined);
    return child.pid === undefined ? "failed" : "opened";
  } catch {
    return "failed"; // same outcome as above: the printed address is the fallback
  }
}
