// Serves the built web UI. The only rule that matters for safety: never read outside `root`.
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

export interface StaticFile {
  body: Buffer | string;
  contentType: string;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const FALLBACK_TYPE = "application/octet-stream";
const HTML = CONTENT_TYPES[".html"] ?? FALLBACK_TYPE;

/** Shown when the server runs before `pnpm build` has produced the UI. */
const NOT_BUILT_PAGE = `<!doctype html><meta charset="utf-8"><title>AgentReplay</title>
<p>The AgentReplay web UI has not been built yet. Run <code>pnpm build</code> and start again.</p>`;

/** The file a URL path points to, or undefined if it would land outside `root`. */
export function fileInside(root: string, urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined; // malformed %-escape: no file can match it
  }
  if (decoded.includes("\0")) return undefined;
  const base = resolve(root);
  const full = resolve(base, `.${decoded}`);
  return full.startsWith(base + sep) ? full : undefined;
}

async function readIfExists(path: string | undefined): Promise<Buffer | undefined> {
  if (path === undefined) return undefined;
  try {
    return await readFile(path);
  } catch (error) {
    const missing = error instanceof Error && "code" in error;
    if (missing && (error.code === "ENOENT" || error.code === "EISDIR")) return undefined;
    throw error;
  }
}

/**
 * The file for a URL path. Paths without an extension are app routes and get index.html;
 * undefined means a real 404 (a missing asset, or a path outside the UI folder).
 */
export async function staticFile(root: string, urlPath: string): Promise<StaticFile | undefined> {
  const wanted = urlPath === "/" ? "/index.html" : urlPath;
  const path = fileInside(root, wanted);
  const body = await readIfExists(path);
  if (path !== undefined && body !== undefined) {
    return { body, contentType: CONTENT_TYPES[extname(path)] ?? FALLBACK_TYPE };
  }
  if (extname(wanted) !== "" && wanted !== "/index.html") return undefined;
  const index = await readIfExists(fileInside(root, "/index.html"));
  return { body: index ?? NOT_BUILT_PAGE, contentType: HTML };
}
