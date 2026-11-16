import { describe, expect, it } from "vitest";
import { attestPolicy } from "../../../src/services/attest/policy";

function policyFor(ENVIRONMENT: string, APP_ATTEST_DEBUG: string) {
  return attestPolicy({
    ENVIRONMENT,
    APP_ATTEST_DEBUG,
    APP_ID: "TESTTEAM00.app.carodo.ios",
    APP_ATTEST_ENVIRONMENTS: "development, production, nope",
  } as unknown as Env);
}

describe("attestPolicy", () => {
  it("accepts the debug proof locally and on staging, never in production whatever the var says", () => {
    expect(policyFor("local", "1").allowDebug).toBe(true);
    expect(policyFor("staging", "1").allowDebug).toBe(true);
    expect(policyFor("staging", "0").allowDebug).toBe(false);
    expect(policyFor("production", "1").allowDebug).toBe(false);
  });

  it("keeps only the App Attest environments it knows", () => {
    expect([...policyFor("staging", "0").environments]).toEqual(["development", "production"]);
  });
});
