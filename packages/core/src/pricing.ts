// Model → USD per million tokens. Used only when a log has no cost-state line of its own.
// Derived from Claude Code's recorded per-model costs in test/fixtures (Nov 2026): Opus from
// 9 sessions, Sonnet and Haiku from one each; every one reproduces exactly.
import type { TokenUsage } from "./types.js";

interface ModelPrice {
  in: number;
  out: number;
  cacheRead: number;
  /** Cache writes kept for 5 minutes (subagents use these). */
  cacheWrite5m: number;
  /** Cache writes kept for 1 hour (Claude Code's default for the main session). */
  cacheWrite1h: number;
}

const PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.1, cacheWrite5m: 2.5, cacheWrite1h: 4 },
  "claude-haiku-5-5": {
    in: 0.1,
    out: 0.5,
    cacheRead: 0.01,
    cacheWrite5m: 0.125,
    cacheWrite1h: 0.2,
  },
};

/** Exact id, or the id with a date suffix such as "claude-opus-5-5-20261101". */
function priceOf(model: string): ModelPrice | undefined {
  const known = Object.keys(PRICES).find((id) => model === id || model.startsWith(`${id}-`));
  return known === undefined ? undefined : PRICES[known];
}

/**
 * Estimated USD for the given tokens. `shortCacheWritesByModel` says how many of each model's
 * cache writes were 5-minute ones; the rest are priced as 1-hour writes. Models we have no price
 * for — including Claude Code's own "<synthetic>" replies — add nothing, so the estimate can
 * only err low, never invent cost.
 */
export function estimateCost(
  tokensByModel: Readonly<Record<string, TokenUsage>>,
  shortCacheWritesByModel: Readonly<Record<string, number>> = {},
): number {
  let usd = 0;
  for (const [model, t] of Object.entries(tokensByModel)) {
    const price = priceOf(model);
    if (price === undefined) continue;
    const shortWrites = Math.min(shortCacheWritesByModel[model] ?? 0, t.cacheWrite);
    usd +=
      (t.in * price.in +
        t.out * price.out +
        t.cacheRead * price.cacheRead +
        shortWrites * price.cacheWrite5m +
        (t.cacheWrite - shortWrites) * price.cacheWrite1h) /
      1_000_000;
  }
  return usd;
}
