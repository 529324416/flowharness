import type { RunStatus } from "./domain";

/** run 的对外快照（IPC 与持久化共用的稳定结构）。 */
export type RunSnapshot = {
    runId: string;
    workspaceId?: string;
    workbenchId?: string;
    graphId: string;
    status: RunStatus;
    startedAt: number;
    endedAt?: number;
    /** 归一化后的错误消息；原始异常只留在 main 日志。 */
    error?: string;
};

/**
 * wireclaw `GraphEvent` 的传输投影。
 *
 * 不直接复用 wireclaw 类型：IPC 边界只暴露稳定字段，错误对象降级为消息，
 * 值一律按 unknown 传输（renderer 侧按需窄化）。
 */
export type RunEventDto =
    | { type: "run:start"; runId: string; graphId: string; at: number }
    | { type: "node:start"; runId: string; nodeId: string; at: number }
    | {
          type: "node:stream";
          runId: string;
          nodeId: string;
          port: string;
          chunk: unknown;
          at: number;
      }
    | { type: "node:end"; runId: string; nodeId: string; outputs: unknown; at: number }
    | { type: "node:skipped"; runId: string; nodeId: string; at: number }
    | { type: "node:error"; runId: string; nodeId: string; message: string; at: number }
    | {
          type: "custom";
          runId: string;
          nodeId: string;
          name: string;
          payload: unknown;
          seq: number;
          at: number;
      }
    | { type: "run:paused"; runId: string; at: number }
    | { type: "run:resumed"; runId: string; at: number }
    | { type: "run:end"; runId: string; status: RunStatus; outputs: unknown; at: number };

/** main → renderer 的批量事件（节流后一次发送）。 */
export type RunEventBatch = {
    runId: string;
    snapshot: RunSnapshot;
    events: RunEventDto[];
};

export type RunStartRequest = {
    /** 缺省时用于无工作区的自检运行（不落盘）。 */
    workspaceId?: string;
    workbenchId?: string;
    /** wireclaw `GraphDocument` 纯 JSON；main 侧反序列化并校验。 */
    graph: unknown;
    input?: unknown;
    parameters?: Readonly<Record<string, unknown>>;
    maxConcurrency?: number;
};

export type RunPauseRequest = { runId: string };
export type RunResumeRequest = { runId: string };
export type RunCancelRequest = { runId: string };
export type RunGetRequest = { runId: string };
export type RunListRequest = { workspaceId?: string };

// ---- 审批 / 用户输入 ----

export type ApprovalRequestPayload = {
    requestId: string;
    runId: string;
    nodeId: string;
    toolName: string;
    arguments: unknown;
    expiresAt: number;
};

export type ApprovalResponseRequest = {
    requestId: string;
    decision: "approve" | "deny";
};

export type UserInputQuestionOptionDto = {
    id: string;
    label: string;
    description?: string;
};

export type UserInputQuestionDto = {
    id: string;
    header?: string;
    question: string;
    options: UserInputQuestionOptionDto[];
    multiSelect?: boolean;
    allowOther?: boolean;
};

export type UserInputRequestPayload = {
    requestId: string;
    runId: string;
    nodeId: string;
    title?: string;
    questions: UserInputQuestionDto[];
    expiresAt: number;
};

export type UserInputAnswerDto = {
    questionId: string;
    selected: string[];
    other?: string;
};

export type UserInputResponseRequest = {
    requestId: string;
    answers: UserInputAnswerDto[];
    cancelled?: boolean;
};
