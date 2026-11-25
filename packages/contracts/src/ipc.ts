import type {
    AppConfig,
    AppConfigUpdate,
    AppInfo,
    BlobMeta,
    DocumentRef,
    DocumentSaveResult,
    DocumentSnapshot,
    HarnessDocumentSummary,
    WindowStatePayload,
    WorkspaceCreateInput,
    WorkspaceSummary,
} from "./domain";
import type { WorkbenchSummary } from "./workbench";
import type { ProviderStatus, ProviderTestResult } from "./provider";
import type {
    SessionCloseRequest,
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
    SessionSaveRunRequest,
    SessionSetDraftFolderRequest,
    SessionSummary,
    SessionTree,
    SessionTreeRequest,
} from "./session";
import type {
    ApprovalResponseRequest,
    RunCancelRequest,
    RunEventBatch,
    RunGetRequest,
    RunListRequest,
    RunPauseRequest,
    RunResultRequest,
    RunResumeInterruptedRequest,
    RunResumeRequest,
    RunSnapshot,
    RunStartRequest,
    UserInputResponseRequest,
} from "./run";

/**
 * invoke 通道（renderer → main，请求/响应）。
 *
 * 这里列的是**契约全集**；未实现的通道在对应阶段接入，preload 只暴露已实现的白名单。
 */
