import { beforeAll, describe, expect, it, vi } from "vitest";
import { toBase64 } from "../../../src/lib/encoding/bytes";
import { verifyAssertion } from "../../../src/services/attest/assertion";
import { verifyAttestation } from "../../../src/services/attest/attestation";
import type { AttestPolicy } from "../../../src/services/attest/policy";
import {
  AAGUID,
  type AttestationOptions,
  appleAttestation,
  assertion,
  clientData,
  debugAttestation,
  type FakeApple,
  fakeApple,
  generateP256,
  sha256,
} from "../../support/app-attest.ts";
import { cbor } from "../../support/encode.ts";

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const APP_ID = "TESTTEAM00.app.carodo.ios";
const CHALLENGE = "a-challenge-from-the-server";

let apple: FakeApple;
let policy: AttestPolicy;

beforeAll(async () => {
  apple = await fakeApple(NOW);
  policy = { appId: APP_ID, environments: new Set(["development"]), allowDebug: false, root: apple.root };
});

async function attest(overrides: Partial<AttestationOptions> = {}, policyOverrides: Partial<AttestPolicy> = {}) {
  const made = await appleAttestation({ apple, appId: APP_ID, challenge: CHALLENGE, now: NOW, ...overrides });
  const result = await verifyAttestation(
    { ...policy, ...policyOverrides },
    { keyId: made.keyId, challenge: CHALLENGE, attestation: made.attestation },
    NOW,
  );
  return { made, result };
}

