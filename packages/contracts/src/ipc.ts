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
import type {
    ApprovalResponseRequest,
    RunCancelRequest,
    RunEventBatch,
    RunGetRequest,
    RunListRequest,
    RunPauseRequest,
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

    RunStart: "run:start",
    RunPause: "run:pause",
    RunResume: "run:resume",
    RunCancel: "run:cancel",
    RunGet: "run:get",
    RunList: "run:list",

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

    [IpcChannel.RunStart]: { request: RunStartRequest; response: RunSnapshot };
    [IpcChannel.RunPause]: { request: RunPauseRequest; response: RunSnapshot };
    [IpcChannel.RunResume]: { request: RunResumeRequest; response: RunSnapshot };
    [IpcChannel.RunCancel]: { request: RunCancelRequest; response: void };
    [IpcChannel.RunGet]: { request: RunGetRequest; response: RunSnapshot | null };
    [IpcChannel.RunList]: { request: RunListRequest; response: RunSnapshot[] };

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
