import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The iOS tests check a copy of the App Attest vectors (carodo-ios docs/sync.md "App Attest").
 * With carodo-ios next to this repository, the copy must match the original; on its own (a lone
 * clone, CI, Workers Builds) there is nothing to compare and the test is skipped.
 */
const original = fileURLToPath(new URL("../../fixtures/app-attest-vectors.json", import.meta.url));
const iosRepo = fileURLToPath(new URL("../../../../../../carodo-ios/", import.meta.url));
const iosCopy = `${iosRepo}CarodoTests/Fixtures/app-attest-vectors.json`;

describe.skipIf(!existsSync(iosCopy))("the iOS copy of the App Attest vectors", () => {
  it("matches the original (regenerate with scripts/app-attest-vectors.ts --ios)", () => {
    expect(readFileSync(iosCopy, "utf8")).toBe(readFileSync(original, "utf8"));
  });
});
