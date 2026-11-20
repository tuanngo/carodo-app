import { describe, expect, it } from "vitest";
import { fromBase64, utf8 } from "../../../src/lib/encoding/bytes";
import { APPLE_APP_ATTEST_ROOT } from "../../../src/services/attest/apple-root";
import { clientDataOf, verifyAssertion } from "../../../src/services/attest/assertion";
import { verifyAttestation } from "../../../src/services/attest/attestation";
import type { AttestPolicy } from "../../../src/services/attest/policy";
// A real attestation and assertion from an iPhone of the paid team (iOS 27, development), made by
// carodo-ios `CarodoTests/Live/AppAttestCaptureTests` with a fresh key tied to nothing. Unlike the
// stand-in for Apple the other tests use, it proves the verification against what a device sends:
// Apple's real chain and the authenticator data's extensions as iOS writes them.
import device from "../../fixtures/app-attest-device.json";

/** Inside the credential certificate's validity: it lives a few days from the capture. */
const NOW = Date.parse(device.capturedAt);

const policy: AttestPolicy = {
  appId: device.appId,
  environments: new Set(["development"]),
  allowDebug: false,
  root: APPLE_APP_ATTEST_ROOT,
};

async function attest(overrides: Partial<{ challenge: string; policy: Partial<AttestPolicy>; now: number }> = {}) {
  return verifyAttestation(
    { ...policy, ...overrides.policy },
    {
      keyId: fromBase64(device.keyId),
      challenge: overrides.challenge ?? device.challenge,
      attestation: fromBase64(device.attestation),
    },
    overrides.now ?? NOW,
  );
}

describe("a real device's App Attest proofs", () => {
  it("accepts the attestation, chained to Apple's root, in the development environment", async () => {
    const result = await attest();
    expect(result).toMatchObject({ ok: true, data: { keyId: device.keyId, environment: "development" } });
  });

  it("accepts the assertion by the key it attested, with a counter above zero", async () => {
    const attested = await attest();
    if (!attested.ok) throw new Error("the attestation was refused");
    const clientData = await clientDataOf(device.method, device.path, utf8(device.body));
    const result = await verifyAssertion(
      device.appId,
      { publicKey: attested.data.publicKey, counter: 0 },
      fromBase64(device.assertion),
      clientData,
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.data.counter).toBeGreaterThan(0);
  });

  const refusals: [string, Parameters<typeof attest>[0]][] = [
    ["another challenge", { challenge: "another-challenge" }],
    ["another app", { policy: { appId: "OTHERTEAM0.app.carodo.ios" } }],
    ["a server that accepts only production", { policy: { environments: new Set(["production"]) } }],
    ["a time after the certificate expired", { now: NOW + 365 * 24 * 60 * 60 * 1000 }],
  ];
  for (const [what, overrides] of refusals) {
    it(`refuses it for ${what}`, async () => {
      expect(await attest(overrides)).toMatchObject({ ok: false, code: "unauthorized" });
    });
  }

  it("refuses the assertion over another request", async () => {
    const attested = await attest();
    if (!attested.ok) throw new Error("the attestation was refused");
    const other = await clientDataOf(device.method, device.path, utf8(`${device.body} `));
    const result = await verifyAssertion(
      device.appId,
      { publicKey: attested.data.publicKey, counter: 0 },
      fromBase64(device.assertion),
      other,
    );
    expect(result).toMatchObject({ ok: false });
  });
});
