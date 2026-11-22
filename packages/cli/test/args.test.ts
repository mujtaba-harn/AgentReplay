import { describe, expect, it } from "vitest";
import { HELP_TEXT, parseCliArgs } from "../src/args.js";

describe("parseCliArgs", () => {
  it("defaults to the picker, a random port and opening the browser", () => {
    expect(parseCliArgs([])).toEqual({
      ok: true,
      options: { latest: false, card: false, open: true, help: false, version: false },
    });
  });

  it("reads every flag", () => {
    const result = parseCliArgs(["--latest", "--card", "--port", "4321", "--no-open"]);

    expect(result).toEqual({
      ok: true,
      options: { latest: true, card: true, port: 4321, open: false, help: false, version: false },
    });
  });

  it("reads --path and the short -h / -v forms", () => {
    expect(parseCliArgs(["--path", "session.jsonl"])).toMatchObject({
      ok: true,
      options: { path: "session.jsonl" },
    });
    expect(parseCliArgs(["-h"])).toMatchObject({ ok: true, options: { help: true } });
    expect(parseCliArgs(["-v"])).toMatchObject({ ok: true, options: { version: true } });
  });

  it.each([
    [["--colour"], "Unknown option --colour."],
    [["--port", "eighty"], "--port needs a number from 1 to 65535, not eighty."],
    [["--port", "70000"], "--port needs a number from 1 to 65535, not 70000."],
    [["--path"], "--path needs a value."],
    [["--latest", "--path", "a.jsonl"], "Use either --latest or --path, not both."],
    [["session.jsonl"], "Unexpected argument session.jsonl."],
  ])("explains what is wrong with %j", (argv, message) => {
    const result = parseCliArgs(argv);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(message);
      expect(result.hint).toBe("Run agentreplay --help to see all options.");
    }
  });
});

describe("help text", () => {
  it.each(["--latest", "--card", "--port", "--no-open", "--path", "--help", "--version"])(
    "lists %s",
    (flag) => {
      expect(HELP_TEXT).toContain(flag);
    },
  );

  it("states that data stays local", () => {
    expect(HELP_TEXT).toContain("Data never leaves your computer.");
  });
});
