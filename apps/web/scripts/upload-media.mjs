import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listVideos } from "./build-media.mjs";

/**
 * Puts the site's videos (media/*.mp4) in the public R2 bucket `carodo-media`, served at
 * https://media.carodo.app (docs/operations/deploy.md). Each key carries a hash of the bytes, so an
 * object never changes and is cached for a year; a re-run overwrites with the same bytes. Runs before
 * every web deploy, so a page never names a clip that is not there. One bucket for staging and
 * production: the account comes from `.env.deploy` through scripts/wrangler.mjs.
 */
const BUCKET = "carodo-media";
const wrangler = fileURLToPath(new URL("../../../scripts/wrangler.mjs", import.meta.url));

for (const video of listVideos()) {
  const put = spawnSync(
    process.execPath,
    [
      wrangler,
      "production",
      "web",
      "r2",
      "object",
      "put",
      `${BUCKET}/${video.objectKey}`,
      "--file",
      video.file,
      "--content-type",
      "video/mp4",
      "--cache-control",
      "public, max-age=31536000, immutable",
      "--remote",
    ],
    { stdio: "inherit" },
  );
  if (put.status !== 0) process.exit(put.status ?? 1);
}
