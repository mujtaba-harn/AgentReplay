import type { TokenUsage } from "../../types.js";
import type { AssistantLine } from "./schema.js";

export const ZERO_TOKENS: TokenUsage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };

export function addTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    in: a.in + b.in,
    out: a.out + b.out,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}

/** Adds every model's tokens from `from` into `into`. */
export function mergeTokens(
  into: Record<string, TokenUsage>,
  from: Record<string, TokenUsage>,
): void {
  for (const [model, tokens] of Object.entries(from)) {
    into[model] = addTokens(into[model] ?? ZERO_TOKENS, tokens);
  }
}

export function tokensOf(line: AssistantLine): TokenUsage | undefined {
  const usage = line.message.usage;
  if (usage === undefined) return undefined;
  return {
    in: usage.input_tokens,
    out: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
}

/** The part of a reply's cache writes that used the cheaper 5-minute lifetime. */
export function shortCacheWritesOf(line: AssistantLine): number {
  return line.message.usage?.cache_creation?.ephemeral_5m_input_tokens ?? 0;
}

/** One API reply spans several lines sharing a requestId (see schema.ts). */
export const replyId = (line: AssistantLine): string => line.requestId ?? line.uuid;
