import { describe, expect, it } from "vitest";
import { loadReplay, sessionIdFrom } from "../src/api";

const replay = {
  id: "abc",
  title: "Fix the login bug",
  project: "todo-app",
  events: [],
  stats: { durationMs: 0 },
  warnings: { skippedLines: 0, redactions: 0 },
};

const answer = (status: number, body: unknown) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("sessionIdFrom", () => {
  it("reads the session the CLI put in the address", () => {
    expect(sessionIdFrom("?session=abc-123")).toBe("abc-123");
  });

  it("is undefined when the page was opened without a session", () => {
    expect(sessionIdFrom("")).toBeUndefined();
    expect(sessionIdFrom("?session=")).toBeUndefined();
  });
});

describe("loadReplay", () => {
  it("returns the session on success", async () => {
    const result = await loadReplay("abc", answer(200, replay));

    expect(result).toEqual({ ok: true, session: replay });
  });

  it("asks for the right URL", async () => {
    let asked = "";
    await loadReplay("a b", async (url) => {
      asked = String(url);
      return new Response(JSON.stringify(replay));
    });

    expect(asked).toBe("/api/sessions/a%20b");
  });

  it.each([
    [
      "the server was stopped",
      async () => Promise.reject(new TypeError("Failed to fetch")),
      "unreachable",
    ],
    ["the session is unknown", answer(404, { error: "No such session." }), "notFound"],
    ["the log could not be read", answer(500, { error: "x" }), "unreadable"],
    ["the reply is not JSON", answer(200, "<html>"), "unexpected"],
    ["the reply has the wrong shape", answer(200, { events: "nope" }), "unexpected"],
  ])("explains when %s", async (_case, fetcher, problem) => {
    const result = await loadReplay("abc", fetcher);

    expect(result).toEqual({ ok: false, problem });
  });
});