/** `apple_validation_category_01` as iOS 27 writes it: 4 bytes, little-endian. */
function category(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

describe("apple-appattest", () => {
  it("accepts a valid attestation and returns the key", async () => {
    const { made, result } = await attest();
    expect(result).toEqual({
      ok: true,
      data: { keyId: toBase64(made.keyId), publicKey: made.publicKey, environment: "development" },
    });
  });

  it("accepts a development build's extensions as iOS 27 writes them", async () => {
    const { result } = await attest({
      extensions: new Map<string, string | Uint8Array>([
        ["apple_bundle_version_01", "1"],
        ["apple_validation_category_01", category(3)],
      ]),
    });
    expect(result).toMatchObject({ ok: true, data: { environment: "development" } });
  });

  it("reads the production environment and Apple's extensions", async () => {
    const { result } = await attest(
      {
        environment: "production",
        extensions: new Map<string, string | Uint8Array>([
          ["apple_bundle_version_01", "1"],
          ["apple_validation_category_01", category(4)],
        ]),
      },
      { environments: new Set(["production"]) },
    );
    expect(result).toMatchObject({ ok: true, data: { environment: "production" } });
  });

  const refusals: [string, Partial<AttestationOptions>, Partial<AttestPolicy>?][] = [
    ["an environment this server does not accept", { environment: "production" }],
    ["a nonce from another challenge", { nonce: new Uint8Array(32) }],
    ["another app", { appId: "OTHERTEAM0.app.carodo.ios" }],
    ["a counter that is not zero", { counter: 1 }],
    ["an unknown aaguid", { aaguid: new Uint8Array(16) }],
    ["a credential id that is not the key id", { credentialId: new Uint8Array(32) }],
    ["an expired credential certificate", { leafNotAfter: NOW - 1 }],
    ["an ad-hoc build", { extensions: new Map([["apple_validation_category_01", category(5)]]) }],
    ["a category not written as 4 bytes", { extensions: new Map([["apple_validation_category_01", 3]]) }],
  ];
  for (const [what, overrides, policyOverrides] of refusals) {
    it(`refuses ${what}`, async () => {
      const { result } = await attest(overrides, policyOverrides);
      expect(result).toEqual({ ok: false, code: "unauthorized", detail: "The attestation is not valid." });
    });
  }

  it("refuses a chain that does not end at the pinned root", async () => {
    const other = await fakeApple(NOW);
    const { result } = await attest({}, { root: other.root });
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses a key id that does not match the key", async () => {
    const made = await appleAttestation({ apple, appId: APP_ID, challenge: CHALLENGE, now: NOW });
    const result = await verifyAttestation(
      policy,
      { keyId: new Uint8Array(32), challenge: CHALLENGE, attestation: made.attestation },
      NOW,
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses bytes that are not an attestation", async () => {
    const result = await verifyAttestation(
      policy,
      { keyId: new Uint8Array(32), challenge: CHALLENGE, attestation: Uint8Array.of(1, 2, 3) },
      NOW,
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("logs the category it refused, or how it was written, so a new iOS shows at once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await attest({ extensions: new Map([["apple_validation_category_01", category(5)]]) });
      await attest({ extensions: new Map([["apple_validation_category_01", 3]]) });
      await attest({ extensions: new Map([["apple_validation_category_01", new Uint8Array(8)]]) });
      const found = warn.mock.calls.map((call) => JSON.parse(String(call[0])).found);
      expect(found).toEqual([5, "integer", "bytes 8"]);
    } finally {
      warn.mockRestore();
    }
  });

  it("logs a fixed reason for an unknown format, never the format the request sent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const marker = "MARKER-from-the-request";
      const attestation = new Uint8Array(cbor(new Map([["fmt", marker]])));
      const result = await verifyAttestation(
        policy,
        { keyId: new Uint8Array(32), challenge: CHALLENGE, attestation },
        NOW,
      );
      expect(result).toMatchObject({ ok: false, code: "unauthorized" });
      const lines = warn.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes("attest.attestation_refused"))).toBe(true);
      expect(lines.some((line) => line.includes(marker))).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("carodo-debug", () => {
  it("is accepted only where the policy allows it", async () => {
    const keys = await generateP256();
    const made = await debugAttestation(keys, CHALLENGE);
    const input = { keyId: made.keyId, challenge: CHALLENGE, attestation: made.attestation };

    expect(await verifyAttestation(policy, input, NOW)).toMatchObject({ ok: false });
    expect(await verifyAttestation({ ...policy, allowDebug: true }, input, NOW)).toEqual({
      ok: true,
      data: { keyId: toBase64(made.keyId), publicKey: made.publicKey, environment: "development" },
    });
  });

  it("refuses one signed over another challenge", async () => {
    const keys = await generateP256();
    const made = await debugAttestation(keys, "another-challenge");
    const result = await verifyAttestation(
      { ...policy, allowDebug: true },
      { keyId: made.keyId, challenge: CHALLENGE, attestation: made.attestation },
      NOW,
    );
    expect(result).toMatchObject({ ok: false });
  });
});

describe("assertions", () => {
  it("accepts a signed request with a rising counter, and nothing else", async () => {
    const keys = await generateP256();
    const { publicKey } = await debugAttestation(keys, CHALLENGE);
    const data = await clientData("POST", "/v1/auth/guest");
    const { assertion: signed } = await assertion(keys.privateKey, APP_ID, 5, data);

    expect(await verifyAssertion(APP_ID, { publicKey, counter: 4 }, signed, data)).toEqual({
      ok: true,
      data: { counter: 5 },
    });
    // Replayed: the counter no longer rises.
    expect(await verifyAssertion(APP_ID, { publicKey, counter: 5 }, signed, data)).toMatchObject({ ok: false });
    // Another request: the client data differs.
    const other = await clientData("DELETE", "/v1/account");
    expect(await verifyAssertion(APP_ID, { publicKey, counter: 4 }, signed, other)).toMatchObject({ ok: false });
    // Another app.
    expect(await verifyAssertion("OTHERTEAM0.app.carodo.ios", { publicKey, counter: 4 }, signed, data)).toMatchObject({
      ok: false,
    });
    // Another key.
    const stranger = await debugAttestation(await generateP256(), CHALLENGE);
    expect(await verifyAssertion(APP_ID, { publicKey: stranger.publicKey, counter: 4 }, signed, data)).toMatchObject({
      ok: false,
    });
  });

  it("hashes the body into the client data", async () => {
    expect(await clientData("PUT", "/v1/x?y=1", new Uint8Array([1]))).not.toEqual(await clientData("PUT", "/v1/x?y=1"));
    expect(new TextDecoder().decode(await clientData("GET", "/v1/feed?page=2"))).toBe(
      `GET\n/v1/feed?page=2\n${toBase64(await sha256(new Uint8Array(0)))}`,
    );
  });
});

it("keeps the development aaguid Apple documents", () => {
  expect(new TextDecoder().decode(AAGUID.development)).toBe("appattestdevelop");
});
