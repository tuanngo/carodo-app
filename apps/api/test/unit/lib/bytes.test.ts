import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "../../../src/lib/encoding/bytes";

describe("base64url", () => {
  it("round-trips every byte value without padding", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(fromBase64Url(text)).toEqual(bytes);
  });

  it("matches RFC 4648 test vectors", () => {
    const encode = (s: string) => toBase64Url(new TextEncoder().encode(s));
    expect(["", "f", "fo", "foo", "foob", "fooba", "foobar"].map(encode)).toEqual([
      "",
      "Zg",
      "Zm8",
      "Zm9v",
      "Zm9vYg",
      "Zm9vYmE",
      "Zm9vYmFy",
    ]);
  });

  it("uses - and _ where base64 has + and /", () => {
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });
});
