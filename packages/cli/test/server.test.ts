import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { summarize } from "@agentreplay/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../src/server.js";

const FIXTURE = join(
  import.meta.dirname,
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "01-todo-app-short.jsonl",
);

interface Response {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

// node:http rather than fetch, because fetch does not let a test set its own Host header.
function get(path: string, options: { host?: string; method?: string } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: server.port,
        path,
        method: options.method ?? "GET",
        // An empty string means "send no Host header at all"; Node would otherwise add a correct one.
        setHost: false,
        headers: options.host === "" ? {} : { host: options.host ?? `127.0.0.1:${server.port}` },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

let server: RunningServer;
let webRoot: string;
let sessionId: string;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "agentreplay-server-"));
  webRoot = join(dir, "web");
  mkdirSync(join(webRoot, "assets"), { recursive: true });
  writeFileSync(join(webRoot, "index.html"), "<h1>replay ui</h1>");
  writeFileSync(join(webRoot, "assets", "app.js"), "console.log(1)");
  writeFileSync(join(dir, "secret.txt"), "outside the web folder");
  const summary = await summarize(FIXTURE);
  sessionId = summary.id;
  server = await startServer({ sessions: [summary], webRoot });
});

afterAll(async () => {
  await server.close();
  rmSync(join(webRoot, ".."), { recursive: true, force: true });
});

describe("startServer", () => {
  it("listens on 127.0.0.1 and a free port", () => {
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
    expect(server.port).toBeGreaterThan(0);
  });

  it("lists the located sessions", async () => {
    const res = await get("/api/sessions");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(res.body)).toMatchObject([{ id: sessionId, project: "01-todo-app" }]);
  });

  it("returns the full replay for a located session id", async () => {
    const res = await get(`/api/sessions/${sessionId}`);

    expect(res.status).toBe(200);
    const replay = JSON.parse(res.body) as { events: unknown[] };
    expect(replay.events.length).toBeGreaterThan(0);
  });

  it.each(["/api/sessions/nope", "/api/sessions/..%2F..%2Fsecret", "/api/other"])(
    "answers 404 for %s",
    async (path) => {
      expect((await get(path)).status).toBe(404);
    },
  );

  it("serves the UI and its assets with the right type", async () => {
    const page = await get("/");
    const script = await get("/assets/app.js");

    expect(page.body).toBe("<h1>replay ui</h1>");
    expect(page.headers["content-type"]).toContain("text/html");
    expect(script.headers["content-type"]).toContain("text/javascript");
  });

  it("serves index.html for app routes without a file extension", async () => {
    expect((await get("/session/abc")).body).toBe("<h1>replay ui</h1>");
  });

  it.each(["/../secret.txt", "/%2e%2e/secret.txt", "/..%2Fsecret.txt", "/..%5Csecret.txt"])(
    "never serves files outside the UI folder (%s)",
    async (path) => {
      const res = await get(path);

      expect(res.body).not.toContain("outside the web folder");
    },
  );

  it.each(["evil.example:80", "127.0.0.1.evil.example", "127.0.0.1:1", ""])(
    "rejects requests with Host %j",
    async (host) => {
      const res = await get("/api/sessions", { host });

      // 403 from our check; a missing Host is already refused by Node itself with 400.
      expect([400, 403]).toContain(res.status);
      expect(res.body).not.toContain(sessionId);
    },
  );

  it("accepts localhost as the Host", async () => {
    expect((await get("/api/sessions", { host: `localhost:${server.port}` })).status).toBe(200);
  });

  it("refuses anything but GET and HEAD", async () => {
    const res = await get("/api/sessions", { method: "POST" });

    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("GET, HEAD");
  });

  it("sends headers that stop other sites from framing or sniffing responses", async () => {
    const { headers } = await get("/");

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("fails to start on a port that is already taken", async () => {
    await expect(startServer({ sessions: [], webRoot, port: server.port })).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
  });
});

describe("a server without a built UI", () => {
  it("shows a readable page instead of an error", async () => {
    const bare = await startServer({ sessions: [], webRoot: join(webRoot, "missing") });
    try {
      const res = await new Promise<string>((resolve, reject) => {
        request({ port: bare.port, host: "127.0.0.1", path: "/" }, (r) => {
          let body = "";
          r.on("data", (c: Buffer) => {
            body += c.toString();
          });
          r.on("end", () => resolve(body));
        })
          .on("error", reject)
          .end();
      });

      expect(res).toContain("has not been built yet");
    } finally {
      await bare.close();
    }
  });
});
