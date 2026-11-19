import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url, utf8 } from "../../../src/lib/encoding/bytes";
import { openCursor, sealCursor } from "../../../src/services/feed/cursor";

const ROOT = "test-only-secret-key-not-a-secret";
const position = { key: Date.UTC(2026, 10, 3, 7), itemId: "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b" };

describe("Feed cursor", () => {
  it("opens to the position it sealed, and seals it the same way every time", async () => {
    const cursor = await sealCursor(ROOT, position);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await sealCursor(ROOT, position)).toBe(cursor);
    expect(await openCursor(ROOT, cursor)).toEqual({ ok: true, data: position });
  });

  it("tells nothing: neither the hour nor the item can be read from it", async () => {
    const cursor = await sealCursor(ROOT, position);
    const decoded = String.fromCharCode(...fromBase64Url(cursor));
    expect(decoded).not.toContain(String(position.key));
    expect(decoded).not.toContain(position.itemId);
  });

  it("refuses a changed, crafted or foreign cursor", async () => {
    const cursor = await sealCursor(ROOT, position);
    const changed = `${cursor.slice(0, -2)}${cursor.endsWith("AA") ? "BB" : "AA"}`;
    for (const bad of [changed, "abc", "!!", toBase64Url(utf8(`${position.key}:${position.itemId}`))]) {
      expect((await openCursor(ROOT, bad)).ok).toBe(false);
    }
    expect((await openCursor("another-root", cursor)).ok).toBe(false);
  });
});
