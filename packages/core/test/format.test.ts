import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/format.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("formatDuration", () => {
  it.each([
    [0, "<1m"],
    [20_000, "<1m"],
    [12 * MINUTE + 30_000, "12m"],
    [2 * HOUR, "2h"],
    [HOUR + 5 * MINUTE, "1h 5m"],
    [49 * HOUR, "49h"],
  ])("shows %d ms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
