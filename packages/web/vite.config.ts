import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions, defineConfig } from "vite";

// Read core from its TypeScript source, so the UI builds and tests without building core first.
// The browser only imports `@agentreplay/core/format` and types; core's Node code never ships.
const SOURCE = "@agentreplay/source";

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: [SOURCE, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [SOURCE, ...defaultServerConditions] } },
});
