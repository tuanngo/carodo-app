import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The three environments on one Cloudflare account (ADR 0004): local at the top level (`-local`),
 * `staging` (`-staging`, `-stg.carodo.app`) and `production` (bare names, `carodo.app`). The
 * account comes only from `.env.deploy` (scripts/wrangler.mjs): an `account_id` or a database id in
 * a config would pin a deploy or get overwritten when Wrangler creates a resource.
 */

type Route = { pattern: string; custom_domain?: boolean };
type D1 = { binding: string; database_name: string; database_id?: string; migrations_dir?: string };
type R2 = { binding: string; bucket_name: string };
type Dataset = { binding: string; dataset: string };
type RateLimitBinding = { name: string; namespace_id: string; simple: { limit: number; period: number } };
type Service = { binding: string; service: string; entrypoint: string };

type Scope = Record<string, unknown> & {
  name?: string;
  workers_dev?: boolean;
  preview_urls?: boolean;
  routes?: Route[];
  vars?: Record<string, string>;
  d1_databases?: D1[];
  r2_buckets?: R2[];
  analytics_engine_datasets?: Dataset[];
  ratelimits?: RateLimitBinding[];
  services?: Service[];
};

type Config = Scope & { env: Record<"staging" | "production", Scope> };

function read(app: "api" | "web"): Config {
  const text = readFileSync(fileURLToPath(new URL(`../../../../${app}/wrangler.jsonc`, import.meta.url)), "utf8");
  // Comments outside strings, then trailing commas: jsonc to JSON.
  const json = text
    .replace(/"(?:[^"\\]|\\.)*"|\/\/.*$/gm, (match) => (match.startsWith('"') ? match : ""))
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(json) as Config;
}

const DEPLOYED = ["staging", "production"] as const;

describe.each(["api", "web"] as const)("%s wrangler.jsonc", (app) => {
  const config = read(app);

  it("names no account and no resource id outside local", () => {
    expect(JSON.stringify(config)).not.toMatch(/"account_id"/);
    for (const name of DEPLOYED) {
      const scope = config.env[name];
      for (const db of scope.d1_databases ?? []) {
        expect(db.database_id, `${name}: D1 is found by name`).toBeUndefined();
      }
    }
  });

  it("separates local, staging and production Worker names and disables workers.dev everywhere", () => {
    expect(config.name).toBe(`carodo-${app}-local`);
    expect(config.env.staging.name).toBe(`carodo-${app}-staging`);
    expect(config.env.production.name).toBe(`carodo-${app}`);

    for (const scope of [config, config.env.staging, config.env.production]) {
      expect(scope.workers_dev).toBe(false);
      expect(scope.preview_urls).toBe(false);
    }
  });
});

describe("api environments", () => {
  const api = read("api");
  const scopes = [api, api.env.staging, api.env.production];

  it("serves api-stg.carodo.app on staging and api.carodo.app on production", () => {
    expect(api.env.staging.routes).toEqual([{ pattern: "api-stg.carodo.app", custom_domain: true }]);
    expect(api.env.production.routes).toEqual([{ pattern: "api.carodo.app", custom_domain: true }]);
  });

  it("redeclares the same bindings in staging and production without sharing any store, dataset or namespace", () => {
    const { staging, production } = api.env;
    expect(staging.triggers).toEqual(production.triggers);
    expect(staging.secrets).toEqual(production.secrets);
    expect(staging.placement).toEqual(production.placement);

    expect(staging.d1_databases?.map((d) => d.binding)).toEqual(production.d1_databases?.map((d) => d.binding));
    expect(staging.r2_buckets?.map((b) => b.binding)).toEqual(production.r2_buckets?.map((b) => b.binding));
    expect(staging.analytics_engine_datasets?.map((d) => d.binding)).toEqual(
      production.analytics_engine_datasets?.map((d) => d.binding),
    );
    expect(staging.ratelimits?.map(({ name, simple }) => ({ name, simple }))).toEqual(
      production.ratelimits?.map(({ name, simple }) => ({ name, simple })),
    );

    const unique = (values: string[]) => expect(new Set(values).size).toBe(values.length);
    unique(scopes.flatMap((s) => s.d1_databases?.map((d) => d.database_name) ?? []));
    unique(scopes.flatMap((s) => s.r2_buckets?.map((b) => b.bucket_name) ?? []));
    unique(scopes.flatMap((s) => s.analytics_engine_datasets?.map((d) => d.dataset) ?? []));
    unique(scopes.flatMap((s) => s.ratelimits?.map((r) => r.namespace_id) ?? []));
  });

  it("accepts the debug proof on staging, never on production", () => {
    expect(api.env.staging.vars).toMatchObject({
      ENVIRONMENT: "staging",
      APP_ATTEST_ENVIRONMENTS: "development,production",
      APP_ATTEST_DEBUG: "1",
    });
    expect(api.env.production.vars).toMatchObject({
      ENVIRONMENT: "production",
      APP_ATTEST_ENVIRONMENTS: "production",
      APP_ATTEST_DEBUG: "0",
    });
  });
});

describe("web environments", () => {
  const api = read("api");
  const web = read("web");

  it("serves stg.carodo.app on staging and carodo.app on production, each bound to its own api Worker", () => {
    expect(web.env.staging.routes).toEqual([{ pattern: "stg.carodo.app", custom_domain: true }]);
    expect(web.env.production.routes).toEqual([{ pattern: "carodo.app", custom_domain: true }]);

    expect(web.services).toEqual([{ binding: "API", service: api.name, entrypoint: "WebRpc" }]);
    expect(web.env.staging.services).toEqual([{ binding: "API", service: api.env.staging.name, entrypoint: "WebRpc" }]);
    expect(web.env.production.services).toEqual([
      { binding: "API", service: api.env.production.name, entrypoint: "WebRpc" },
    ]);
  });
});
