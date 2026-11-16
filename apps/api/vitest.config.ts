import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/** The same files `wrangler d1 migrations apply` runs, handed to the test Worker as a binding. */
const migrations = await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url)));
/** The seeds `task db:reset` applies (one statement per file), so the tests see the same policies. */
const seeds = ["username-policies.sql"].map((file) =>
  readFileSync(new URL(`./seeds/${file}`, import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n"),
);

/**
 * Two projects (docs/operations/local.md "Tests"):
 * - `unit`: plain code with no Cloudflare runtime in it (parsers, encoders, validators, tokens),
 *   in Node threads: no workerd to start, so it stays instant however many files it grows to.
 * - `workers`: anything that needs a binding, D1, a route, or the Workers runtime's own behaviour
 *   (App Attest's Web Crypto runs here, as in production), in workerd.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          environment: "node",
          pool: "threads",
        },
      },
      {
        plugins: [
          // Real bindings from the deployed config, so a test cannot rely on one production lacks.
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            // The pool reads .dev.vars; a binding here overrides it, so the suite never depends on a
            // developer's machine. A credential the suite must not use is declared empty, not omitted.
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: migrations,
                TEST_SEEDS: seeds,
                APP_ID: "TESTTEAM00.app.carodo.ios",
                SECRET_KEY: "test-only-secret-key-not-a-secret",
              },
            },
          }),
        ],
        test: {
          name: "workers",
          include: ["test/workers/**/*.test.ts"],
          setupFiles: ["./test/workers/setup.ts"],
        },
      },
    ],
  },
});
