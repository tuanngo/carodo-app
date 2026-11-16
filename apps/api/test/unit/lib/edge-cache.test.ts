import { describe, expect, it } from "vitest";
import { type CacheStore, readThrough } from "../../../src/lib/cache/edge-cache";

/** The Workers Cache, as far as `readThrough` uses it. */
function memoryStore(): CacheStore & { keys(): string[] } {
  const entries = new Map<string, string>();
  return {
    async match(request) {
      const body = entries.get(request.url);
      return body === undefined ? undefined : new Response(body);
    },
    async put(request, response) {
      entries.set(request.url, await response.text());
    },
    keys: () => [...entries.keys()],
  };
}

const TTL = 30_000;
const KEY = "https://api.carodo.test/__cache/v1/feed/discover?cursor=";

function run(store: CacheStore | null, now: number, compute: () => Promise<string>) {
  const pending: Promise<unknown>[] = [];
  const result = readThrough({ store, key: KEY, ttlMs: TTL, now, waitUntil: (p) => pending.push(p), compute });
  // Settled: answered, and the work handed to waitUntil done.
  return { result, settled: async () => Promise.all([result, ...pending]).then(() => Promise.all(pending)) };
}

describe("readThrough", () => {
  it("computes on a miss, then serves the bucket's copy until the bucket ends", async () => {
    const store = memoryStore();
    let computed = 0;
    const compute = async () => `page ${++computed}`;

    const first = run(store, 0, compute);
    expect(await first.result).toEqual({ body: "page 1", source: "miss" });
    await first.settled();
    expect(await run(store, TTL - 1, compute).result).toEqual({ body: "page 1", source: "hit" });
    expect(computed).toBe(1);
    expect(store.keys()).toEqual([`${KEY}&bucket=0`]);
  });

  it("answers from the previous bucket at once and refreshes behind it", async () => {
    const store = memoryStore();
    let computed = 0;
    const compute = async () => `page ${++computed}`;
    await run(store, 0, compute).settled();

    const next = run(store, TTL, compute);
    expect(await next.result).toEqual({ body: "page 1", source: "stale" });
    await next.settled();
    expect(await run(store, TTL + 1, compute).result).toEqual({ body: "page 2", source: "hit" });
  });

  it("computes once for requests racing on one key", async () => {
    let computed = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const compute = async () => {
      computed++;
      await gate;
      return "page";
    };
    const racing = [run(null, 0, compute).result, run(null, 0, compute).result, run(null, 0, compute).result];
    release();
    expect((await Promise.all(racing)).map((r) => r.body)).toEqual(["page", "page", "page"]);
    expect(computed).toBe(1);
    // Settled: the next request computes again.
    await run(null, 0, compute).result;
    expect(computed).toBe(2);
  });

  it("keeps the first request's computation alive, and lets the others compute if it fails", async () => {
    let calls = 0;
    let fail: (error: Error) => void = () => {};
    const compute = async () => {
      calls++;
      if (calls === 1) return new Promise<string>((_, reject) => (fail = reject));
      return "page";
    };
    const handedOver: Promise<unknown>[] = [];
    const leader = readThrough({
      store: null,
      key: KEY,
      ttlMs: TTL,
      now: 0,
      waitUntil: (p) => handedOver.push(p),
      compute,
    });
    const follower = run(null, 0, compute).result;
    expect(handedOver).toHaveLength(1);
    fail(new Error("D1 went away"));
    await expect(leader).rejects.toThrow("D1 went away");
    expect((await follower).body).toBe("page");
    expect(calls).toBe(2);
  });
});
