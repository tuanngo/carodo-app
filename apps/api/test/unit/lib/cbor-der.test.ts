import { describe, expect, it } from "vitest";
import { CborError, decodeCbor, decodeCborItem } from "../../../src/lib/encoding/cbor";
import { DerError, ecdsaDerToRaw, parseCertificate } from "../../../src/lib/encoding/der";
import { APPLE_APP_ATTEST_ROOT } from "../../../src/services/attest/apple-root";
import { cbor } from "../../support/encode.ts";

const hex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));

describe("cbor", () => {
  it("decodes RFC 8949 Appendix A examples it supports", () => {
    expect(decodeCbor(hex("00"))).toBe(0);
    expect(decodeCbor(hex("17"))).toBe(23);
    expect(decodeCbor(hex("1818"))).toBe(24);
    expect(decodeCbor(hex("190100"))).toBe(256);
    expect(decodeCbor(hex("1a000f4240"))).toBe(1_000_000);
    expect(decodeCbor(hex("1b000000e8d4a51000"))).toBe(1_000_000_000_000);
    expect(decodeCbor(hex("20"))).toBe(-1);
    expect(decodeCbor(hex("3863"))).toBe(-100);
    expect(decodeCbor(hex("4401020304"))).toEqual(Uint8Array.of(1, 2, 3, 4));
    expect(decodeCbor(hex("6449455446"))).toBe("IETF");
    expect(decodeCbor(hex("83010203"))).toEqual([1, 2, 3]);
    expect(decodeCbor(hex("a201020304"))).toEqual(
      new Map([
        [1, 2],
        [3, 4],
      ]),
    );
    expect(decodeCbor(hex("f4"))).toBe(false);
    expect(decodeCbor(hex("f5"))).toBe(true);
    expect(decodeCbor(hex("f6"))).toBe(null);
  });

  it("round-trips what the test encoder writes", () => {
    const value = new Map<string, unknown>([
      ["fmt", "apple-appattest"],
      ["n", [1, -7, 65_536]],
      ["bytes", new Uint8Array(300)],
    ]);
    // biome-ignore lint/suspicious/noExplicitAny: the encoder's input type is narrower than Map<string, unknown>
    expect(decodeCbor(cbor(value as any) as Uint8Array<ArrayBuffer>)).toEqual(value);
  });

  it("reports where an item ends, so a caller can read what follows", () => {
    expect(decodeCborItem(hex("a10102ff"), 0)).toEqual({ value: new Map([[1, 2]]), end: 3 });
  });

  it("refuses what App Attest never sends and what would overrun its input", () => {
    for (const bad of [
      "f97e00", // half float
      "c11a514b67b0", // tag
      "5f42010243030405ff", // indefinite byte string
      "9f01ff", // indefinite array
      "44010203", // byte string shorter than declared
      "9b00000000ffffffff", // an array longer than the input
      "a201020103", // duplicate map key
      "a1f401", // a boolean map key
      "0001", // trailing bytes
      "62c328", // invalid UTF-8
    ]) {
      expect(() => decodeCbor(hex(bad)), bad).toThrow(CborError);
    }
  });

  it("refuses nesting past its bound", () => {
    expect(() => decodeCbor(hex(`${"81".repeat(40)}00`))).toThrow(CborError);
  });
});

describe("der", () => {
  it("parses Apple's App Attest root", () => {
    const root = parseCertificate(APPLE_APP_ATTEST_ROOT);
    expect(root.signatureAlgorithm).toBe("1.2.840.10045.4.3.3");
    expect(root.curve).toBe("1.3.132.0.34");
    expect(root.publicKey).toHaveLength(97);
    expect(root.notBefore).toBe(Date.UTC(2020, 2, 18, 18, 32, 53));
    expect(root.notAfter).toBe(Date.UTC(2045, 2, 15));
    expect(root.issuer).toEqual(root.subject);
    expect(new TextDecoder().decode(root.subject)).toContain("Apple App Attestation Root CA");
    expect([...root.extensions.keys()].sort()).toEqual(["2.5.29.14", "2.5.29.15", "2.5.29.19"]);
  });

  it("verifies Apple's root signs itself", async () => {
    const root = parseCertificate(APPLE_APP_ATTEST_ROOT);
    const key = await crypto.subtle.importKey("spki", root.spki, { name: "ECDSA", namedCurve: "P-384" }, false, [
      "verify",
    ]);
    const raw = ecdsaDerToRaw(root.signature, 48);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-384" }, key, raw, root.tbs)).toBe(true);
  });

  it("refuses a truncated or padded certificate", () => {
    expect(() => parseCertificate(APPLE_APP_ATTEST_ROOT.slice(0, 100))).toThrow(DerError);
    const padded = new Uint8Array(APPLE_APP_ATTEST_ROOT.length + 1);
    padded.set(APPLE_APP_ATTEST_ROOT);
    expect(() => parseCertificate(padded)).toThrow(DerError);
  });

  it("widens short ECDSA integers to the curve's size", () => {
    expect(ecdsaDerToRaw(hex("3006020101020102"), 4)).toEqual(Uint8Array.of(0, 0, 0, 1, 0, 0, 0, 2));
    expect(() => ecdsaDerToRaw(hex("300702020101020102"), 1)).toThrow(DerError);
  });
});
