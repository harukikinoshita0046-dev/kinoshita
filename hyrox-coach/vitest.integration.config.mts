import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Integration tests run against a real Supabase (local stack or `supabase start`)
 * and, for the API suite, a running app (APP_URL, default http://localhost:3000).
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
