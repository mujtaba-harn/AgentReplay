// F1.12 check: pack the CLI, install the tarball into an empty folder (like `npx` on a fresh
// machine), and run a real replay from it. Run with `pnpm --filter crafter-replay smoke` after a build.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

const CLI_DIR = join(import.meta.dirname, "..");
const FIXTURE = join(CLI_DIR, "..", "core", "test", "fixtures", "01-todo-app-short.jsonl");
const MAX_UNPACKED_BYTES = 5 * 1024 * 1024; // ARCHITECTURE.md §11
const IS_WINDOWS = process.platform === "win32";

function run(command: string, args: readonly string[], cwd: string): string {
  // pnpm and npm are .cmd shims on Windows, which only start through a shell.
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: IS_WINDOWS });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function folderSize(path: string): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + folderSize(join(path, name)), 0);
}

function waitForUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`No address printed:\n${output}`)), 15_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += stripVTControlCharacters(chunk.toString());
      const url = /http:\/\/127\.0\.0\.1:\d+\/\?session=\S+/.exec(output)?.[0];
      if (url === undefined) return;
      clearTimeout(timer);
      resolve(url);
    });
    child.once("exit", (code) => reject(new Error(`CLI exited early (${code}):\n${output}`)));
  });
}

async function expectReplayServed(entry: string): Promise<void> {
  const child = spawn(process.execPath, [entry, "--path", FIXTURE, "--no-open"]);
  try {
    const url = new URL(await waitForUrl(child));
    const page = await (await fetch(new URL("/", url))).text();
    if (!page.includes("<!doctype html") || page.includes("has not been built")) {
      throw new Error("The bundled web UI was not served.");
    }
    const id = url.searchParams.get("session") ?? "";
    const replay = await fetch(new URL(`/api/sessions/${id}`, url));
    if (replay.status !== 200) throw new Error(`Replay API answered ${replay.status}.`);
  } finally {
    child.kill();
  }
}

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "crafter-replay-smoke-"));
  try {
    run("pnpm", ["pack", "--pack-destination", work], CLI_DIR);
    const tarball = readdirSync(work).find((name) => name.endsWith(".tgz"));
    if (tarball === undefined) throw new Error("pnpm pack produced no tarball.");
    const app = join(work, "app");
    mkdirSync(app);
    writeFileSync(join(app, "package.json"), '{ "private": true }');
    run("npm", ["install", join(work, tarball), "--no-audit", "--no-fund"], app);

    const installed = join(app, "node_modules", "crafter-replay");
    for (const doc of ["README.md", "LICENSE"]) {
      if (!existsSync(join(installed, doc))) throw new Error(`The package is missing ${doc}.`);
    }
    const size = folderSize(installed);
    if (size > MAX_UNPACKED_BYTES) throw new Error(`Package is ${size} bytes, over 5 MB.`);
    const entry = join(installed, "dist", "index.js");
    const version = run("node", [entry, "--version"], app).trim();
    await expectReplayServed(entry);
    console.log(`OK: ${tarball}, ${(size / 1024).toFixed(0)} KB unpacked, version ${version}.`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
