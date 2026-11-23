import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Make sure Electron's userData directory already exists before the app starts.
 *
 * On some Windows setups (restricted terminal tokens, security software, CI
 * runners) Chromium's own attempt to create `%APPDATA%\FlowHarness` is denied,
 * and Electron aborts during startup with an access-violation exit code before
 * any application code runs. Creating the directory from plain Node is allowed
 * there, so we do it ahead of time.
 *
 * The app name comes from `productName` in package.json, so keep them aligned.
 */
const APP_NAME = "FlowHarness";
const appData = process.env.APPDATA ?? process.env.LOCALAPPDATA;

if (!appData) {
  console.warn("[prepare-userdata] APPDATA is not set; skipping.");
} else {
  const userDataDir = join(appData, APP_NAME);
  mkdirSync(userDataDir, { recursive: true });
  console.log(`[prepare-userdata] ${userDataDir}`);
}
