import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import {
  IpcChannel,
  IpcSendChannel,
  ipcFail,
  ipcOk,
  type IpcResult,
  type ThemeMode,
  type ThemeSetResponse,
} from "@flowharness/contracts";

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

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

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

const WINDOW_BACKGROUND = { light: "#f3f6fa", dark: "#0b0f15" } as const;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    show: !isSmokeRun,
    backgroundColor: WINDOW_BACKGROUND[
      nativeTheme.shouldUseDarkColors ? "dark" : "light"
    ],
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

function registerIpc(): void {
  ipcMain.handle(
    IpcChannel.ThemeSet,
    (_event, payload: unknown): IpcResult<ThemeSetResponse> => {
      const theme =
        typeof payload === "object" && payload !== null && "theme" in payload
          ? (payload as { theme?: unknown }).theme
          : undefined;

      if (!isThemeMode(theme)) {
        return ipcFail("E_INVALID_ARGUMENT", "theme must be light, dark or system");
      }

      nativeTheme.themeSource = theme;
      const resolved = nativeTheme.shouldUseDarkColors ? "dark" : "light";
      console.log(`[main] theme-applied request=${theme} resolved=${resolved}`);
      return ipcOk({ theme: resolved });
    },
  );

  ipcMain.on(IpcSendChannel.ReportReady, (_event, payload: unknown) => {
    console.log(`[main] renderer-ready ${JSON.stringify(payload)}`);
    if (isSmokeRun) {
      setTimeout(() => app.quit(), 50);
    }
  });
}

registerIpc();

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
