import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { readBody } from "../../../src/http/request";

/** APP-02: the cap bounds memory, not only the answer, whatever `Content-Length` claims. */

const CAP = 1024;

const app = new Hono().post("/", async (c) => {
  const body = await readBody(c, CAP);
  return body.ok ? c.json({ length: body.data.bytes.length, first: body.data.bytes[0] ?? null }) : c.text("", 400);
});

/** A body in `chunks` chunks of `size` bytes, counting how many were pulled and whether it was cancelled. */
function chunked(chunks: number, size: number) {
  const seen = { pulled: 0, cancelled: false };
  let index = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (index === chunks) return controller.close();
        seen.pulled += 1;
        controller.enqueue(new Uint8Array(size).fill(index++ % 256));
      },
      cancel() {
        seen.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  ); // pulled only when read
  return { stream, seen };
}

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return app.request("/", { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

describe("readBody", () => {
  it("stops reading a body without Content-Length at the first chunk past the cap", async () => {
    const { stream, seen } = chunked(1024, 256); // 256 KiB offered
    expect((await post(stream)).status).toBe(400);
    expect(seen.pulled).toBeLessThanOrEqual(6);
    expect(seen.cancelled).toBe(true);
  });

  it("does not trust a Content-Length smaller than the body", async () => {
    const { stream, seen } = chunked(64, 256);
    expect((await post(stream, { "content-length": "10" })).status).toBe(400);
    expect(seen.cancelled).toBe(true);
  });

  it("refuses a declared length over the cap before reading", async () => {
    const { stream, seen } = chunked(1, 1);
    expect((await post(stream, { "content-length": String(CAP + 1) })).status).toBe(400);
    expect(seen.pulled).toBe(0);
  });

  it("accepts exactly the cap, across chunks, and refuses one byte more", async () => {
    const exact = await post(chunked(4, CAP / 4).stream);
    expect(exact.status).toBe(200);
    expect(await exact.json()).toEqual({ length: CAP, first: 0 });
    expect((await post(new Uint8Array(CAP + 1))).status).toBe(400);
  });

  it("reads an empty body as no bytes", async () => {
    expect(await (await post(null)).json()).toEqual({ length: 0, first: null });
  });
});
