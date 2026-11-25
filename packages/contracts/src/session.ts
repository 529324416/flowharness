export type SessionStatus = "idle" | "running" | "completed" | "failed";

/** 会话类型：conversation 走 SessionData，run 走 wireclaw RunResult。 */
export type SessionKind = "conversation" | "run";

/** 会话列表摘要；不携带完整 history。 */
export type SessionSummary = {
    id: string;
    title: string;
    kind: SessionKind;
    status: SessionStatus;
    createdAt: string;
    updatedAt: string;
    /** 会话所在文件夹；根目录为 null。 */
    folderId: string | null;
    /** conversation 的消息数。 */
    messageCount: number;
    /** run 的 RunResult entry 数。 */
    entryCount: number;
};

/**
 * 会话记录。
 *
 * `history` 存放 wireclaw `SessionData`（conversation）或 `RunResult`（run）；
 * FH 只负责持久化与回放，不复制 wireclaw 的消息 / 运行结果模型。
 */
export type SessionRecord = SessionSummary & {
    schemaVersion: 2;
    /** JSON-safe 的历史快照：wireclaw `SessionData` 或 `RunResult`。 */
    history: unknown;
    /** 引用到的 Blob contentHash（由历史中的附件引用去重派生）。 */
    attachments: string[];
};

/** 会话文件夹；父级由目录树表达，不写进文件。 */
export type SessionFolder = {
    schemaVersion: 1;
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
};

/** 左栏 Session 树的节点。 */
export type SessionTreeNode =
    | { type: "folder"; folder: SessionFolder; children: SessionTreeNode[] }
    | { type: "session"; session: SessionSummary };

/** 一次读取的完整 Session 树 + 当前草稿目录。 */
export type SessionTree = {
    nodes: SessionTreeNode[];
    draftFolderId: string | null;
};

export type SessionCreateRequest = {
    workspaceId: string;
    title?: string;
    folderId?: string | null;
};

export type SessionListRequest = { workspaceId: string };
export type SessionTreeRequest = { workspaceId: string };
export type SessionReadRequest = { workspaceId: string; sessionId: string };
export type SessionSaveRequest = {
    workspaceId: string;
    session: SessionRecord;
};
export type SessionCloseRequest = { workspaceId: string; sessionId: string };
export type SessionMoveRequest = {
    workspaceId: string;
    sessionId: string;
    folderId: string | null;
};
export type SessionRenameRequest = {
    workspaceId: string;
    sessionId: string;
    title: string;
};
export type SessionDeleteRequest = {
    workspaceId: string;
    sessionId: string;
};

export type SessionFolderCreateRequest = {
    workspaceId: string;
    title: string;
    parentFolderId?: string | null;
};
export type SessionFolderRenameRequest = {
    workspaceId: string;
    folderId: string;
    title: string;
};
export type SessionFolderMoveRequest = {
    workspaceId: string;
    folderId: string;
    targetFolderId: string | null;
};
export type SessionFolderDeleteRequest = {
    workspaceId: string;
    folderId: string;
};

/**
 * 把一次已持久化的 run 结果保存为 run 会话。
 *
 * `folderId` 省略时写入工作区草稿目录；显式 `null` 表示根目录。
 */
export type SessionSaveRunRequest = {
    workspaceId: string;
    runId: string;
    title?: string;
    folderId?: string | null;
};

/** 设置工作区草稿目录；返回新的会话树。 */
export type SessionSetDraftFolderRequest = {
    workspaceId: string;
    folderId: string;
};

/**
 * 把一次运行中的 Agent / ModelCall 消息追加到 conversation 会话。
 *
 * 与 run session 分离：run session 保存 `RunResult`，conversation 只追加消息。
 */
export type SessionAppendRunRequest = {
    workspaceId: string;
    runId: string;
    /** 目标 conversation 会话；必须是 `kind: "conversation"`。 */
    sessionId: string;
};
