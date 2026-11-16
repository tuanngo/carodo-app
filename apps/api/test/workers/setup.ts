import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterAll, beforeAll } from "vitest";

/** The test database gets its tables from the migrations production runs, and the seeds. */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch(env.TEST_SEEDS.map((sql) => env.DB.prepare(sql)));
});

/**
 * Every statement the api's own code (`src/`) prepares while this file's tests run is explained
 * at the end, and a full table scan fails the file (docs/cost.md C1): D1 bills rows read, so a
 * query without an index is a bill that grows with the table. The Worker and the tests share this
 * binding, so a route reached through `exports.default.fetch()` is covered too. A scan that is
 * meant (a tiny fixed table) says so in its SQL with `-- full scan: <why>`.
 */
const statements = new Set<string>();
const prepare = env.DB.prepare.bind(env.DB);
(env.DB as { prepare: typeof prepare }).prepare = (sql: string) => {
  if (/\/src\//.test(new Error().stack ?? "")) statements.add(sql);
  return prepare(sql);
};

/** Placeholders to bind NULL to: D1 refuses a statement with unbound ones, even to explain it. */
function placeholders(sql: string): number {
  const numbered = [...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1]));
  return numbered.length > 0 ? Math.max(...numbered) : (sql.match(/\?/g) ?? []).length;
}

/**
 * A plan step that reads a whole table. Table-valued functions, constant rows and a subquery's own
 * result (`subquery-N`, already bounded; its table access is a step of its own, checked too) are
 * not tables.
 */
const FULL_SCAN = /^SCAN (?!json_each|CONSTANT ROW|\(subquery-\d+\))(\S+)/;

afterAll(async () => {
  const checked = [...statements].filter((sql) => !sql.includes("-- full scan:"));
  const plans = await Promise.all(
    checked.map((sql) =>
      prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(...Array(placeholders(sql)).fill(null))
        .all<{ detail: string }>(),
    ),
  );
  const scans = checked.flatMap((sql, i) =>
    (plans[i]?.results ?? [])
      .filter((step) => FULL_SCAN.test(step.detail))
      .map((step) => `${step.detail}\n    in: ${sql.replaceAll(/\s+/g, " ").trim()}`),
  );
  if (scans.length > 0) throw new Error(`Full table scans in the api's queries:\n  ${scans.join("\n  ")}`);
});
