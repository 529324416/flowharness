import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";

// Wireclaw is consumed exactly like any other package: no path into vendor/.
import { Graph } from "wireclaw";

const isSmokeRun = process.env.FLOWHARNESS_SMOKE === "1";

const bootGraph = new Graph([], [], {
  id: "flowharness-main-boot",
  title: "FlowHarness main boot",
});
console.log(
  `[main] wireclaw ready: Graph=${typeof Graph} graphId=${bootGraph.id} nodes=${bootGraph.nodes.length}`,
);

/**
 * electron-vite emits the preload bundle as ESM (`.mjs`) or CJS depending on the
 * package type and version, so resolve whichever file was actually produced.
 */
function resolvePreloadPath(): string {
  const preloadDir = join(__dirname, "../preload");
  for (const fileName of ["index.mjs", "index.js", "index.cjs"]) {
    const candidate = join(preloadDir, fileName);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Preload bundle not found in ${preloadDir}. Run \`pnpm build\` first.`);
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    show: !isSmokeRun,
    backgroundColor: "#0e1116",
    title: "FlowHarness",
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      // The preload is a plain CJS bundle with Node access.
      sandbox: false,
    },
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

ipcMain.on("flowharness:ready", (_event, payload: unknown) => {
  console.log(`[main] renderer-ready ${JSON.stringify(payload)}`);
  if (isSmokeRun) {
    setTimeout(() => app.quit(), 50);
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
