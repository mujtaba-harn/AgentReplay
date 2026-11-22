import { fileURLToPath } from "node:url";
import type { SessionSummary } from "@agentreplay/core";
import { cancel } from "@clack/prompts";
import packageJson from "../package.json" with { type: "json" };
import { type CliOptions, HELP_TEXT, parseCliArgs } from "./args.js";
import { pickSession } from "./picker.js";
import { type RunningServer, startServer } from "./server.js";
import { findSessions, sessionAt } from "./sessions.js";

// The built UI next to this package in the repo; F1.12 bundles it into the published package.
const WEB_ROOT = fileURLToPath(new URL("../../web/dist", import.meta.url));

function fail(message: string, hint: string): void {
  console.error(`${message}\n${hint}`);
  process.exitCode = 1;
}

async function sessionFromPath(path: string): Promise<SessionSummary | undefined> {
  const summary = await sessionAt(path);
  if (!summary) fail(`There is no session log at ${path}.`, "Check the path and try again.");
  return summary;
}

async function chooseSession(options: CliOptions): Promise<SessionSummary | undefined> {
  if (options.path !== undefined) return sessionFromPath(options.path);
  const { folder, summaries, unreadable } = await findSessions();
  if (unreadable > 0) console.warn(`Skipped ${unreadable} session log(s) that could not be read.`);
  if (summaries.length === 0) {
    fail(
      `No Claude Code sessions found in ${folder}.`,
      "Run a session with Claude Code first, or open a log directly with --path FILE.",
    );
    return undefined;
  }
  if (options.latest) return summaries[0];
  if (!process.stdin.isTTY) {
    fail(
      "The session list needs an interactive terminal.",
      "Use --latest for the newest session, or --path FILE for a specific one.",
    );
    return undefined;
  }
  const picked = await pickSession(summaries);
  if (!picked) cancel("No session picked.");
  return picked;
}

async function main(argv: readonly string[]): Promise<void> {
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    fail(parsed.message, parsed.hint);
    return;
  }
  const { options } = parsed;
  if (options.help) {
    console.log(HELP_TEXT);
    return;
  }
  if (options.version) {
    console.log(packageJson.version);
    return;
  }
  const session = await chooseSession(options);
  if (!session) return;
  await serve(session, options.port);
}

function isPortTaken(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

/** Runs the replay server until Ctrl+C. Opening the browser arrives in F1.11. */
async function serve(session: SessionSummary, port: number | undefined): Promise<void> {
  let server: RunningServer;
  try {
    server = await startServer({ sessions: [session], webRoot: WEB_ROOT, port });
  } catch (error) {
    if (!isPortTaken(error)) throw error;
    fail(
      `Port ${port} is already in use.`,
      "Pick another with --port N, or leave it out to use any free port.",
    );
    return;
  }
  console.log(`Replay of "${session.title}" running at ${server.url}`);
  console.log("Press Ctrl+C to stop.");
  process.once("SIGINT", () => {
    void server.close().then(() => console.log("Stopped."));
  });
}

main(process.argv.slice(2)).catch((error: unknown) => {
  fail(
    "Something went wrong and agentreplay stopped.",
    "Run again with DEBUG=agentreplay to see the details, and report it if it keeps happening.",
  );
  if (process.env.DEBUG === "agentreplay") console.error(error);
});
