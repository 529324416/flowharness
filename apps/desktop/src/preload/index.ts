import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
    IPC_EVENT_CHANNEL,
    IpcChannel,
    IpcSendChannel,
    type AppConfig,
    type AppConfigUpdate,
    type IpcEventEnvelope,
    type IpcResult,
    type RunSnapshot,
    type RunStartRequest,
    type WindowStatePayload,
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
    smokeMode: process.env.FLOWHARNESS_SMOKE === "1",
    windowMode: process.env.FLOWHARNESS_WINDOW_MODE ?? "frameless",
    versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
    },
    reportReady: (payload: Record<string, unknown>): void => {
        ipcRenderer.send(IpcSendChannel.ReportReady, payload);
    },
    onEvent: (listener: (envelope: IpcEventEnvelope) => void): (() => void) => {
        const handler = (_event: IpcRendererEvent, envelope: IpcEventEnvelope): void => {
            listener(envelope);
        };
        ipcRenderer.on(IPC_EVENT_CHANNEL, handler);
        return () => {
            ipcRenderer.removeListener(IPC_EVENT_CHANNEL, handler);
        };
    },
    windowMinimize: (): Promise<IpcResult<void>> => invoke(IpcChannel.WindowMinimize),
    windowToggleMaximize: (): Promise<IpcResult<WindowStatePayload>> =>
        invoke(IpcChannel.WindowToggleMaximize),
    windowClose: (): Promise<IpcResult<void>> => invoke(IpcChannel.WindowClose),
    isWindowMaximized: (): Promise<IpcResult<WindowStatePayload>> =>
        invoke(IpcChannel.WindowIsMaximized),
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
    startRun: (request: RunStartRequest): Promise<IpcResult<RunSnapshot>> =>
        invoke(IpcChannel.RunStart, request),
    cancelRun: (runId: string): Promise<IpcResult<void>> =>
        invoke(IpcChannel.RunCancel, { runId }),
    getRun: (runId: string): Promise<IpcResult<RunSnapshot | null>> =>
        invoke(IpcChannel.RunGet, { runId }),
};

contextBridge.exposeInMainWorld("flowharness", bridge);
