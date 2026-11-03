import { app } from "./app";

export { WebRpc } from "./rpc/web-rpc";

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
