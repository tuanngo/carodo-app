import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * A stand-in `carodo-api-local` behind the same service binding: the web's tests check its pages and
 * the binding's wiring, while the api's own tests check what `WebRpc` answers.
 */
const fakeApi = `
import { WorkerEntrypoint } from "cloudflare:workers";
export class WebRpc extends WorkerEntrypoint {
  ping() { return { environment: "test-api" }; }
}
export default { fetch: () => new Response(null, { status: 404 }) };
`;

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        workers: [{ name: "carodo-api-local", modules: true, script: fakeApi, compatibilityDate: "2026-11-03" }],
      },
    }),
  ],
});
