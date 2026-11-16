import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { LABEL_GUEST_TOKEN } from "../../../src/lib/crypto/secret-key";
import { toBase64 } from "../../../src/lib/encoding/bytes";
import { verifyToken } from "../../../src/services/auth/tokens";
import { assertion, clientData, debugAttestation, generateP256 } from "../../support/app-attest.ts";

const BASE = "https://api.carodo.test";

async function challenge(): Promise<string> {
  const response = await exports.default.fetch(`${BASE}/v1/auth/challenge`, { method: "POST" });
  return (await response.json<{ challenge: string }>()).challenge;
}

function postGuest(body: unknown, headers: Record<string, string> = {}) {
  return exports.default.fetch(`${BASE}/v1/auth/guest`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A key attested through the debug proof, as the simulator does against the local server. */
async function attestedKey() {
  const keys = await generateP256();
  const value = await challenge();
  const made = await debugAttestation(keys, value);
  const response = await postGuest({
    keyId: toBase64(made.keyId),
    challenge: value,
    attestation: toBase64(made.attestation),
  });
  return { keys, made, response, challenge: value };
}

describe("POST /v1/auth/guest", () => {
  it("attests a new key and answers a guest token for it", async () => {
    const { made, response } = await attestedKey();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json<{ guestToken: string; expiresIn: number }>();
    expect(body.expiresIn).toBe(3600);

    const claims = await verifyToken(env.SECRET_KEY, LABEL_GUEST_TOKEN, body.guestToken, Date.now());
    expect(claims).toMatchObject({ ok: true, data: { subject: toBase64(made.keyId) } });

    const row = await env.DB.prepare("SELECT counter, environment FROM app_keys WHERE id = ?")
      .bind(toBase64(made.keyId))
      .first();
    expect(row).toEqual({ counter: 0, environment: "development" });
  });

  it("spends the challenge: the same attestation cannot be sent twice", async () => {
    const { made, challenge: spent } = await attestedKey();
    const again = await postGuest({
      keyId: toBase64(made.keyId),
      challenge: spent,
      attestation: toBase64(made.attestation),
    });
    expect(again.status).toBe(401);
    expect(await again.json()).toMatchObject({ code: "unauthorized" });
  });

  it("answers a known key's assertion with a fresh token, once per counter", async () => {
    const { keys, made } = await attestedKey();
    const signed = await assertion(keys.privateKey, env.APP_ID, 1, await clientData("POST", "/v1/auth/guest"));
    const header = `key=:${toBase64(made.keyId)}:, assertion=:${toBase64(signed.assertion)}:`;

    const first = await postGuest(undefined, { "carodo-app-assertion": header });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ expiresIn: 3600 });

    const replayed = await postGuest(undefined, { "carodo-app-assertion": header });
    expect(replayed.status).toBe(401);
  });

  it("refuses an assertion by a key it never attested", async () => {
    const keys = await generateP256();
    const made = await debugAttestation(keys, "unused");
    const signed = await assertion(keys.privateKey, env.APP_ID, 1, await clientData("POST", "/v1/auth/guest"));
    const response = await postGuest(undefined, {
      "carodo-app-assertion": `key=:${toBase64(made.keyId)}:, assertion=:${toBase64(signed.assertion)}:`,
    });
    expect(response.status).toBe(401);
  });

  it("names the field it refuses", async () => {
    const value = await challenge();
    const cases: [unknown, string][] = [
      [undefined, "The body must be a JSON object."],
      [[], "The body must be a JSON object."],
      [{ challenge: value, attestation: "AA==" }, "keyId is required."],
      [{ keyId: "AAAA", challenge: value, attestation: "AA==" }, "keyId must be 32 bytes."],
      [{ keyId: toBase64(new Uint8Array(32)), attestation: "AA==" }, "challenge is required."],
      [
        { keyId: toBase64(new Uint8Array(32)), challenge: value, attestation: "not base64!" },
        "attestation is not base64.",
      ],
    ];
    for (const [body, detail] of cases) {
      const response = await postGuest(body);
      expect(response.status, detail).toBe(400);
      expect(await response.json()).toMatchObject({ code: "validation", detail });
    }
  });

  it("refuses a body over its size limit", async () => {
    const response = await postGuest({ attestation: "A".repeat(40 * 1024) });
    expect(response.status).toBe(400);
  });
});
