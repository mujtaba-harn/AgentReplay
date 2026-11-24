import { defineConfig } from "vitest/config";

// Tests run before the build in CI, so read core from its TypeScript source, as typecheck does.
// The other entries are Vite's default server conditions, which a custom list would otherwise replace.
export default defineConfig({
  ssr: {
    resolve: { conditions: ["@crafter-replay/source", "module", "node", "development|production"] },
  },
});
