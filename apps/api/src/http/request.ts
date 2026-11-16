import type { Context } from "hono";
import { type Bytes, concat } from "../lib/encoding/bytes";
import { fail, ok, type Result } from "../services/shared/result";

export interface Body {
  /** The raw bytes: what an assertion's client data hashes. */
  bytes: Bytes;
  /** The body as JSON, or undefined when it is not JSON (the validator then refuses it). */
  json(): unknown;
}

/**
 * Reads the body once, at most `maxBytes` of it: a declared length over the cap is refused before
 * reading, and the stream is cancelled at the first chunk past it, so a body sent without (or with a
 * false) `Content-Length` never sits whole in memory.
 */
export async function readBody(c: Context, maxBytes: number): Promise<Result<Body>> {
  const tooLarge = fail("validation", "The body is too large.");
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > maxBytes) return tooLarge;
  const bytes = await readAtMost(c.req.raw.body, maxBytes);
  if (bytes === null) return tooLarge;
  return ok({
    bytes,
    json() {
      try {
        return JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return undefined;
      }
    },
  });
}

/** The stream's bytes, or null (and the stream cancelled) once they pass `maxBytes`. */
async function readAtMost(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Bytes | null> {
  if (stream === null) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  // A stream is read one chunk after another: each read waits on the network, never on D1.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return concat(...chunks);
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}
