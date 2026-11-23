import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

/**
 * Main / preload / renderer are three separate bundles.
 *
 * Main and preload are emitted as CommonJS: Electron's ESM main process is not
 * reliable on every platform/version yet, and CJS keeps startup deterministic.
 *
 * Dependencies that must be bundled rather than require()'d at runtime:
 * - `wireclaw` is ESM-only and imports fine only through a bundler;
 * - `@flowharness/contracts` ships TypeScript sources (internal package).
 * Both stay normal package imports in source code.
 */
const bundled = ["wireclaw", "@flowharness/contracts"];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@flowharness/contracts"] })],
  },
  renderer: {
    plugins: [react()],
  },
});
