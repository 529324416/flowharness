import type {
    AppConfig,
    AppConfigUpdate,
    ApprovalResponseRequest,
    BlobMeta,
    DocumentRef,
    DocumentSaveResult,
    DocumentSnapshot,
    HarnessDocumentSummary,
    IpcEventEnvelope,
    IpcResult,
    ProviderStatus,
    ProviderTestResult,
    RunSnapshot,
    RunStartRequest,
    RunResumeInterruptedRequest,
    SessionCreateRequest,
    SessionDeleteRequest,
    SessionFolder,
    SessionFolderCreateRequest,
    SessionFolderDeleteRequest,
    SessionFolderMoveRequest,
    SessionFolderRenameRequest,
    SessionListRequest,
    SessionMoveRequest,
    SessionReadRequest,
    SessionRecord,
    SessionRenameRequest,
    SessionSaveRequest,
    SessionSummary,
    SessionTree,
    SessionTreeRequest,
    UserInputResponseRequest,
    WindowStatePayload,
    WorkspaceCreateInput,
    WorkbenchSummary,
    WorkspaceExportHarnessRequest,
    WorkspaceSaveDocumentRequest,
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
    readonly secretsHas: (providerId: string) => Promise<IpcResult<{ has: boolean }>>;
    readonly secretsSet: (providerId: string, value: string) => Promise<IpcResult<void>>;
    readonly secretsDelete: (
        providerId: string,
    ) => Promise<IpcResult<{ deleted: boolean }>>;
    readonly listProviders: () => Promise<IpcResult<ProviderStatus[]>>;
    readonly testProvider: (
        providerId: string,
    ) => Promise<IpcResult<ProviderTestResult>>;
    readonly listWorkspaces: () => Promise<IpcResult<WorkspaceSummary[]>>;
    readonly createWorkspace: (
        input: WorkspaceCreateInput,
    ) => Promise<IpcResult<WorkspaceSummary>>;
    readonly openWorkspace: (id: string) => Promise<IpcResult<WorkspaceSummary>>;
    readonly closeWorkspace: (id: string) => Promise<IpcResult<void>>;
    readonly readDocument: (
        workspaceId: string,
        ref: DocumentRef,
    ) => Promise<IpcResult<DocumentSnapshot | null>>;
    readonly saveDocument: (
        request: WorkspaceSaveDocumentRequest,
    ) => Promise<IpcResult<DocumentSaveResult>>;
    readonly listDocuments: (
        workspaceId: string,
    ) => Promise<IpcResult<HarnessDocumentSummary[]>>;
    readonly listWorkbenches: (
        workspaceId: string,
    ) => Promise<IpcResult<WorkbenchSummary[]>>;
    readonly deleteDocument: (
        workspaceId: string,
        ref: DocumentRef,
    ) => Promise<IpcResult<{ deleted: boolean }>>;
    readonly exportHarness: (
        request: WorkspaceExportHarnessRequest,
    ) => Promise<IpcResult<{ path: string | null }>>;
    readonly statBlob: (
        workspaceId: string,
        hash: string,
    ) => Promise<IpcResult<BlobMeta | null>>;

    readonly listSessions: (
        request: SessionListRequest,
    ) => Promise<IpcResult<SessionSummary[]>>;
    readonly listSessionTree: (
        request: SessionTreeRequest,
    ) => Promise<IpcResult<SessionTree>>;
    readonly createSession: (
        request: SessionCreateRequest,
    ) => Promise<IpcResult<SessionRecord>>;
    readonly moveSession: (
        request: SessionMoveRequest,
    ) => Promise<IpcResult<SessionRecord>>;
    readonly renameSession: (
        request: SessionRenameRequest,
    ) => Promise<IpcResult<SessionRecord>>;
    readonly deleteSession: (
        request: SessionDeleteRequest,
    ) => Promise<IpcResult<{ deleted: boolean }>>;
    readonly createSessionFolder: (
        request: SessionFolderCreateRequest,
    ) => Promise<IpcResult<SessionFolder>>;
    readonly renameSessionFolder: (
        request: SessionFolderRenameRequest,
    ) => Promise<IpcResult<SessionFolder>>;
    readonly moveSessionFolder: (
        request: SessionFolderMoveRequest,
    ) => Promise<IpcResult<SessionFolder>>;
    readonly deleteSessionFolder: (
        request: SessionFolderDeleteRequest,
    ) => Promise<IpcResult<{ deleted: boolean }>>;
    readonly openSession: (
        request: SessionReadRequest,
    ) => Promise<IpcResult<SessionRecord>>;
    readonly saveSession: (
        request: SessionSaveRequest,
    ) => Promise<IpcResult<SessionRecord>>;
    readonly closeSession: (
        workspaceId: string,
        sessionId: string,
    ) => Promise<IpcResult<void>>;
    readonly startRun: (request: RunStartRequest) => Promise<IpcResult<RunSnapshot>>;
    readonly pauseRun: (runId: string) => Promise<IpcResult<RunSnapshot>>;
    readonly resumeRun: (runId: string) => Promise<IpcResult<RunSnapshot>>;
    readonly cancelRun: (runId: string) => Promise<IpcResult<void>>;
    readonly getRun: (runId: string) => Promise<IpcResult<RunSnapshot | null>>;
    readonly listRuns: (workspaceId?: string) => Promise<IpcResult<RunSnapshot[]>>;
    readonly resumeInterrupted: (
        request: RunResumeInterruptedRequest,
    ) => Promise<IpcResult<RunSnapshot>>;
    readonly respondApproval: (
        request: ApprovalResponseRequest,
    ) => Promise<IpcResult<{ accepted: boolean }>>;
    readonly respondUserInput: (
        request: UserInputResponseRequest,
    ) => Promise<IpcResult<{ accepted: boolean }>>;
}

declare global {
    interface Window {
        readonly flowharness: FlowHarnessBridge;
    }
}

export {};
