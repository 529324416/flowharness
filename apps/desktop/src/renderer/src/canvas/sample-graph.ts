import type { CanvasEdge, CanvasNode } from "./core/types";

/** Step 3 的示例图；Phase 3.5 由 GraphDocument 转换而来。 */
export const SAMPLE_NODES: CanvasNode[] = [
    {
        id: "input",
        type: "core.input",
        position: { x: 24, y: 72 },
        data: {
            kind: "core.input",
            title: "Input",
            status: "completed",
            summary: "text · attachments",
            meta: "input",
            inputs: 0,
            outputs: 2,
        },
    },
    {
        id: "model",
        type: "core.model-call",
        position: { x: 286, y: 48 },
        selected: true,
        data: {
            kind: "core.model-call",
            title: "Model Call",
            status: "running",
            summary: "deepseek-chat · stream",
            meta: "model",
            inputs: 1,
            outputs: 1,
        },
    },
    {
        id: "output",
        type: "core.output",
        position: { x: 548, y: 132 },
        data: {
            kind: "core.output",
            title: "Output",
            status: "failed",
            summary: "text",
            meta: "output",
            inputs: 1,
            outputs: 0,
        },
    },
    {
        id: "branch",
        type: "core.branch",
        position: { x: 286, y: 246 },
        data: {
            kind: "core.branch",
            title: "Branch",
            status: "skipped",
            summary: "has text?",
            meta: "branch",
            inputs: 1,
            outputs: 1,
        },
    },
    {
        id: "log",
        type: "core.log-sink",
        position: { x: 548, y: 310 },
        data: {
            kind: "core.log-sink",
            title: "Log Sink",
            status: "idle",
            summary: "debug",
            meta: "log",
            inputs: 1,
            outputs: 0,
        },
    },
];

export const SAMPLE_EDGES: CanvasEdge[] = [
    {
        id: "input-model",
        source: "input",
        target: "model",
        sourceHandle: "out",
        targetHandle: "in",
        type: "sciFi",
        data: { status: "active" },
    },
    {
        id: "model-output",
        source: "model",
        target: "output",
        sourceHandle: "out",
        targetHandle: "in",
        type: "sciFi",
        data: { status: "error" },
    },
    {
        id: "input-branch",
        source: "input",
        target: "branch",
        sourceHandle: "out",
        targetHandle: "in",
        type: "sciFi",
        data: { status: "idle" },
    },
    {
        id: "branch-log",
        source: "branch",
        target: "log",
        sourceHandle: "out",
        targetHandle: "in",
        type: "sciFi",
        data: { status: "idle" },
    },
];

export const SAMPLE_NODE_KINDS = SAMPLE_NODES.map((node) => node.type).filter(
    (type): type is string => typeof type === "string",
);

export function createSampleGraph(): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
    return {
        nodes: SAMPLE_NODES.map((node) => ({
            ...node,
            position: { ...node.position },
            data: { ...node.data },
        })),
        edges: SAMPLE_EDGES.map((edge) => ({
            ...edge,
            data: edge.data ? { ...edge.data } : undefined,
        })),
    };
}
