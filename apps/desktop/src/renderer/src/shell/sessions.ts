import type { StatusTone } from "../ui";

export type SessionStatus = "idle" | "running" | "completed" | "failed";

export type SessionSummary = {
    id: string;
    title: string;
    subtitle: string;
    status: SessionStatus;
    updatedAt: string;
};

export const SESSION_TONE: Record<SessionStatus, StatusTone> = {
    idle: "idle",
    running: "running",
    completed: "completed",
    failed: "failed",
};

/**
 * Shell v2 的占位会话数据。
 * 真实 Session 在 Phase 5 接入；这里只用于验证布局与状态表达。
 */
export const INITIAL_SESSIONS: SessionSummary[] = [
    {
        id: "session-triage",
        title: "客服工单分诊",
        subtitle: "Model Call · 12 个节点",
        status: "running",
        updatedAt: "刚刚",
    },
    {
        id: "session-research",
        title: "研究资料摘要",
        subtitle: "Branch · 8 个节点",
        status: "completed",
        updatedAt: "12 分钟前",
    },
    {
        id: "session-review",
        title: "代码审查流水线",
        subtitle: "Log Sink · 6 个节点",
        status: "failed",
        updatedAt: "昨天",
    },
];

export function createSession(index: number): SessionSummary {
    return {
        id: `session-${Date.now().toString(36)}-${index}`,
        title: `未命名会话 ${index}`,
        subtitle: "空画布 · 0 个节点",
        status: "idle",
        updatedAt: "刚刚",
    };
}
