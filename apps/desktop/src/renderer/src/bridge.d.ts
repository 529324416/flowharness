import type {
    AppConfig,
    AppConfigUpdate,
    IpcEventEnvelope,
    IpcResult,
    RunSnapshot,
    RunStartRequest,
    WindowStatePayload,
    WorkspaceCreateInput,
    WorkspaceSummary,
} from "@flowharness/contracts";

/**
 * preload 暴露给 renderer 的唯一入口。
 * 这里只放白名单能力；不要暴露 ipcRenderer 或 Node API。
 */
interface FlowHarnessBridge {
    readonly platform: string;
    /** true 时应用处于 `FLOWHARNESS_SMOKE=1` 自检模式。 */
    readonly smokeMode: boolean;
    /** S0 窗口模式：standard / frameless / overlay / mica / acrylic / transparent / simulated。 */
    readonly windowMode: string;
    readonly versions: {
        readonly electron: string;
        readonly node: string;
        readonly chrome: string;
    };
    readonly reportReady: (payload: Record<string, unknown>) => void;
    readonly onEvent: (listener: (envelope: IpcEventEnvelope) => void) => () => void;

    readonly windowMinimize: () => Promise<IpcResult<void>>;
    readonly windowToggleMaximize: () => Promise<IpcResult<WindowStatePayload>>;
    readonly windowClose: () => Promise<IpcResult<void>>;
    readonly isWindowMaximized: () => Promise<IpcResult<WindowStatePayload>>;

    readonly getConfig: () => Promise<IpcResult<AppConfig>>;
    readonly updateConfig: (patch: AppConfigUpdate) => Promise<IpcResult<AppConfig>>;
    readonly listWorkspaces: () => Promise<IpcResult<WorkspaceSummary[]>>;
    readonly createWorkspace: (
        input: WorkspaceCreateInput,
    ) => Promise<IpcResult<WorkspaceSummary>>;
    readonly openWorkspace: (id: string) => Promise<IpcResult<WorkspaceSummary>>;
    readonly closeWorkspace: (id: string) => Promise<IpcResult<void>>;

    readonly startRun: (request: RunStartRequest) => Promise<IpcResult<RunSnapshot>>;
    readonly cancelRun: (runId: string) => Promise<IpcResult<void>>;
    readonly getRun: (runId: string) => Promise<IpcResult<RunSnapshot | null>>;
}

declare global {
    interface Window {
        readonly flowharness: FlowHarnessBridge;
    }
}

export {};
