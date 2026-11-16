import { describe, expect, it } from "vitest";
import { LABEL_GUEST_TOKEN } from "../../../src/lib/crypto/secret-key";
import { mintToken, verifyToken } from "../../../src/services/auth/tokens";

describe("tokens", () => {
  const NOW = Date.UTC(2026, 10, 3);

  it("holds until it expires", async () => {
    const token = await mintToken("root", LABEL_GUEST_TOKEN, "subject:with:colons", NOW + 1000);
    expect(await verifyToken("root", LABEL_GUEST_TOKEN, token, NOW)).toEqual({
      ok: true,
      data: { subject: "subject:with:colons", expiresAt: NOW + 1000 },
    });
    expect(await verifyToken("root", LABEL_GUEST_TOKEN, token, NOW + 1000)).toMatchObject({ ok: false });
  });

  it("does not pass under another label or another root, or once altered", async () => {
    const token = await mintToken("root", LABEL_GUEST_TOKEN, "subject", NOW + 1000);
    expect(await verifyToken("root", "carodo:access-token:v1", token, NOW)).toMatchObject({ ok: false });
    expect(await verifyToken("other", LABEL_GUEST_TOKEN, token, NOW)).toMatchObject({ ok: false });
    const forged = `${btoa("subject:9999999999999").replace(/=+$/, "")}.${token.split(".")[1]}`;
    expect(await verifyToken("root", LABEL_GUEST_TOKEN, forged, NOW)).toMatchObject({ ok: false });
    expect(await verifyToken("root", LABEL_GUEST_TOKEN, "garbage", NOW)).toMatchObject({ ok: false });
  });
});
