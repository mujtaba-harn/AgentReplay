import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir as osHomedir } from "node:os";
import { basename, dirname, join } from "node:path";

export interface LocateOptions {
  homedir?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

const LOG_EXTENSION = ".jsonl";

function claudeRoot(options: LocateOptions): string {
  const env = options.env ?? process.env;
  const configured = env.CLAUDE_CONFIG_DIR;
  if (configured) return configured;
  return join(options.homedir ?? osHomedir(), ".claude");
}

// A missing folder just means "no sessions yet"; any other failure (e.g. permissions) is real and surfaces.
async function listEntries(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function logFilesIn(dir: string): Promise<string[]> {
  const entries = await listEntries(dir);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(LOG_EXTENSION))
    .map((entry) => join(dir, entry.name));
}

/** Absolute paths of every main session log. Subagent logs are found per session with `subagentFiles`. */
export async function locate(options: LocateOptions = {}): Promise<string[]> {
  const projectsDir = join(claudeRoot(options), "projects");
  const projects = (await listEntries(projectsDir)).filter((entry) => entry.isDirectory());
  const perProject = await Promise.all(projects.map((p) => logFilesIn(join(projectsDir, p.name))));
  return perProject.flat();
}

/** Subagent logs live in `<session-id>/subagents/` next to the session's own log. */
export async function subagentFiles(sessionPath: string): Promise<string[]> {
  const sessionId = basename(sessionPath, LOG_EXTENSION);
  return logFilesIn(join(dirname(sessionPath), sessionId, "subagents"));
}
