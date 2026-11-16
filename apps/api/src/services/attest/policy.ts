import type { Bytes } from "../../lib/encoding/bytes";
import { APPLE_APP_ATTEST_ROOT } from "./apple-root";

/** What an environment accepts (ADR 0004; carodo-ios docs/sync.md "App Attest"). */

export type AttestEnvironment = "development" | "production";

export interface AttestPolicy {
  /** `<Team ID>.<bundle id>`: its SHA-256 is the rpIdHash every attestation and assertion carries. */
  appId: string;
  environments: ReadonlySet<AttestEnvironment>;
  /** The `carodo-debug` attestation (simulator, Personal Team): local and staging, never production. */
  allowDebug: boolean;
  /** The pinned root every chain must end at; tests pass their own. */
  root: Bytes;
}

export function attestPolicy(env: Env): AttestPolicy {
  const environments = new Set<AttestEnvironment>();
  for (const name of String(env.APP_ATTEST_ENVIRONMENTS).split(",")) {
    const trimmed = name.trim();
    if (trimmed === "development" || trimmed === "production") environments.add(trimmed);
  }
  return {
    appId: env.APP_ID,
    environments,
    // Never in production, whatever the var says.
    allowDebug: env.APP_ATTEST_DEBUG === "1" && (env.ENVIRONMENT === "local" || env.ENVIRONMENT === "staging"),
    root: APPLE_APP_ATTEST_ROOT,
  };
}
