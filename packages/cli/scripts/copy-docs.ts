// Runs before `pack`: npm shows the README and LICENSE from the package's own folder, and the
// one source of truth for both is the repo root. The copies are git-ignored.
import { copyFileSync } from "node:fs";
import { join } from "node:path";

const CLI_DIR = join(import.meta.dirname, "..");
const ROOT = join(CLI_DIR, "..", "..");

for (const file of ["README.md", "LICENSE"]) {
  copyFileSync(join(ROOT, file), join(CLI_DIR, file));
}
