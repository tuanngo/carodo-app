import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("baseline migration", () => {
  it("creates every table on D1", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((row) => row.name)).toEqual([
      "accounts",
      "app_keys",
      "auth_challenges",
      "drives",
      "feed_items",
      "job_runs",
      "job_states",
      "pending_ops",
      "reactions",
      "sessions",
      "username_changes",
      "username_holds",
      "username_policies",
    ]);
  });

  it("ties what an account owns to it, and checks only a system job's status", async () => {
    const { results } = await env.DB.prepare(
      `SELECT m.name AS tbl, f."from" AS col, f."table" AS parent, f.on_delete FROM sqlite_master m
       JOIN pragma_foreign_key_list(m.name) f WHERE m.type = 'table' ORDER BY tbl, col`,
    ).all<{ tbl: string; col: string; parent: string; on_delete: string }>();
    expect(results.map((key) => `${key.tbl}.${key.col} → ${key.parent} ${key.on_delete}`)).toEqual([
      "drives.account_id → accounts CASCADE",
      "drives.item_id → feed_items CASCADE",
      "feed_items.account_id → accounts CASCADE",
      "reactions.account_id → accounts CASCADE",
      "reactions.item_id → feed_items CASCADE",
      "sessions.account_id → accounts CASCADE",
      "sessions.app_key_id → app_keys NO ACTION",
      "username_changes.account_id → accounts CASCADE",
    ]);
    const { results: checked } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%CHECK (%' ORDER BY name",
    ).all<{ name: string }>();
    expect(checked.map((table) => table.name)).toEqual(["job_runs"]);
  });

  it("keeps no exact time of a drive", async () => {
    const columns = async (table: string) =>
      (await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{ name: string }>()).results.map(
        (column) => column.name,
      );
    const drives = await columns("drives");
    expect(drives).toEqual(
      expect.arrayContaining(["ended_at", "published_at", "updated_at", "unpublished_at", "hidden_at"]),
    );
    for (const gone of ["started_at", "drove_at", "stopped_at"]) expect(drives).not.toContain(gone);
    const items = await columns("feed_items");
    expect(items).toContain("last_ended_at");
    expect(items).not.toContain("sort_hour");
    const feed = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE name = 'feed_items_on_feed'").first<{
      sql: string;
    }>();
    expect(feed?.sql).toContain("last_ended_at DESC, id DESC");
  });

  it("has the seeded username policies", async () => {
    const row = await env.DB.prepare("SELECT kind, match FROM username_policies WHERE name = 'ditme'").first();
    expect(row).toEqual({ kind: "profane", match: "contains" });
  });
});
