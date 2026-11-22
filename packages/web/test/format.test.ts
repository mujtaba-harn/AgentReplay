import { describe, expect, it } from "vitest";
import { formatClock, formatCost, formatCount } from "../src/format";

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [65_000, "1:05"],
    [3_725_000, "1:02:05"],
  ])("shows %d ms as %s", (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe("formatCount", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1234, "1.2K"],
    [45_000, "45K"],
    [1_250_000, "1.3M"],
    [12_000_000, "12M"],
  ])("shows %d as %s", (n, text) => {
    expect(formatCount(n)).toBe(text);
  });
});

describe("formatCost", () => {
  it.each([
    [0, "$0.00"],
    [0.004, "<$0.01"],
    [0.328, "$0.33"],
    [12.5, "$12.50"],
  ])("shows %d as %s", (usd, text) => {
    expect(formatCost(usd)).toBe(text);
  });
});
