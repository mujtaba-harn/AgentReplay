// Command-line options (ARCHITECTURE.md §8). Uses Node's built-in parseArgs.
import { parseArgs } from "node:util";

export interface CliOptions {
  latest: boolean;
  card: boolean;
  /** Undefined means "pick any free port". */
  port?: number;
  path?: string;
  open: boolean;
  help: boolean;
  version: boolean;
}

export type ParsedArgs =
  | { ok: true; options: CliOptions }
  | { ok: false; message: string; hint: string };

const HINT = "Run crafter-replay --help to see all options.";

export const HELP_TEXT = `Usage: crafter-replay [options]

Replay a Claude Code session in your browser.

Options:
  --latest        Open the most recent session, skip the picker
  --path FILE     Open this session log instead of picking one
  --card          Save a recap card PNG of the latest session (or --path) and exit
  --port N        Serve on port N (default: any free port)
  --no-open       Don't open the browser; just print the address
  -h, --help      Show this help
  -v, --version   Show the version

Data never leaves your computer.`;

const OPTIONS = {
  latest: { type: "boolean" },
  card: { type: "boolean" },
  port: { type: "string" },
  path: { type: "string" },
  "no-open": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

const fail = (message: string): ParsedArgs => ({ ok: false, message, hint: HINT });

/** Turns parseArgs' technical errors into one plain sentence. */
function explain(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const unknown = /Unknown option '([^']+)'/.exec(text);
  if (unknown) return `Unknown option ${unknown[1]}.`;
  const missing = /Option '(?:-\w, )?(--[\w-]+) <value>' argument missing/.exec(text);
  if (missing) return `${missing[1]} needs a value.`;
  const positional = /Unexpected argument '([^']+)'/.exec(text);
  if (positional) return `Unexpected argument ${positional[1]}.`;
  return text;
}

function parsePort(raw: string): number | undefined {
  const port = Number(raw);
  return /^\d+$/.test(raw) && port >= 1 && port <= 65535 ? port : undefined;
}

export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  let values: ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>["values"];
  try {
    values = parseArgs({ args: [...argv], options: OPTIONS, strict: true }).values;
  } catch (error) {
    return fail(explain(error));
  }
  if (values.latest && values.path !== undefined) {
    return fail("Use either --latest or --path, not both.");
  }
  const options: CliOptions = {
    latest: values.latest ?? false,
    card: values.card ?? false,
    open: !(values["no-open"] ?? false),
    help: values.help ?? false,
    version: values.version ?? false,
  };
  if (values.path !== undefined) options.path = values.path;
  if (values.port !== undefined) {
    const port = parsePort(values.port);
    if (port === undefined)
      return fail(`--port needs a number from 1 to 65535, not ${values.port}.`);
    options.port = port;
  }
  return { ok: true, options };
}
