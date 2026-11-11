import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Standalone test config. The app's vite.config.ts imports
 * @lovable.dev/vite-tanstack-config, which only works inside Lovable's
 * environment, so `vitest run` through the app config fails locally.
 * This config exists ONLY to run the unit tests — it changes no engine
 * behaviour. Run: `bun run test` (or `npx vitest run`).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
