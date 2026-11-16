import { exports } from "cloudflare:workers";
import { assertion, clientData, debugAttestation, generateP256 } from "./app-attest.ts";
import { toBase64 } from "./encode.ts";

/**
 * The app as the local server sees it: a debug-attested key (simulator), a guest token, and
 * requests signed with a rising counter (carodo-ios docs/sync.md "App Attest").
 */

export const BASE = "https://api.carodo.test";

export interface TestDevice {
  keyId: string;
  guestToken: string;
  /** A signed request; `body` is sent as JSON when given. */
  send(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
}

export async function attestDevice(appId: string): Promise<TestDevice> {
  const keys = await generateP256();
  const challengeResponse = await exports.default.fetch(`${BASE}/v1/auth/challenge`, { method: "POST" });
  const { challenge } = await challengeResponse.json<{ challenge: string }>();
  const made = await debugAttestation(keys, challenge);
  const keyId = toBase64(made.keyId);
  const guest = await exports.default.fetch(`${BASE}/v1/auth/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keyId, challenge, attestation: toBase64(made.attestation) }),
  });
  if (guest.status !== 200) throw new Error(`guest: ${guest.status} ${await guest.text()}`);
  const { guestToken } = await guest.json<{ guestToken: string }>();

  let counter = 0;
  return {
    keyId,
    guestToken,
    async send(method, path, body, headers = {}) {
      const text = body === undefined ? "" : JSON.stringify(body);
      const bytes = new TextEncoder().encode(text);
      const signed = await assertion(keys.privateKey, appId, ++counter, await clientData(method, path, bytes));
      return exports.default.fetch(`${BASE}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "carodo-app-assertion": `key=:${keyId}:, assertion=:${toBase64(signed.assertion)}:`,
          ...headers,
        },
        body: body === undefined ? undefined : text,
      });
    },
  };
}

export interface TestAccount {
  device: TestDevice;
  accountId: string;
  username: string;
  accountSecret: string;
  accessToken: string;
  refreshToken: string;
  /** A signed request with this account's access token. */
  send(method: string, path: string, body?: unknown): Promise<Response>;
}

/** A device that claimed a fresh username (sharing on, by username, unless said otherwise). */
export async function claimedAccount(
  appId: string,
  options: { sharing?: boolean; displayAs?: "anonymous" | "username"; showVehicle?: boolean } = {},
): Promise<TestAccount> {
  const device = await attestDevice(appId);
  const username = `t_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const response = await device.send(
    "POST",
    "/v1/accounts",
    {
      username,
      deviceCheckToken: "dc",
      sharing: {
        sharing: options.sharing ?? true,
        displayAs: options.displayAs ?? "username",
        showVehicle: options.showVehicle ?? true,
      },
    },
    { authorization: `Bearer ${device.guestToken}` },
  );
  if (response.status !== 201) throw new Error(`claim: ${response.status} ${await response.text()}`);
  const claimed = await response.json<{
    accountSecret: string;
    profile: { id: string };
    session: { accessToken: string; refreshToken: string };
  }>();
  const accessToken = claimed.session.accessToken;
  return {
    device,
    accountId: claimed.profile.id,
    username,
    accountSecret: claimed.accountSecret,
    accessToken,
    refreshToken: claimed.session.refreshToken,
    send: (method, path, body) => device.send(method, path, body, { authorization: `Bearer ${accessToken}` }),
  };
}
