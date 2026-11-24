import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const WEB_DIST = fileURLToPath(new URL("../web/dist", import.meta.url));
const BUNDLED_WEB = fileURLToPath(new URL("./dist/web", import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // core is not published on its own, so it ships inside this file. zod, clack and open stay
  // regular dependencies (open must: it runs a helper script that sits next to its own files).
  noExternal: ["@crafter-replay/core"],
  esbuildOptions(options) {
    options.conditions = ["@crafter-replay/source"];
  },
  // The server serves the UI from dist/web (ARCHITECTURE.md §3: cli bundles the built web assets).
  onSuccess: async () => {
    if (!existsSync(WEB_DIST)) {
      throw new Error("packages/web/dist is missing: build the web package before the CLI.");
    }
    cpSync(WEB_DIST, BUNDLED_WEB, { recursive: true });
  },
});
