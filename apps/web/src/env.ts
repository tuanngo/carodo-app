import type { WebRpcApi } from "@carodo/api/web-contract";

/**
 * The web's bindings. `wrangler types` writes the runtime types only (`--include-env=false`): a
 * generated `API` would be typed from the api's source, which the web never reads. Keep this in
 * step with wrangler.jsonc.
 */
declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import("./index");
    }
    interface Env {
      API: Service<WebRpcApi>;
    }
  }
}

export type WebEnv = Cloudflare.Env;
