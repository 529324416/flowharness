import type { RunEventDto } from "@flowharness/contracts";
import type { GraphDocument } from "wireclaw";
import { edgeKeyFromPorts } from "../../canvas/core/edge-key";
import type { CanvasEdgeStatus, CanvasStatus } from "../../canvas/core/types";

/** 开始一次 run 前，把所有已知节点置为 idle。 */
export function initNodeStatuses(
    graph: GraphDocument,
): Record<string, CanvasStatus> {
    return Object.fromEntries(graph.nodes.map((node) => [node.id, "idle" as const]));
}

/** 开始一次 run 前，把所有边置为 idle。 */
export function initEdgeStatuses(
    graph: GraphDocument,
): Record<string, CanvasEdgeStatus> {
    return Object.fromEntries(
        graph.edges.map((edge) => [
            edgeKeyFromPorts(edge.from, edge.to),
            "idle" as const,
        ]),
    );
}

export type RunViewState = {
    nodeStatuses: Record<string, CanvasStatus>;
    edgeStatuses: Record<string, CanvasEdgeStatus>;
};

/** 一次 run 的初始画布投影。 */
export function createRunView(graph: GraphDocument): RunViewState {
    return {
        nodeStatuses: initNodeStatuses(graph),
        edgeStatuses: initEdgeStatuses(graph),
    };
}

/**
 * 把运行事件投影为节点状态。
 *
 * 纯函数：不依赖 React / IPC，方便单测。
 */
export function applyRunEvents(
    statuses: Readonly<Record<string, CanvasStatus>>,
    events: readonly RunEventDto[],
): Record<string, CanvasStatus> {
    return reduceNodeStatuses(statuses, events);
}

/**
 * 把运行事件投影为节点 + 边状态。
 *
 * 边的动画语义：
 * - `node:start`：上游数据到达，入边 active；
 * - `node:end`：节点落定，出边 active（数据流向下游）；
 * - `node:skipped`：入边回到 idle；
 * - `node:error`：所有相连边 error；
 * - `run:end`：active 边回到 idle，error 边保留为失败现场。
 */
export function applyRunEventsToView(
    graph: GraphDocument,
    state: RunViewState,
    events: readonly RunEventDto[],
): RunViewState {
    const nodeStatuses = reduceNodeStatuses(state.nodeStatuses, events);
    const { incoming, outgoing } = edgeIndexByNode(graph);
    let edgeStatuses: Record<string, CanvasEdgeStatus> | null = null;

    const setEdge = (
        edgeIds: readonly string[] | undefined,
        status: CanvasEdgeStatus,
    ): void => {
        if (edgeIds === undefined) return;
        for (const edgeId of edgeIds) {
            const current =
                edgeStatuses === null
                    ? state.edgeStatuses[edgeId]
                    : edgeStatuses[edgeId];
            if (current === status || current === undefined) continue;
            if (edgeStatuses === null) {
                edgeStatuses = { ...state.edgeStatuses };
            }
            edgeStatuses[edgeId] = status;
        }
    };

    for (const event of events) {
        switch (event.type) {
            case "node:start":
                setEdge(incoming.get(event.nodeId), "active");
                break;
            case "node:end":
                setEdge(incoming.get(event.nodeId), "idle");
                setEdge(outgoing.get(event.nodeId), "active");
                break;
            case "node:skipped":
                setEdge(incoming.get(event.nodeId), "idle");
                setEdge(outgoing.get(event.nodeId), "idle");
                break;
            case "node:error":
                setEdge(incoming.get(event.nodeId), "error");
                setEdge(outgoing.get(event.nodeId), "error");
                break;
            case "run:end":
                for (const [edgeId, status] of Object.entries(state.edgeStatuses)) {
                    if (status === "active") setEdge([edgeId], "idle");
                }
                break;
            default:
                break;
        }
    }

    const nextEdgeStatuses = edgeStatuses ?? state.edgeStatuses;
    if (
        nodeStatuses === state.nodeStatuses &&
        nextEdgeStatuses === state.edgeStatuses
    ) {
        return state;
    }
    return { nodeStatuses, edgeStatuses: nextEdgeStatuses };
}

function reduceNodeStatuses(
    statuses: Readonly<Record<string, CanvasStatus>>,
    events: readonly RunEventDto[],
): Record<string, CanvasStatus> {
    let next: Record<string, CanvasStatus> | null = null;

    const setStatus = (nodeId: string, status: CanvasStatus): void => {
        const current = next === null ? statuses[nodeId] : next[nodeId];
        if (current === status) return;
        if (next === null) next = { ...statuses };
        next[nodeId] = status;
    };

    for (const event of events) {
        switch (event.type) {
            case "node:start":
            case "node:stream":
                setStatus(event.nodeId, "running");
                break;
            case "node:end":
                setStatus(event.nodeId, "completed");
                break;
            case "node:skipped":
                setStatus(event.nodeId, "skipped");
                break;
            case "node:error":
                setStatus(event.nodeId, "failed");
                break;
            case "run:paused":
                for (const nodeId of Object.keys(statuses)) {
                    const nodeStatus =
                        next === null ? statuses[nodeId] : next[nodeId];
                    if (nodeStatus === "running") setStatus(nodeId, "paused");
                }
                break;
            case "run:resumed":
                for (const nodeId of Object.keys(statuses)) {
                    const nodeStatus =
                        next === null ? statuses[nodeId] : next[nodeId];
                    if (nodeStatus === "paused") setStatus(nodeId, "running");
                }
                break;
            case "run:end":
                for (const nodeId of Object.keys(statuses)) {
                    const nodeStatus =
                        next === null ? statuses[nodeId] : next[nodeId];
                    if (nodeStatus !== "running" && nodeStatus !== "paused") continue;
                    setStatus(
                        nodeId,
                        event.status === "failed" ? "failed" : "idle",
                    );
                }
                break;
            default:
                break;
        }
    }

    return next ?? (statuses as Record<string, CanvasStatus>);
}

type EdgeIndex = {
    incoming: ReadonlyMap<string, readonly string[]>;
    outgoing: ReadonlyMap<string, readonly string[]>;
};

function edgeIndexByNode(graph: GraphDocument): EdgeIndex {
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();

    for (const edge of graph.edges) {
        const id = edgeKeyFromPorts(edge.from, edge.to);
        push(outgoing, edge.from.nodeId, id);
        push(incoming, edge.to.nodeId, id);
    }

    return { incoming, outgoing };
}

function push(
    index: Map<string, string[]>,
    nodeId: string,
    edgeId: string,
): void {
    const bucket = index.get(nodeId);
    if (bucket === undefined) {
        index.set(nodeId, [edgeId]);
    } else {
        bucket.push(edgeId);
    }
}
