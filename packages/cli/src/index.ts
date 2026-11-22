import packageJson from "../package.json" with { type: "json" };
import { HELP_TEXT, parseCliArgs } from "./args.js";

function fail(message: string, hint: string): void {
  console.error(`${message}\n${hint}`);
  process.exitCode = 1;
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
  // The picker, server and browser arrive in F1.9–F1.11.
  console.log("agentreplay: session picker and replay are not built yet (coming in F1.9–F1.11).");
}

main(process.argv.slice(2)).catch((error: unknown) => {
  fail(
    "Something went wrong and agentreplay stopped.",
    "Run again with DEBUG=agentreplay to see the details, and report it if it keeps happening.",
  );
  if (process.env.DEBUG === "agentreplay") console.error(error);
});
