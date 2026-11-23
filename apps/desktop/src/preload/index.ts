import { contextBridge, ipcRenderer } from "electron";
import {
  IpcChannel,
  IpcSendChannel,
  type IpcResult,
  type ThemeMode,
  type ThemeSetResponse,
} from "@flowharness/contracts";

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
  setTheme: (theme: ThemeMode): Promise<IpcResult<ThemeSetResponse>> =>
    ipcRenderer.invoke(IpcChannel.ThemeSet, { theme }) as Promise<
      IpcResult<ThemeSetResponse>
    >,
  reportReady: (payload: Record<string, unknown>): void => {
    ipcRenderer.send(IpcSendChannel.ReportReady, payload);
  },
};

contextBridge.exposeInMainWorld("flowharness", bridge);
