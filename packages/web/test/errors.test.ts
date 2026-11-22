import type { EventKind, ReplayEvent } from "@agentreplay/core";
import { describe, expect, it } from "vitest";
import { fixedBy } from "../src/errors";

const step = (id: string, kind: EventKind, file?: string): ReplayEvent => ({
  id,
  kind,
  t: 0,
  title: id,
  ...(file === undefined ? {} : { file }),
});
const failure = (of: string): ReplayEvent => step(`${of}-error`, "error");

describe("fixedBy", () => {
  it("is the next command that ran without an error", () => {
    const events = [
      step("c1", "command"),
      failure("c1"),
      step("a", "assistant"),
      step("c2", "command"),
    ];

    expect(fixedBy(events, 1)).toBe(3);
  });

  it("skips later attempts that failed too", () => {
    const events = [
      step("c1", "command"),
      failure("c1"),
      step("c2", "command"),
      failure("c2"),
      step("c3", "command"),
    ];

    expect(fixedBy(events, 1)).toBe(4);
  });

  it("needs an edit to the same file to count as the fix", () => {
    const events = [
      step("e1", "edit", "src/a.ts"),
      failure("e1"),
      step("e2", "edit", "src/b.ts"),
      step("e3", "edit", "src/a.ts"),
    ];

    expect(fixedBy(events, 1)).toBe(3);
  });

  it("finds the failed step even when other steps came in between", () => {
    const events = [step("c1", "command"), step("r", "read"), failure("c1"), step("c2", "command")];

    expect(fixedBy(events, 2)).toBe(3);
  });

  it("is undefined when nothing later fixed it", () => {
    expect(fixedBy([step("c1", "command"), failure("c1")], 1)).toBeUndefined();
  });

  it("is undefined for a step that is not an error", () => {
    expect(fixedBy([step("c1", "command"), step("c2", "command")], 0)).toBeUndefined();
  });
});
