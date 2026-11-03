/**
 * The web contract: what `WebRpc` answers, as types only. The web imports it with `import type`
 * through `@carodo/api/web-contract` and never reads the api's source, so neither its bundle nor
 * its type check depends on the api's code (docs/decisions/0001). `WebRpc` implements it; the
 * api's type check fails when the two drift.
 */

export interface Ping {
  environment: string;
}

export interface WebRpcApi extends Rpc.WorkerEntrypointBranded {
  ping(): Ping;
}
