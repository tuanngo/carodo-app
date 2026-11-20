#!/usr/bin/env node
/**
 * Empties staging's D1 (`carodo-staging`) and rebuilds it: every table dropped, `d1_migrations`
 * included, then the migrations applied from scratch and the seeds upserted. Pre-release only: while
 * `0001_baseline.sql` is edited in place (AGENTS.md rule 4), staging has recorded the baseline as
 * applied and would never pick up the edit otherwise. Every account, session, drive and reaction on
 * staging is lost; D1 Time Travel can still restore the last 30 days.
 *
 *   node scripts/d1-reset-staging.mjs --yes      (task db:reset:staging)
 *
 * Staging only, by construction: no argument names the environment, so production cannot be reached.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const wrangler = `${root}scripts/wrangler.mjs`;

function fail(message) {
  console.error(`scripts/d1-reset-staging.mjs: ${message}`);
  process.exit(1);
}

if (!process.argv.includes("--yes")) {
  fail("this drops every table of staging's D1 and every row in it; run it again with --yes to go ahead.");
}

/** Runs Wrangler against staging's api; stdout returned when `capture`, else shown. */
function run(args, capture = false) {
  const result = spawnSync(process.execPath, [wrangler, "staging", "api", ...args], {
    cwd: root,
    stdio: ["inherit", capture ? "pipe" : "inherit", "inherit"],
    encoding: "utf8",
  });
  if (result.status !== 0) fail(`wrangler ${args.slice(0, 3).join(" ")} failed`);
  return result.stdout ?? "";
}

// 1. The tables there are now, D1's and SQLite's own left out (they cannot be dropped), with the
// tables each one references.
const listed = run(
  [
    "d1",
    "execute",
    "DB",
    "--remote",
    "--json",
    "--command",
    `SELECT m.name AS name, f."table" AS parent FROM sqlite_master m
       LEFT JOIN pragma_foreign_key_list(m.name) f
     WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'`,
  ],
  true,
);
let rows;
try {
  rows = JSON.parse(listed.slice(listed.indexOf("[")))[0].results;
} catch {
  fail("could not read the table list from Wrangler's answer");
}

// D1 always checks foreign keys, and dropping a table that references one already dropped fails:
// a table goes before every table it references (children first).
const parents = new Map();
for (const { name, parent } of rows) {
  if (!parents.has(name)) parents.set(name, new Set());
  if (parent && parent !== name) parents.get(name).add(parent);
}
const tables = [];
const left = new Set(parents.keys());
while (left.size > 0) {
  const next = [...left].find((table) => ![...left].some((other) => parents.get(other).has(table)));
  if (next === undefined) fail(`the foreign keys among ${[...left].join(", ")} form a cycle`);
  tables.push(next);
  left.delete(next);
}

// 2. Drop them all in one file, in that order (one transaction: a failure leaves D1 as it was).
if (tables.length > 0) {
  const dir = mkdtempSync(join(tmpdir(), "carodo-d1-reset-"));
  const file = join(dir, "drop.sql");
  const quoted = (name) => `"${name.replaceAll('"', '""')}"`;
  writeFileSync(
    file,
    ["PRAGMA defer_foreign_keys = true;", ...tables.map((name) => `DROP TABLE IF EXISTS ${quoted(name)};`)].join("\n"),
  );
  console.error(`Dropping ${tables.length} tables: ${tables.join(", ")}`);
  try {
    run(["d1", "execute", "DB", "--remote", `--file=${file}`, "--yes"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 3. The migrations from scratch, then the seeds (as every deploy does).
run(["d1", "migrations", "apply", "DB", "--remote"]);
run(["d1", "execute", "DB", "--remote", "--file=seeds/username-policies.sql", "--yes"]);
console.error("Staging's D1 is rebuilt from the migrations and the seeds.");
