import { contextBridge, ipcRenderer } from "electron";
import {
    IpcChannel,
    IpcSendChannel,
    type AppConfig,
    type AppConfigUpdate,
    type IpcResult,
    type WorkspaceCreateInput,
    type WorkspaceSummary,
} from "@flowharness/contracts";

async function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
    return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>;
}

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
        ipcRenderer.send(IpcSendChannel.ReportReady, payload);
    },
    getConfig: (): Promise<IpcResult<AppConfig>> => invoke(IpcChannel.ConfigGet),
    updateConfig: (patch: AppConfigUpdate): Promise<IpcResult<AppConfig>> =>
        invoke(IpcChannel.ConfigUpdate, patch),
    listWorkspaces: (): Promise<IpcResult<WorkspaceSummary[]>> =>
        invoke(IpcChannel.WorkspaceList),
    createWorkspace: (input: WorkspaceCreateInput): Promise<IpcResult<WorkspaceSummary>> =>
        invoke(IpcChannel.WorkspaceCreate, input),
    openWorkspace: (id: string): Promise<IpcResult<WorkspaceSummary>> =>
        invoke(IpcChannel.WorkspaceOpen, { id }),
    closeWorkspace: (id: string): Promise<IpcResult<void>> =>
        invoke(IpcChannel.WorkspaceClose, { id }),
};

contextBridge.exposeInMainWorld("flowharness", bridge);
