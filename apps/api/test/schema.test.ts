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
      "apple_links",
      "auth_challenges",
      "backup_keys",
      "backups",
      "blocks",
      "job_runs",
      "job_states",
      "leaderboard_rows",
      "outbox_events",
      "pending_ops",
      "published_drives",
      "reports",
      "sessions",
      "shares",
      "stats_hourly",
      "web_sessions",
    ]);
  });
});
