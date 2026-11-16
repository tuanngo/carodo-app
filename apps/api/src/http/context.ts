import type { AccountCaller } from "../services/auth/sessions";
import type { Body } from "./request";

/** What middleware hands a route: set by `http/auth.ts`, read by the route and the rate limits. */
export interface AppVariables {
  /** The attested key this request proved, by an assertion or a guest token. */
  keyId?: string;
  /** The body as `requireAssertion` read it: its bytes are what the assertion signed. */
  body?: Body;
  /** The account an access token proved, its session still live (`requireAccount`). */
  account?: AccountCaller;
  /** The Problem's code when the request was refused, for the request metric (`problem()`). */
  outcome?: string;
}

export type AppEnv = { Bindings: Env; Variables: AppVariables };
