import { defineConfig, externalizeDepsPlugin } from "electron-vite";

/**
 * Main / preload / renderer are three separate bundles.
 *
 * Main and preload are emitted as CommonJS: Electron's ESM main process is not
 * reliable on every platform/version yet, and CJS keeps startup deterministic.
 *
 * `wireclaw` is the one runtime dependency that must NOT be externalized: it is
 * an ESM-only package, so leaving it as a `require()` would fail at runtime.
 * Bundling it keeps the source-level `import { Graph } from "wireclaw"` intact
 * and lets the bundler resolve the package through its `exports` map.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["wireclaw"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {},
});
