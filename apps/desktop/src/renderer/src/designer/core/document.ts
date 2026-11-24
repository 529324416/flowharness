import { HARNESS_GRAPH_VERSION, type GraphDocument } from "wireclaw";
import type { DocumentRef } from "@flowharness/contracts";

/** M1 每工作区只有一张图；多图在 M4 引入。 */
export const MAIN_GRAPH_REF: DocumentRef = { kind: "harness", id: "main" };

/** 新建工作区时写入的最小可运行图：Constant → Output。 */
export const MAIN_GRAPH_TEMPLATE: GraphDocument = {
    version: HARNESS_GRAPH_VERSION,
    id: "main",
    title: "主工作流",
    nodes: [
        {
            id: "constant",
            type: "core.constant",
            typeVersion: 1,
            config: {
                value: { type: "text", text: "hello from flowharness" },
            },
            ui: { x: 96, y: 140 },
        },
        {
            id: "output",
            type: "core.output",
            typeVersion: 1,
            ui: { x: 456, y: 140 },
        },
    ],
    edges: [
        {
            from: { nodeId: "constant", port: "value" },
            to: { nodeId: "output", port: "text" },
        },
    ],
    ui: {
        viewport: { x: 24, y: 28, zoom: 1 },
    },
};

export function cloneMainGraphTemplate(): GraphDocument {
    return structuredClone(MAIN_GRAPH_TEMPLATE);
}

/** 以 `main` 模板为底创建另一份图文档；id 同时写入文件名与 graph.id。 */
export function createGraphTemplate(id: string, title?: string): GraphDocument {
    const graph = cloneMainGraphTemplate();
    graph.id = id;
    graph.title = title ?? (id === "main" ? "主工作流" : "未命名工作流");
    return graph;
}

/** 生成新的 Harness 文档 id；与文件名 / GraphDocument.id 共用。 */
export function createDocumentId(): string {
    return `graph_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * 轻量结构校验：
 * - 不调用 wireclaw 反序列化，避免未知节点类型被当成整图损坏；
 * - 只保证 adapter 需要的字段存在，语义问题留给 M1.3 的 validate。
 */
export function isGraphDocument(value: unknown): value is GraphDocument {
    if (!isRecord(value)) return false;
    if (value.version !== HARNESS_GRAPH_VERSION) return false;
    if (typeof value.id !== "string" || value.id.length === 0) return false;
    if (value.title !== undefined && typeof value.title !== "string") return false;
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return false;

    for (const node of value.nodes) {
        if (!isRecord(node)) return false;
        if (typeof node.id !== "string" || node.id.length === 0) return false;
        if (typeof node.type !== "string" || node.type.length === 0) return false;
        if (typeof node.typeVersion !== "number") return false;
    }

    for (const edge of value.edges) {
        if (!isRecord(edge)) return false;
        if (!isPortAddress(edge.from) || !isPortAddress(edge.to)) return false;
    }

    if (value.ui !== undefined && !isRecord(value.ui)) return false;

    return true;
}

export function parseGraphDocument(value: unknown): GraphDocument {
    if (!isGraphDocument(value)) {
        throw new Error("文件不是有效的 GraphDocument");
    }
    return value;
}

function isPortAddress(value: unknown): boolean {
    return (
        isRecord(value) &&
        typeof value.nodeId === "string" &&
        value.nodeId.length > 0 &&
        typeof value.port === "string" &&
        value.port.length > 0
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
