// Rebuilds test/fixtures/*.jsonl from the full logs in test/fixtures-private/.
// Run: pnpm --filter @crafter-replay/core fixtures:public
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { toPublicLine } from "./public-fixtures.ts";

const testDir = fileURLToPath(new URL("..", import.meta.url));
const privateDir = join(testDir, "fixtures-private");
const publicDir = join(testDir, "fixtures");

// Fixtures are a few MB and fixed, so reading them whole is fine; the product parser must stream.
for (const name of readdirSync(privateDir).filter((n) => n.endsWith(".jsonl"))) {
  const lines = readFileSync(join(privateDir, name), "utf8")
    .split("\n")
    .filter((line) => line !== "");
  writeFileSync(join(publicDir, name), `${lines.map(toPublicLine).join("\n")}\n`);
}
