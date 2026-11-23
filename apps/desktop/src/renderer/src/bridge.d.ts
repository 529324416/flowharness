import type {
    AppConfig,
    AppConfigUpdate,
    IpcResult,
    WorkspaceCreateInput,
    WorkspaceSummary,
} from "@flowharness/contracts";

/**
 * preload 暴露给 renderer 的唯一入口。
 * 这里只放白名单能力；不要暴露 ipcRenderer 或 Node API。
 */
interface FlowHarnessBridge {
    readonly platform: string;
    readonly versions: {
        readonly electron: string;
        readonly node: string;
        readonly chrome: string;
    };
    readonly reportReady: (payload: Record<string, unknown>) => void;

    readonly getConfig: () => Promise<IpcResult<AppConfig>>;
    readonly updateConfig: (patch: AppConfigUpdate) => Promise<IpcResult<AppConfig>>;
    readonly listWorkspaces: () => Promise<IpcResult<WorkspaceSummary[]>>;
    readonly createWorkspace: (
        input: WorkspaceCreateInput,
    ) => Promise<IpcResult<WorkspaceSummary>>;
    readonly openWorkspace: (id: string) => Promise<IpcResult<WorkspaceSummary>>;
    readonly closeWorkspace: (id: string) => Promise<IpcResult<void>>;
}

declare global {
    interface Window {
        readonly flowharness: FlowHarnessBridge;
    }
}

export {};
