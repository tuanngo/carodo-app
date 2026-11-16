import { describe, expect, it } from "vitest";
import { readThrough } from "../../../src/lib/cache/edge-cache";

/** The same steps as the unit test, on workerd's own Cache API: keys, bodies and TTLs it accepts. */
describe("readThrough on the Workers Cache", () => {
  it("stores a page under its bucket and serves it, then stale, then fresh", async () => {
    const store = await caches.open(`edge-cache-${crypto.randomUUID()}`);
    const key = "https://api.carodo.test/__cache/v1/feed/discover?cursor=";
    let computed = 0;
    const once = async (now: number) => {
      const pending: Promise<unknown>[] = [];
      const result = await readThrough({
        store,
        key,
        ttlMs: 30_000,
        now,
        waitUntil: (promise) => pending.push(promise),
        compute: async () => JSON.stringify({ page: ++computed }),
      });
      await Promise.all(pending);
      return result;
    };
    const now = Date.now();
    expect(await once(now)).toEqual({ body: '{"page":1}', source: "miss" });
    expect(await once(now)).toEqual({ body: '{"page":1}', source: "hit" });
    expect(await once(now + 30_000)).toEqual({ body: '{"page":1}', source: "stale" });
    expect(await once(now + 30_000)).toEqual({ body: '{"page":2}', source: "hit" });
  });
});
