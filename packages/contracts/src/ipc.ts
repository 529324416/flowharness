import type { ResolvedTheme, ThemeMode } from "./domain";

/**
 * invoke 通道（renderer → main，请求/响应）。
 *
 * 这里列的是**契约全集**；未实现的通道在对应阶段接入，preload 只暴露已实现的白名单。
 */
export const IpcChannel = {
    AppGetInfo: "app:getInfo",
    ThemeSet: "theme:set",

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
    Approval: "approval",
    Input: "input",
} as const;

export type IpcEventTopic = (typeof IpcEventTopic)[keyof typeof IpcEventTopic];

export const IPC_EVENT_CHANNEL = "fh:event";

export type IpcEventEnvelope<T = unknown> = {
    topic: IpcEventTopic;
    payload: T;
};

// ---- 已实现的通道 DTO ----

export type ThemeSetRequest = { theme: ThemeMode };
export type ThemeSetResponse = { theme: ResolvedTheme };

/** 已实现 invoke 通道的类型表；每接入一个通道就往这里加一行。 */
export type IpcInvokeContracts = {
    [IpcChannel.ThemeSet]: {
        request: ThemeSetRequest;
        response: ThemeSetResponse;
    };
};
