import { describe, expect, it } from "vitest";
import { AGENTREPLAY_VERSION } from "../src/index.js";

describe("AGENTREPLAY_VERSION", () => {
  it("is a semantic version string", () => {
    expect(AGENTREPLAY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
