import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Electron 45 downloads its prebuilt binary lazily, the first time its package
 * entry is required. This helper triggers that download with a mirror in place,
 * so `pnpm dev` does not fail on a fresh checkout behind a slow GitHub link.
 */
const desktopDir = fileURLToPath(new URL("../apps/desktop/", import.meta.url));
const mirror = process.env.ELECTRON_MIRROR ?? "https://npmmirror.com/mirrors/electron/";

console.log(`[ensure-electron] mirror=${mirror}`);

const result = spawnSync(process.execPath, ["-e", "require('electron')"], {
  cwd: desktopDir,
  env: { ...process.env, ELECTRON_MIRROR: mirror },
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error("[ensure-electron] failed; check the mirror or your network access.");
  process.exit(result.status ?? 1);
}

console.log("[ensure-electron] Electron binary is ready.");
