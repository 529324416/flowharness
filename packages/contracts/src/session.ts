export type SessionStatus = "idle" | "running" | "completed" | "failed";

/** 会话列表摘要；不携带完整 history。 */
export type SessionSummary = {
    id: string;
    title: string;
    status: SessionStatus;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
};

/**
 * 会话记录。
 *
 * `history` 存放 wireclaw `SessionData`（`version / id / messages / isArchived`）；
 * FH 只负责持久化与回放，不复制 wireclaw 的消息模型。M6.2 的空数组记录在读取时
 * 迁移为空会话，`messageCount` 与 `attachments` 由主进程按历史派生。
 */
export type SessionRecord = SessionSummary & {
    schemaVersion: 1;
    /** JSON-safe 的历史快照：wireclaw `SessionData`。 */
    history: unknown;
    /** 引用到的 Blob contentHash（由历史中的附件引用去重派生）。 */
    attachments: string[];
};

export type SessionCreateRequest = {
    workspaceId: string;
    title?: string;
};

export type SessionListRequest = { workspaceId: string };
export type SessionReadRequest = { workspaceId: string; sessionId: string };
export type SessionSaveRequest = {
    workspaceId: string;
    session: SessionRecord;
};
export type SessionCloseRequest = { workspaceId: string; sessionId: string };
