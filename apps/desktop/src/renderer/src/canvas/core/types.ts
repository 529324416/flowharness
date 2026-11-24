import type { Edge, Node } from "@xyflow/react";

export type CanvasStatus = "idle" | "running" | "paused" | "completed" | "failed" | "skipped";

export type CanvasNodeData = {
    kind: string;
    title: string;
    summary?: string;
    status: CanvasStatus;
    meta?: string;
    inputs?: number;
    outputs?: number;
};

/** 真实画布节点；type 由 node renderer registry 决定。 */
export type CanvasNode = Node<CanvasNodeData, string>;

export type CanvasEdgeStatus = "idle" | "active" | "error";

export type CanvasEdgeData = {
    status: CanvasEdgeStatus;
};

export type CanvasEdge = Edge<CanvasEdgeData>;
