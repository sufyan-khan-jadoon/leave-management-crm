import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Unit tests only, and deliberately so: everything under `src/**\/*.test.ts` is
 * pure policy — date arithmetic and the rules built on it — with no database,
 * no network and no environment to stand up. Anything needing those is verified
 * by driving the real endpoints instead.
 *
 * The timezone is pinned to something that is *not* the company's, so a rule
 * that quietly depends on the server sharing Asia/Karachi fails here rather
 * than in production.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
