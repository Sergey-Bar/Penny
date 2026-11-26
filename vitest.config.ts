import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-data-dir.ts"],
    // Migration tests run every SQL file against a real DB; shared CI runners (Windows) need well over the 5s default.
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      // lcov feeds SonarQube (sonar.javascript.lcov.reportPaths); text-summary prints the gate result.
      reporter: ["text-summary", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      // The gate covers the layers this suite owns: pure logic and every server module
      // (routes, queries, scrapers, sync). React components are covered by e2e/, not here,
      // so counting them would only dilute the number.
      include: ["src/lib/**/*.{ts,tsx}", "src/server/**/*.{ts,tsx}", "src/proxy.ts"],
      exclude: ["src/**/*.d.ts"],
      // Floors that lock in the current suite. They sit just under the measured numbers:
      // raise them when coverage rises, never lower them to green a build.
      thresholds: {
        statements: 74,
        branches: 66,
        functions: 71,
        lines: 75,
        // The core that must not lose money or data gets its own floor per file, set to the
        // measured value rounded down (a ratchet). The target is 90 lines / 85 branches.
        "src/lib/money.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/server/lib/dedup.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/lib/sync-schedule.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/server/sync/**": { statements: 97, branches: 92, functions: 100, lines: 97 },
        // Import v2: the pure engine is deterministic and must stay well covered. Floors are the
        // measured ratchet for the new suite; raise them as tests grow (target 100/90).
        "src/lib/import/**": { statements: 82, branches: 75, functions: 85, lines: 85 },
        "src/lib/import/classify.ts": { statements: 83, branches: 81, functions: 100, lines: 82 },
        "src/lib/import/categorize.ts": { statements: 77, branches: 71, functions: 73, lines: 82 },
        "src/lib/import/dedupe.ts": { statements: 90, branches: 80, functions: 100, lines: 96 },
        "src/lib/import/normalize.ts": { statements: 84, branches: 78, functions: 100, lines: 88 },
        "src/lib/import/validate.ts": { statements: 90, branches: 92, functions: 100, lines: 90 },
        "src/lib/category-keys.ts": { statements: 100, branches: 60, functions: 100, lines: 100 },
        "src/lib/merchant-dictionary.ts": {
          statements: 95,
          branches: 90,
          functions: 100,
          lines: 95,
        },
        "src/server/db/migrate.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        // Measured 100 on some runs and 95/87 on most: one branch depends on test timing.
        "src/server/db/backup.ts": { statements: 95, branches: 87, functions: 100, lines: 100 },
        "src/server/lib/portable-backup.ts": {
          statements: 98,
          branches: 91,
          functions: 100,
          lines: 99,
        },
        // tests/encryption-core.test.ts runs the POSIX and the Windows (icacls) branch on every platform.
        // Keep the lower of the Linux and Windows numbers: CI runs both.
        "src/server/lib/encryption.ts": {
          statements: 100,
          branches: 89,
          functions: 100,
          lines: 100,
        },
        "src/proxy.ts": { statements: 96, branches: 93, functions: 100, lines: 97 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
});
