#!/usr/bin/env node
/**
 * Runs Wrangler for one Worker against one deployed environment on CARODO's Cloudflare account
 * (ADR 0004, docs/operations/deploy.md):
 *
 *   node scripts/wrangler.mjs <staging|production> <api|web> <wrangler arguments…>
 *
 * Staging and production live on the same Cloudflare account under separate Worker, store, dataset,
 * rate-limit and hostname names (`--env <staging|production>`). The account id (and optional auth
 * profile) comes from `.env.deploy` at the repository root (gitignored), never from the shell: any
 * account id, token or profile left exported from another project's session is removed before
 * Wrangler starts.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENVIRONMENTS = ["staging", "production"];
const APPS = ["api", "web"];
/** Credentials and account choices Wrangler would otherwise take from the shell. */
const INHERITED = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_EMAIL",
  "WRANGLER_PROFILE",
];

const root = fileURLToPath(new URL("../", import.meta.url));
const [environment, app, ...args] = process.argv.slice(2);

function fail(message) {
  console.error(`scripts/wrangler.mjs: ${message}`);
  process.exit(1);
}

if (!ENVIRONMENTS.includes(environment) || !APPS.includes(app) || args.length === 0) {
  fail(
    `usage: node scripts/wrangler.mjs <${ENVIRONMENTS.join("|")}> <${APPS.join("|")}> <wrangler arguments…>\n` +
      "There is no default environment on purpose: a command that picks its own target is one nobody chose.",
  );
}

const file = `${root}.env.deploy`;
if (!existsSync(file)) fail(`${file} is missing; copy .env.example to .env.deploy (docs/operations/deploy.md).`);

/** KEY=VALUE lines; `#` comments and blank lines skipped, surrounding quotes removed. */
const values = {};
for (const line of readFileSync(file, "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
}

const account = values.CLOUDFLARE_ACCOUNT_ID ?? "";
const profile = values.WRANGLER_PROFILE ?? "";
if (!/^[0-9a-f]{32}$/.test(account)) fail(`${file}: CLOUDFLARE_ACCOUNT_ID must be the account's 32-character id.`);
if (profile !== "" && !/^[A-Za-z0-9_-]+$/.test(profile)) {
  fail(`${file}: WRANGLER_PROFILE must be empty or name a Wrangler auth profile.`);
}

const env = { ...process.env };
for (const name of INHERITED) delete env[name];
env.CLOUDFLARE_ACCOUNT_ID = account;

const cwd = `${root}apps/${app}`;
if (app === "web" && args[0] === "deploy") {
  const styles = spawnSync(process.execPath, [`${cwd}/scripts/build-styles.mjs`], { cwd, stdio: "inherit" });
  if (styles.status !== 0) process.exit(styles.status ?? 1);
}
const wranglerArgs = [...args, "--env", environment, ...(profile ? ["--profile", profile] : [])];
console.error(`→ ${app} ${environment}: account …${account.slice(-6)}${profile ? `, profile ${profile}` : ""}`);
const result = spawnSync(`${cwd}/node_modules/.bin/wrangler`, wranglerArgs, {
  cwd,
  env,
  stdio: "inherit",
});
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);