export const IpcChannel = {
    AppGetInfo: "app:getInfo",

    WindowMinimize: "window:minimize",
    WindowToggleMaximize: "window:toggle-maximize",
    WindowClose: "window:close",
    WindowIsMaximized: "window:is-maximized",

    ConfigGet: "config:get",
    ConfigUpdate: "config:update",
    ConfigReset: "config:reset",

    SecretsHas: "secrets:has",
    SecretsSet: "secrets:set",
    SecretsDelete: "secrets:delete",

    ProvidersList: "providers:list",
    ProvidersTest: "providers:test",

    WorkspaceList: "workspace:list",
    WorkspaceCreate: "workspace:create",
    WorkspaceOpen: "workspace:open",
    WorkspaceClose: "workspace:close",
    WorkspaceReadDocument: "workspace:readDocument",
    WorkspaceSaveDocument: "workspace:saveDocument",
    WorkspaceListDocuments: "workspace:listDocuments",
    WorkspaceDeleteDocument: "workspace:deleteDocument",
    WorkspaceExportHarness: "workspace:exportHarness",
    WorkspaceListWorkbenches: "workspace:listWorkbenches",
    WorkspaceApplyCommands: "workspace:applyCommands",
    WorkspaceExport: "workspace:export",
    WorkspaceImport: "workspace:import",

    BlobStat: "blob:stat",
    BlobDelete: "blob:delete",

    SessionCreate: "session:create",
    SessionOpen: "session:open",
    SessionClose: "session:close",
    SessionList: "session:list",
    SessionTree: "session:tree",
    SessionSave: "session:save",
    SessionMove: "session:move",
    SessionRename: "session:rename",
    SessionDelete: "session:delete",
    SessionCreateFolder: "session:createFolder",
    SessionRenameFolder: "session:renameFolder",
    SessionMoveFolder: "session:moveFolder",
    SessionDeleteFolder: "session:deleteFolder",
    SessionSaveRun: "session:saveRun",
    SessionSetDraftFolder: "session:setDraftFolder",

    RunStart: "run:start",
    RunPause: "run:pause",
    RunResume: "run:resume",
    RunCancel: "run:cancel",
    RunGet: "run:get",
    RunList: "run:list",
    RunResult: "run:result",
    RunResumeInterrupted: "run:resume-interrupted",

    ApprovalRespond: "approval:respond",
    UserInputRespond: "input:respond",
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

/** 单向消息通道（renderer → main）。 */
export const IpcSendChannel = {
    /** 渲染进程自检上报（Phase 0 的 smoke 标记）。 */
    ReportReady: "flowharness:ready",
} as const;

export type IpcSendChannel = (typeof IpcSendChannel)[keyof typeof IpcSendChannel];

/** 事件 topic（main → renderer，统一走 `fh:event`）。 */
export const IpcEventTopic = {
    Run: "run",
    Workspace: "workspace",
    Config: "config",
    Theme: "theme",
    Window: "window",
    Approval: "approval",
    Input: "input",
} as const;

export type IpcEventTopic = (typeof IpcEventTopic)[keyof typeof IpcEventTopic];

export const IPC_EVENT_CHANNEL = "fh:event";

export type IpcEventEnvelope<T = unknown> = {
    topic: IpcEventTopic;
    payload: T;
};

// ---- 已实现通道的 DTO ----

export type WorkspaceOpenRequest = { id: string };
export type WorkspaceCloseRequest = { id: string };
export type WorkspaceExportRequest = { id: string; targetPath: string };
export type WorkspaceImportRequest = { sourcePath: string };

export type WorkspaceReadDocumentRequest = {
    workspaceId: string;
    ref: DocumentRef;
};

export type WorkspaceSaveDocumentRequest = {
    workspaceId: string;
    ref: DocumentRef;
    /** 首次创建传 null；更新时传上次读到的 revision。 */
    baseRevision: string | null;
    document: unknown;
};

export type WorkspaceListDocumentsRequest = { workspaceId: string };
export type WorkspaceDeleteDocumentRequest = {
    workspaceId: string;
    ref: DocumentRef;
};

export type WorkspaceExportHarnessRequest = {
    text: string;
    defaultFileName: string;
};

export type WorkspaceListWorkbenchesRequest = { workspaceId: string };

export type BlobStatRequest = { workspaceId: string; hash: string };
export type BlobDeleteRequest = { workspaceId: string; hash: string };

export type SecretsHasRequest = { providerId: string };
export type SecretsSetRequest = { providerId: string; value: string };
export type SecretsDeleteRequest = { providerId: string };
export type ProvidersTestRequest = { providerId: string };

/** 已实现 invoke 通道的类型表；每接入一个通道就往这里加一行。 */
export type IpcInvokeContracts = {
    [IpcChannel.AppGetInfo]: { request: void; response: AppInfo };

    [IpcChannel.WindowMinimize]: { request: void; response: void };
    [IpcChannel.WindowToggleMaximize]: { request: void; response: WindowStatePayload };
    [IpcChannel.WindowClose]: { request: void; response: void };
    [IpcChannel.WindowIsMaximized]: { request: void; response: WindowStatePayload };

    [IpcChannel.ConfigGet]: { request: void; response: AppConfig };
    [IpcChannel.ConfigUpdate]: { request: AppConfigUpdate; response: AppConfig };
    [IpcChannel.ConfigReset]: { request: void; response: AppConfig };

    [IpcChannel.SecretsHas]: { request: SecretsHasRequest; response: { has: boolean } };
    [IpcChannel.SecretsSet]: { request: SecretsSetRequest; response: void };
    [IpcChannel.SecretsDelete]: { request: SecretsDeleteRequest; response: { deleted: boolean } };

    [IpcChannel.ProvidersList]: { request: void; response: ProviderStatus[] };
    [IpcChannel.ProvidersTest]: { request: ProvidersTestRequest; response: ProviderTestResult };

    [IpcChannel.WorkspaceList]: { request: void; response: WorkspaceSummary[] };
    [IpcChannel.WorkspaceCreate]: { request: WorkspaceCreateInput; response: WorkspaceSummary };
    [IpcChannel.WorkspaceOpen]: { request: WorkspaceOpenRequest; response: WorkspaceSummary };
    [IpcChannel.WorkspaceClose]: { request: WorkspaceCloseRequest; response: void };
    [IpcChannel.WorkspaceExport]: { request: WorkspaceExportRequest; response: { path: string } };
    [IpcChannel.WorkspaceImport]: { request: WorkspaceImportRequest; response: WorkspaceSummary };

    [IpcChannel.WorkspaceReadDocument]: {
        request: WorkspaceReadDocumentRequest;
        response: DocumentSnapshot | null;
    };
    [IpcChannel.WorkspaceSaveDocument]: {
        request: WorkspaceSaveDocumentRequest;
        response: DocumentSaveResult;
    };
    [IpcChannel.WorkspaceListDocuments]: {
        request: WorkspaceListDocumentsRequest;
        response: HarnessDocumentSummary[];
    };
    [IpcChannel.WorkspaceDeleteDocument]: {
        request: WorkspaceDeleteDocumentRequest;
        response: { deleted: boolean };
    };
    [IpcChannel.WorkspaceExportHarness]: {
        request: WorkspaceExportHarnessRequest;
        response: { path: string | null };
    };
    [IpcChannel.WorkspaceListWorkbenches]: {
        request: WorkspaceListWorkbenchesRequest;
        response: WorkbenchSummary[];
    };

    [IpcChannel.BlobStat]: { request: BlobStatRequest; response: BlobMeta | null };
    [IpcChannel.BlobDelete]: { request: BlobDeleteRequest; response: { deleted: boolean } };

    [IpcChannel.SessionCreate]: {
        request: SessionCreateRequest;
        response: SessionRecord;
    };
    [IpcChannel.SessionList]: {
        request: SessionListRequest;
        response: SessionSummary[];
    };
    [IpcChannel.SessionTree]: {
        request: SessionTreeRequest;
        response: SessionTree;
    };
    [IpcChannel.SessionOpen]: {
        request: SessionReadRequest;
        response: SessionRecord;
    };
    [IpcChannel.SessionClose]: {
        request: SessionCloseRequest;
        response: void;
    };
    [IpcChannel.SessionSave]: {
        request: SessionSaveRequest;
        response: SessionRecord;
    };
    [IpcChannel.SessionMove]: {
        request: SessionMoveRequest;
        response: SessionRecord;
    };
    [IpcChannel.SessionRename]: {
        request: SessionRenameRequest;
        response: SessionRecord;
    };
    [IpcChannel.SessionDelete]: {
        request: SessionDeleteRequest;
        response: { deleted: boolean };
    };
    [IpcChannel.SessionCreateFolder]: {
        request: SessionFolderCreateRequest;
        response: SessionFolder;
    };
    [IpcChannel.SessionRenameFolder]: {
        request: SessionFolderRenameRequest;
        response: SessionFolder;
    };
    [IpcChannel.SessionMoveFolder]: {
        request: SessionFolderMoveRequest;
        response: SessionFolder;
    };
    [IpcChannel.SessionDeleteFolder]: {
        request: SessionFolderDeleteRequest;
        response: { deleted: boolean };
    };
    [IpcChannel.SessionSaveRun]: {
        request: SessionSaveRunRequest;
        response: SessionRecord;
    };
    [IpcChannel.SessionSetDraftFolder]: {
        request: SessionSetDraftFolderRequest;
        response: SessionTree;
    };

    [IpcChannel.RunStart]: { request: RunStartRequest; response: RunSnapshot };
    [IpcChannel.RunPause]: { request: RunPauseRequest; response: RunSnapshot };
    [IpcChannel.RunResume]: { request: RunResumeRequest; response: RunSnapshot };
    [IpcChannel.RunCancel]: { request: RunCancelRequest; response: void };
    [IpcChannel.RunGet]: { request: RunGetRequest; response: RunSnapshot | null };
    [IpcChannel.RunList]: { request: RunListRequest; response: RunSnapshot[] };
    [IpcChannel.RunResult]: { request: RunResultRequest; response: unknown | null };
    [IpcChannel.RunResumeInterrupted]: {
        request: RunResumeInterruptedRequest;
        response: RunSnapshot;
    };

    [IpcChannel.ApprovalRespond]: {
        request: ApprovalResponseRequest;
        response: { accepted: boolean };
    };
    [IpcChannel.UserInputRespond]: {
        request: UserInputResponseRequest;
        response: { accepted: boolean };
    };
};

/** run 事件批量推送的 payload 类型（`fh:event` 的 `topic: "run"`）。 */
export type { RunEventBatch };
