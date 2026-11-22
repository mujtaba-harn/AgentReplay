// The local replay server (ARCHITECTURE.md §8). Loopback only, Host-checked, GET only,
// and sessions are looked up by id among the ones we located — the browser never names a path.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { parse, type ReplaySession, type SessionSummary } from "@agentreplay/core";
import { staticFile } from "./static.js";

export interface ServerOptions {
  sessions: readonly SessionSummary[];
  webRoot: string;
  /** Undefined means "any free port". */
  port?: number | undefined;
  /** Swappable for tests; defaults to core's parse(). */
  load?: (path: string) => Promise<ReplaySession>;
  /**
   * `--card` only: the card page reports it has finished, so the CLI can exit. Without it the
   * route does not exist. It carries one yes/no and cannot read or write anything.
   */
  onCardDone?: (saved: boolean) => void;
}

export interface RunningServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

const LOOPBACK = "127.0.0.1";
const SESSION_ROUTE = /^\/api\/sessions\/([^/]+)$/;
const JSON_TYPE = "application/json; charset=utf-8";
const TEXT_TYPE = "text/plain; charset=utf-8";

const SAFETY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
};

type Route = (url: URL) => Promise<Reply>;

interface Reply {
  status: number;
  body: Buffer | string;
  contentType: string;
}

const json = (status: number, value: unknown): Reply => ({
  status,
  body: JSON.stringify(value),
  contentType: JSON_TYPE,
});
const text = (status: number, body: string): Reply => ({ status, body, contentType: TEXT_TYPE });

// DNS rebinding: a web page can point its own domain at 127.0.0.1, but cannot fake the Host header.
function isAllowedHost(host: string | undefined, port: number): boolean {
  const value = host?.toLowerCase();
  return value === `${LOOPBACK}:${port}` || value === `localhost:${port}`;
}

/** The first summary wins when two logs share an id; summaries arrive newest first. */
function sessionsById(sessions: readonly SessionSummary[]): Map<string, SessionSummary> {
  const byId = new Map<string, SessionSummary>();
  for (const summary of sessions) if (!byId.has(summary.id)) byId.set(summary.id, summary);
  return byId;
}

function routes(options: ServerOptions): Route {
  const byId = sessionsById(options.sessions);
  const load = options.load ?? parse;
  const cache = new Map<string, Promise<ReplaySession>>();
  const replayOf = (summary: SessionSummary): Promise<ReplaySession> => {
    const cached = cache.get(summary.id) ?? load(summary.path);
    cache.set(summary.id, cached);
    cached.catch(() => cache.delete(summary.id)); // a failed parse may succeed on retry
    return cached;
  };

  return async ({ pathname, searchParams }) => {
    if (pathname === "/api/sessions") return json(200, options.sessions);
    if (pathname === "/api/card-done" && options.onCardDone) {
      options.onCardDone(searchParams.get("saved") === "1");
      return json(200, { ok: true });
    }
    const match = SESSION_ROUTE.exec(pathname);
    const summary = match?.[1] === undefined ? undefined : byId.get(match[1]);
    if (summary) return json(200, await replayOf(summary));
    if (pathname.startsWith("/api/")) return json(404, { error: "No such session." });
    const file = await staticFile(options.webRoot, pathname);
    return file ? { status: 200, ...file } : text(404, "Not found.");
  };
}

async function reply(req: IncomingMessage, route: Route, port: number): Promise<Reply> {
  if (!isAllowedHost(req.headers.host, port)) return text(403, "Forbidden host.");
  if (req.method !== "GET" && req.method !== "HEAD") return text(405, "Only GET is allowed.");
  try {
    return await route(new URL(req.url ?? "/", `http://${LOOPBACK}`));
  } catch {
    // Deliberately no details: an error message could quote log text.
    return json(500, { error: "This session could not be read." });
  }
}

function send(req: IncomingMessage, res: ServerResponse, result: Reply): void {
  res.writeHead(result.status, {
    ...SAFETY_HEADERS,
    "Content-Type": result.contentType,
    "Cache-Control": "no-store",
    ...(result.status === 405 ? { Allow: "GET, HEAD" } : {}),
  });
  res.end(req.method === "HEAD" ? undefined : result.body);
}

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const route = routes(options);
  let port = 0; // set once listening; no request can arrive before that
  const server = createServer((req, res) => {
    void reply(req, route, port).then((result) => send(req, res, result));
  });
  const close = (): Promise<void> =>
    new Promise((done) => {
      server.close(() => done());
      // Idle keep-alive browser connections would hold the server open; a request still being
      // answered (the card page's "done") is allowed to finish first.
      server.closeIdleConnections();
    });
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, LOOPBACK, () => {
      // Listening on a TCP host always yields an AddressInfo, never a pipe name.
      port = (server.address() as AddressInfo).port;
      resolvePromise({ url: `http://${LOOPBACK}:${port}`, port, close });
    });
  });
}
