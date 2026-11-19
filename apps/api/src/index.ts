import { app } from "./app";
import { runScheduled } from "./jobs/scheduled";

export { WebRpc } from "./rpc/web-rpc";

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, controller.scheduledTime, controller.cron));
  },
} satisfies ExportedHandler<Env>;
