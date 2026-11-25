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
 * 会话记录。M6.2 先持久化生命周期与 opaque history；
 * 具体消息序列化由后续接入 wireclaw SessionHistory 时填充。
 */
export type SessionRecord = SessionSummary & {
    schemaVersion: 1;
    /** JSON-safe 的历史快照；当前允许为空数组。 */
    history: unknown;
    /** 引用到的 Blob contentHash。 */
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
