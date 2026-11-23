import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Headless-ish smoke test: launch the built Electron app with a hidden window,
 * let the renderer report in, and exit. Proves that the Electron binary runs and
 * that both the main process and the renderer loaded `wireclaw`.
 */
const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const appDir = join(import.meta.dirname, "..");
const mainBundle = join(appDir, "out", "main", "index.js");

if (!existsSync(mainBundle)) {
  console.error(`[smoke] missing build output ${mainBundle}; run \`pnpm build\` first.`);
  process.exitCode = 1;
} else {
  // A host process that is itself Electron (e.g. an agent harness) exports
  // ELECTRON_RUN_AS_NODE=1; the child must launch as a real Electron app.
  const childEnv = { ...process.env, FLOWHARNESS_SMOKE: "1" };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  // --no-sandbox: automated/headless hosts often run the process under a
  // restricted token where Chromium's OS sandbox cannot initialize (the launch
  // dies with STATUS_BREAKPOINT before any app code runs). `pnpm dev` from a
  // normal desktop terminal keeps the sandbox enabled.
  const child = spawn(electronBinary, ["--no-sandbox", "--disable-gpu", appDir], {
    cwd: appDir,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  const collect = (stream) => (chunk) => {
    output += chunk;
    stream.write(chunk);
  };
  child.stdout.on("data", collect(process.stdout));
  child.stderr.on("data", collect(process.stderr));

  const timer = setTimeout(() => {
    console.error("[smoke] timed out after 30s");
    child.kill();
  }, 30_000);

  child.on("exit", (code) => {
    clearTimeout(timer);
    if (code !== 0) {
      console.error(`[smoke] electron exited with code ${code}`);
      process.exitCode = 1;
      return;
    }
    if (!output.includes("renderer-ready") || !output.includes("wireclaw ready")) {
      console.error("[smoke] expected markers not found in output");
      process.exitCode = 1;
      return;
    }
    if (!output.includes('"phase":"data"') || !output.includes('"configLoaded":true')) {
      console.error("[smoke] renderer never completed the data-layer round trip");
      process.exitCode = 1;
      return;
    }
    console.log("[smoke] OK — Electron launched; wireclaw + config/workspace IPC are live.");
  });
}
