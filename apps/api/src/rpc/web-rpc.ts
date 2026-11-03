import { WorkerEntrypoint } from "cloudflare:workers";
import type { Ping, WebRpcApi } from "./types";

/**
 * What the web Worker may ask of the api, and nothing more (docs/decisions/0001). It has no URL:
 * only a service binding reaches it. Every method calls a service and returns its result; the
 * web never sees an account, a backup or a revoked share.
 */
export class WebRpc extends WorkerEntrypoint<Env> implements WebRpcApi {
  ping(): Ping {
    return { environment: this.env.ENVIRONMENT };
  }
}
