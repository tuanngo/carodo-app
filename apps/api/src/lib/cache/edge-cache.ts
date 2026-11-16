/**
 * A read-through cache for what many readers see (ADR 0008, cost C9), from the analytics service's
 * lessons:
 *
 * - The key carries its TTL bucket (`floor(now / ttl)`), so it changes when the data goes stale and
 *   nothing is ever purged by hand.
 * - Stale-while-revalidate: on a miss of the current bucket, the previous bucket's copy answers at
 *   once and the current one is computed in `waitUntil`. A reader waits for D1 only when neither
 *   exists.
 * - One computation per key per isolate: requests racing for the same key share one promise.
 *
 * Holds JSON text only, never a `Response`, so a shared promise carries no I/O object across
 * requests. `store` is the Workers Cache (`caches.default`), or null where it does nothing useful
 * (local, tests); the race guard works either way.
 */

export interface CacheStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface ReadThrough {
  store: CacheStore | null;
  /** An absolute URL naming the data, without its bucket; never a token or a reader's id. */
  key: string;
  ttlMs: number;
  now: number;
  waitUntil(promise: Promise<unknown>): void;
  compute(): Promise<string>;
}

export type CacheSource = "hit" | "stale" | "miss";

/** Not request state: computations in flight in this isolate, removed when they settle. */
const inflight = new Map<string, Promise<string>>();

export async function readThrough(options: ReadThrough): Promise<{ body: string; source: CacheSource }> {
  const bucket = Math.floor(options.now / options.ttlMs);
  const current = bucketKey(options.key, bucket);
  const { store } = options;
  const compute = () => once(current, options.compute, options.waitUntil);
  if (store === null) return { body: await compute(), source: "miss" };

  const [fresh, previous] = await Promise.all([
    store.match(new Request(current)),
    store.match(new Request(bucketKey(options.key, bucket - 1))),
  ]);
  if (fresh) return { body: await fresh.text(), source: "hit" };

  const refresh = async () => {
    const body = await compute();
    await store.put(new Request(current), stored(body, options.ttlMs));
    return body;
  };
  if (previous) {
    options.waitUntil(refresh().catch(() => undefined));
    return { body: await previous.text(), source: "stale" };
  }
  const body = await compute();
  options.waitUntil(store.put(new Request(current), stored(body, options.ttlMs)).catch(() => undefined));
  return { body, source: "miss" };
}

function bucketKey(key: string, bucket: number): string {
  const url = new URL(key);
  url.searchParams.set("bucket", String(bucket));
  return url.toString();
}

/** Kept two buckets: its own, then as the stale copy for the next one. */
function stored(body: string, ttlMs: number): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${Math.ceil((2 * ttlMs) / 1000)}`,
    },
  });
}

/**
 * The first request runs the computation under its own `waitUntil`, so it finishes even if that
 * request's client goes away; a request that joined it and sees it fail computes for itself.
 */
function once(key: string, compute: () => Promise<string>, waitUntil: (promise: Promise<unknown>) => void) {
  const running = inflight.get(key);
  if (running) return running.catch(() => compute());
  const started = compute().finally(() => inflight.delete(key));
  inflight.set(key, started);
  waitUntil(started.catch(() => undefined));
  return started;
}
