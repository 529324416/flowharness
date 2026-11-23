import type { RunStatus } from "@flowharness/contracts";
import type { StatusTone } from "../ui";

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
    idle: "未运行",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    interrupted: "已中断",
};

export const RUN_STATUS_TONE: Record<RunStatus, StatusTone> = {
    idle: "idle",
    running: "running",
    paused: "paused",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
    interrupted: "interrupted",
};
