import type { SessionSummary as StoredSessionSummary } from "@flowharness/contracts";
import type { StatusTone } from "../ui";

export type SessionStatus = "idle" | "running" | "completed" | "failed";

export type SessionSummary = {
    id: string;
    title: string;
    subtitle: string;
    status: SessionStatus;
    updatedAt: string;
    /** 临时运行草稿；只显示在历史面板，不进入会话树。 */
    temporary?: boolean;
};

export const SESSION_TONE: Record<SessionStatus, StatusTone> = {
    idle: "idle",
    running: "running",
    completed: "completed",
    failed: "failed",
};

/** 把 main 的会话摘要映射为侧栏展示模型。 */
export function fromStoredSession(
    session: StoredSessionSummary,
): SessionSummary {
    return {
        id: session.id,
        title: session.title,
        subtitle:
            session.kind === "run"
                ? `${session.entryCount} 条结果`
                : session.messageCount === 0
                  ? "空会话 · 0 条消息"
                  : `${session.messageCount} 条消息`,
        status: session.status,
        updatedAt: formatRelativeTime(session.updatedAt),
        ...(session.temporary === true ? { temporary: true } : {}),
    };
}

function formatRelativeTime(iso: string): string {
    const timestamp = Date.parse(iso);
    if (Number.isNaN(timestamp)) return "";

    const diffMs = Date.now() - timestamp;
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
}
