import { contextBridge, ipcRenderer } from "electron";

/**
 * The only bridge between the renderer and the Electron main process.
 * Keep it small and explicit: everything here becomes part of the renderer's
 * trusted surface.
 */
const bridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
  reportReady: (payload: Record<string, unknown>): void => {
    ipcRenderer.send("flowharness:ready", payload);
  },
};

contextBridge.exposeInMainWorld("flowharness", bridge);
