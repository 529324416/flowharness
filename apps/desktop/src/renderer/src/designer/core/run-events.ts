import type { RunEventDto } from "@flowharness/contracts";
import type { GraphDocument } from "wireclaw";
import type { CanvasStatus } from "../../canvas/core/types";

/** 开始一次 run 前，把所有已知节点置为 idle。 */
export function initNodeStatuses(
    graph: GraphDocument,
): Record<string, CanvasStatus> {
    return Object.fromEntries(graph.nodes.map((node) => [node.id, "idle" as const]));
}

/**
 * 把运行事件投影为节点状态。
 *
 * 纯函数：不依赖 React / IPC，方便单测；边状态与动画留到 M3。
 */
export function applyRunEvents(
    statuses: Readonly<Record<string, CanvasStatus>>,
    events: readonly RunEventDto[],
): Record<string, CanvasStatus> {
    const next: Record<string, CanvasStatus> = { ...statuses };

    for (const event of events) {
        switch (event.type) {
            case "node:start":
                next[event.nodeId] = "running";
                break;
            case "node:end":
                next[event.nodeId] = "completed";
                break;
            case "node:skipped":
                next[event.nodeId] = "skipped";
                break;
            case "node:error":
                next[event.nodeId] = "failed";
                break;
            case "run:paused":
                for (const nodeId of Object.keys(next)) {
                    if (next[nodeId] === "running") next[nodeId] = "paused";
                }
                break;
            case "run:resumed":
                for (const nodeId of Object.keys(next)) {
                    if (next[nodeId] === "paused") next[nodeId] = "running";
                }
                break;
            case "run:end":
                for (const nodeId of Object.keys(next)) {
                    if (next[nodeId] !== "running") continue;
                    next[nodeId] = event.status === "failed" ? "failed" : "idle";
                }
                break;
            default:
                break;
        }
    }

    return next;
}
