import { fileURLToPath } from "node:url";
import type { SessionSummary } from "@agentreplay/core";
import { cancel } from "@clack/prompts";
import packageJson from "../package.json" with { type: "json" };
import { type CliOptions, HELP_TEXT, parseCliArgs } from "./args.js";
import { openBrowser } from "./browser.js";
import { pickSession } from "./picker.js";
import { type RunningServer, startServer } from "./server.js";
import { findSessions, sessionAt } from "./sessions.js";
import { cardDoneMessage, cardSummary, cardUrl, replayUrl, runningSummary } from "./summary.js";

// The build copies the web UI next to the bundled CLI (see tsup.config.ts).
const WEB_ROOT = fileURLToPath(new URL("./web", import.meta.url));

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
  // PRD US-5: --card makes the card for the latest session, with no picker.
  if (options.latest || options.card) return summaries[0];
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
  await (options.card ? exportCard : serve)(session, options);
}

function isPortTaken(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

/** Starts the server, or explains a taken port and returns undefined. */
async function start(
  session: SessionSummary,
  options: CliOptions,
  onCardDone?: (saved: boolean) => void,
): Promise<RunningServer | undefined> {
  try {
    return await startServer({
      sessions: [session],
      webRoot: WEB_ROOT,
      port: options.port,
      ...(onCardDone ? { onCardDone } : {}),
    });
  } catch (error) {
    if (!isPortTaken(error)) throw error;
    fail(
      `Port ${options.port} is already in use.`,
      "Pick another with --port N, or leave it out to use any free port.",
    );
    return undefined;
  }
}

function stopOnCtrlC(server: RunningServer): void {
  process.once("SIGINT", () => {
    void server.close().then(() => console.log("Stopped."));
  });
}

/** Runs the replay server, opens the browser unless --no-open, and waits for Ctrl+C. */
async function serve(session: SessionSummary, options: CliOptions): Promise<void> {
  const server = await start(session, options);
  if (!server) return;
  const url = replayUrl(server.url, session.id);
  const browser = options.open ? await openBrowser(url) : "skipped";
  console.log(runningSummary(session, url, browser).join("\n"));
  stopOnCtrlC(server);
}

/** --card: the browser draws and downloads the card, reports back, and we exit. */
async function exportCard(session: SessionSummary, options: CliOptions): Promise<void> {
  let server: RunningServer | undefined;
  const onCardDone = (saved: boolean) => {
    console.log(cardDoneMessage(saved));
    if (!saved) process.exitCode = 1;
    void server?.close();
  };
  server = await start(session, options, onCardDone);
  if (!server) return;
  const url = cardUrl(server.url, session.id);
  const browser = options.open ? await openBrowser(url) : "skipped";
  console.log(cardSummary(session, url, browser).join("\n"));
  stopOnCtrlC(server);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  fail(
    "Something went wrong and crafter-replay stopped.",
    "Run again with DEBUG=crafter-replay to see the details, and report it if it keeps happening.",
  );
  if (process.env.DEBUG === "crafter-replay") console.error(error);
});
