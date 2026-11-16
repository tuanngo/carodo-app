import { spawn, spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function build() {
  return spawnSync(process.execPath, ["scripts/build-styles.mjs"], { cwd: root, stdio: "inherit" }).status;
}
if (build() !== 0) process.exit(1);
const worker = spawn(
  `${root}node_modules/.bin/wrangler`,
  ["dev", "--port", "8081", "--inspector-port", "9281", ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit" },
);
let timer;
const watcher = watch(`${root}src`, { recursive: true }, (_event, name) => {
  if (!name || name.startsWith(".generated/") || !/\.(css|tsx)$/.test(name)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    build();
  }, 100);
});
function close() {
  clearTimeout(timer);
  watcher.close();
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    close();
    worker.kill(signal);
  });
}
worker.on("error", (error) => {
  close();
  console.error(error.message);
  process.exitCode = 1;
});
worker.on("exit", (code) => {
  close();
  process.exitCode = code ?? 0;
});
