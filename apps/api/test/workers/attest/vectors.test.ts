import { describe, expect, it } from "vitest";
import { fromBase64, sha256, toBase64, utf8 } from "../../../src/lib/encoding/bytes";
import { clientDataOf, parseAssertionHeader, verifyAssertion } from "../../../src/services/attest/assertion";
import { verifyAttestation } from "../../../src/services/attest/attestation";
import type { AttestPolicy } from "../../../src/services/attest/policy";
// The original, written by scripts/app-attest-vectors.ts; the iOS tests check a copy of it
// (carodo-ios docs/sync.md "App Attest", test/unit/attest/vectors-copy.node.test.ts).
import vectors from "../../fixtures/app-attest-vectors.json";
import { bytesToHex } from "../../support/encode.ts";

const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));

describe("shared App Attest vectors", () => {
  it("derives the hashes the app derives", async () => {
    expect(bytesToHex(await sha256(utf8(vectors.appId)))).toBe(vectors.rpIdHash);
    expect(bytesToHex(await sha256(utf8(vectors.challenge)))).toBe(vectors.clientDataHash);
    expect(toBase64(await sha256(fromHex(vectors.key.publicKey)))).toBe(vectors.key.keyId);
  });

  it("accepts the debug attestation where debug proofs are allowed", async () => {
    const policy: AttestPolicy = {
      appId: vectors.appId,
      environments: new Set(["development"]),
      allowDebug: true,
      root: new Uint8Array(0),
    };
    const result = await verifyAttestation(
      policy,
      {
        keyId: fromBase64(vectors.key.keyId),
        challenge: vectors.challenge,
        attestation: fromBase64(vectors.debugAttestation),
      },
      Date.now(),
    );
    expect(result).toMatchObject({ ok: true, data: { keyId: vectors.key.keyId, environment: "development" } });
  });

  for (const vector of vectors.assertions) {
    it(`builds and verifies the assertion for ${vector.method} ${vector.pathAndQuery}`, async () => {
      const clientData = await clientDataOf(vector.method, vector.pathAndQuery, utf8(vector.body));
      expect(new TextDecoder().decode(clientData)).toBe(vector.clientData);

      const header = parseAssertionHeader(vector.header);
      if (!header.ok) throw new Error(header.code);
      expect(toBase64(header.data.keyId)).toBe(vectors.key.keyId);
      expect(toBase64(header.data.assertion)).toBe(vector.assertion);

      const key = { publicKey: fromHex(vectors.key.publicKey), counter: vector.counter - 1 };
      expect(await verifyAssertion(vectors.appId, key, header.data.assertion, clientData)).toEqual({
        ok: true,
        data: { counter: vector.counter },
      });
    });
  }
});
