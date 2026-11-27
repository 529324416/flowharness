import type { RunEventDto } from "@flowharness/contracts";
import type { GraphDocument } from "wireclaw";
import { edgeKeyFromPorts } from "../../canvas/core/edge-key";
import type {
    CanvasEdgeStatus,
    CanvasRunMetrics,
    CanvasStatus,
} from "../../canvas/core/types";

/** benchmark 文本区保留的最大字符数；HUD 只用于提示「正在运行」。 */
const METRICS_TAIL_LIMIT = 240;

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
    /** 运行中节点的 token / 耗时；空闲节点没有条目。 */
    nodeMetrics: Record<string, CanvasRunMetrics>;
};

/** 一次 run 的初始画布投影。 */
export function createRunView(graph: GraphDocument): RunViewState {
    return {
        nodeStatuses: initNodeStatuses(graph),
        edgeStatuses: initEdgeStatuses(graph),
        nodeMetrics: {},
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
 * 把运行事件投影为节点 / 边状态与运行指标。
 *
 * 边的动画语义（2026-11-28 修订）：
 * - **只有数据正在向外输出时才有动画**：`node:stream` 点亮该节点的出边，
 *   `node:end` 立即熄灭；值输出在结束瞬间完成，因此不产生持续动画；
 * - `node:start` 只清理入边（上游数据已经送达，不应继续流动）；
 * - `node:skipped`：入边 / 出边回到 idle；
 * - `node:error`：所有相连边 error；
 * - `run:end`：active 边回到 idle、清空指标，error 边保留失败现场。
 */
export function applyRunEventsToView(
    graph: GraphDocument,
    state: RunViewState,
    events: readonly RunEventDto[],
): RunViewState {
    const nodeStatuses = reduceNodeStatuses(state.nodeStatuses, events);
    const nodeMetrics = reduceNodeMetrics(state.nodeMetrics, events);
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
                // 上游数据在节点开始前已经送达，入边不再保留流动动画。
                setEdge(incoming.get(event.nodeId), "idle");
                break;
            case "node:stream":
                // 只有真正产出内容时才让出边流动。
                setEdge(outgoing.get(event.nodeId), "active");
                break;
            case "node:end":
                setEdge(incoming.get(event.nodeId), "idle");
                setEdge(outgoing.get(event.nodeId), "idle");
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
        nextEdgeStatuses === state.edgeStatuses &&
        nodeMetrics === state.nodeMetrics
    ) {
        return state;
    }
    return { nodeStatuses, edgeStatuses: nextEdgeStatuses, nodeMetrics };
}

/**
 * 运行指标投影：`node:start` 重置计时，`node:stream` 累加 token 并保留尾部文本。
 *
 * 与节点状态不同，stream 事件必然改变指标，因此返回新对象；HUD 依赖这次更新。
 */
function reduceNodeMetrics(
    metrics: Readonly<Record<string, CanvasRunMetrics>>,
    events: readonly RunEventDto[],
): Record<string, CanvasRunMetrics> {
    let next: Record<string, CanvasRunMetrics> | null = null;

    const currentOf = (nodeId: string): CanvasRunMetrics | undefined =>
        next === null ? metrics[nodeId] : next[nodeId];

    const setMetrics = (nodeId: string, value: CanvasRunMetrics): void => {
        if (next === null) next = { ...metrics };
        next[nodeId] = value;
    };

    for (const event of events) {
        switch (event.type) {
            case "node:start":
                setMetrics(event.nodeId, {
                    startedAt: event.at,
                    tokens: 0,
                    tail: "",
                });
                break;
            case "node:stream": {
                const base = currentOf(event.nodeId) ?? {
                    startedAt: event.at,
                    tokens: 0,
                    tail: "",
                };
                setMetrics(event.nodeId, {
                    startedAt: base.startedAt,
                    tokens: base.tokens + 1,
                    tail: (base.tail + streamTextOf(event.chunk)).slice(
                        -METRICS_TAIL_LIMIT,
                    ),
                });
                break;
            }
            case "run:end": {
                const currentMetrics = next ?? metrics;
                if (Object.keys(currentMetrics).length > 0) next = {};
                break;
            }
            default:
                break;
        }
    }

    return next ?? (metrics as Record<string, CanvasRunMetrics>);
}

/**
 * 从 stream chunk（wireclaw `HarnessValue`）提取可展示文本。
 *
 * text 值取 `text` 字段；其他值退化为紧凑 JSON；无法识别时返回空串，
 * 只影响 HUD 的尾文本，不影响 token 计数。
 */
function streamTextOf(chunk: unknown): string {
    if (typeof chunk === "string") return chunk;
    if (typeof chunk !== "object" || chunk === null) return "";

    const record = chunk as { text?: unknown; value?: unknown };
    if (typeof record.text === "string") return record.text;
    if (record.value === undefined || record.value === null) return "";

    try {
        return JSON.stringify(record.value);
    } catch {
        return "";
    }
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
