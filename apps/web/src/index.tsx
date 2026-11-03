import { app } from "./app";
import type { WebEnv } from "./env";

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<WebEnv>;
