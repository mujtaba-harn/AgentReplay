import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, type ReplayEvent } from "@crafter-replay/core";
import { describe, expect, it } from "vitest";
import { biggestMoment, formatSpan } from "../src/moment";

const FIXTURES = join(import.meta.dirname, "..", "..", "core", "test", "fixtures");

let n = 0;
const step = (kind: ReplayEvent["kind"], extra: Partial<ReplayEvent> = {}): ReplayEvent => ({
  id: `s${n++}`,
  kind,
  t: 0,
  title: "x",
  ...extra,
});
const failure = (of: ReplayEvent): ReplayEvent => step("error", { id: `${of.id}-error` });
const edit = (added: number, removed: number, file = "src/deep/App.tsx") =>
  step("edit", { file, diff: { before: "secret code", after: "more code", added, removed } });

describe("biggestMoment", () => {
  it("prefers the first fixed error, naming the step that fixed it", () => {
    const run = step("command");
    const events = [step("user"), edit(500, 0), run, failure(run), step("command")];

    expect(biggestMoment(events, false)).toEqual({
      headline: "Fixed a failing command on the next try",
      step: 5,
    });
  });

  it("counts the failed tries before the fix", () => {
    const first = step("command");
    const second = step("command");
    const events = [first, failure(first), second, failure(second), step("command")];

    expect(biggestMoment(events, false)?.headline).toBe(
      "Fixed a failing command after 2 failed tries",
    );
  });

  it("skips errors that were never fixed", () => {
    const run = step("command");

    expect(biggestMoment([run, failure(run), edit(3, 1)], false)?.headline).toBe(
      "Biggest change: +3 −1 lines",
    );
  });

  it("otherwise picks the largest edit, the first one on a tie", () => {
    const events = [edit(10, 2), edit(40, 20), edit(50, 10)];

    expect(biggestMoment(events, false)).toEqual({
      headline: "Biggest change: +40 −20 lines",
      step: 2,
    });
  });

  it("adds the file name only when file names are switched on", () => {
    expect(biggestMoment([edit(5, 1)], true)?.headline).toBe(
      "Biggest change: +5 −1 lines in App.tsx",
    );
  });

  it("otherwise picks the command that ran longest", () => {
    const events = [
      step("command", { t: 0 }),
      step("assistant", { t: 5_000 }),
      step("command", { t: 6_000 }),
      step("assistant", { t: 206_000 }),
    ];

    expect(biggestMoment(events, false)).toEqual({
      headline: "Longest command ran for 3m 20s",
      step: 3,
    });
  });

  it("has nothing to say about a session without errors, edits or commands", () => {
    expect(biggestMoment([step("user"), step("assistant")], false)).toBeUndefined();
  });

  it("never quotes code, commands or folders", () => {
    const run = step("command", { title: "Ran rm -rf build", text: "rm -rf build" });
    const events = [run, failure(run), step("command"), edit(9, 9)];
    const headlines = [false, true].map((files) => biggestMoment(events, files)?.headline ?? "");

    for (const headline of headlines) {
      expect(headline).not.toMatch(/rm -rf|secret code|src\/deep/);
    }
  });
});

describe("formatSpan", () => {
  it.each([
    [800, "1s"],
    [45_000, "45s"],
    [200_000, "3m 20s"],
    [3_720_000, "1h 2m"],
  ])("shows %d ms as %s", (ms, text) => {
    expect(formatSpan(ms)).toBe(text);
  });
});

describe("biggestMoment on the sample sessions", () => {
  it("gives the same answer every time", async () => {
    const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      const { events } = await parse(join(FIXTURES, file));
      const again = await parse(join(FIXTURES, file));

      expect(biggestMoment(again.events, false)).toEqual(biggestMoment(events, false));
    }
  });

  it("finds the first fixed error in the long expense-tracker session", async () => {
    const { events } = await parse(join(FIXTURES, "05-expense-tracker-long.jsonl"));

    expect(biggestMoment(events, false)?.headline).toMatch(/^Fixed a failing /);
  });
});
