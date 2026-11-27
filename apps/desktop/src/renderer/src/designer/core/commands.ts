import type { GraphDocument, JsonValue } from "wireclaw";
import type { CanvasCommand, CanvasPortRef, Vec2 } from "../../canvas/core/types";
import { edgeKeyFromPorts } from "../../canvas/core/edge-key";
import { withNodeCollapsed, withNodePosition, withViewport } from "./layout";

/**
 * 把画布命令应用到 GraphDocument。
 *
 * 只改命令涉及的字段；metadata / parameters / events / toolSet / requires /
 * inputs 等未知或未触及字段原样保留。无变化时返回原对象，便于 React 跳过更新。
 */
export function applyCanvasCommand(
    graph: GraphDocument,
    command: CanvasCommand,
): GraphDocument {
    switch (command.type) {
        case "moveNodes":
            return moveNodes(graph, command.positions);
        case "removeNodes":
            return removeNodes(graph, command.nodeIds);
        case "connect":
            return connect(graph, command.from, command.to);
        case "disconnect":
            return disconnect(graph, command.from, command.to);
        case "setNodeCollapsed":
            return setNodeCollapsed(graph, command.nodeId, command.collapsed);
        case "setViewport":
            return { ...graph, ui: withViewport(graph.ui, command.viewport) };
    }
}

export type NewNode = {
    id: string;
    type: string;
    typeVersion: number;
    position: Vec2;
    config?: unknown;
};

/** 设计器动作：新增节点（不经过 CanvasCommand，因为 Canvas 不感知节点类型）。 */
export function addNode(graph: GraphDocument, node: NewNode): GraphDocument {
    if (graph.nodes.some((candidate) => candidate.id === node.id)) return graph;

    return {
        ...graph,
        nodes: [
            ...graph.nodes,
            {
                id: node.id,
                type: node.type,
                typeVersion: node.typeVersion,
                ...(node.config === undefined
                    ? {}
                    : { config: node.config as JsonValue }),
                ui: { x: node.position.x, y: node.position.y },
            },
        ],
    };
}

/** 新增节点的级联位置；按 2 列网格错开，避免和已有节点重叠。 */
export function nextNodePosition(graph: GraphDocument): Vec2 {
    const index = graph.nodes.length;
    return {
        x: 120 + (index % 2) * 300,
        y: 160 + Math.floor(index / 2) * 180,
    };
}

export function createNodeId(graph: GraphDocument): string {
    for (;;) {
        const id = `node_${crypto.randomUUID().slice(0, 8)}`;
        if (!graph.nodes.some((node) => node.id === id)) return id;
    }
}

export type NodeClipboard = {
    nodes: GraphDocument["nodes"];
    edges: GraphDocument["edges"];
};

/** 复制选中节点与其内部连线；没有节点时返回 null。 */
export function copyNodes(
    graph: GraphDocument,
    nodeIds: readonly string[],
): NodeClipboard | null {
    const ids = new Set(nodeIds);
    const nodes = graph.nodes
        .filter((node) => ids.has(node.id))
        .map((node) => structuredClone(node));
    if (nodes.length === 0) return null;

    const edges = graph.edges
        .filter((edge) => ids.has(edge.from.nodeId) && ids.has(edge.to.nodeId))
        .map((edge) => structuredClone(edge));

    return { nodes, edges };
}

export type PasteNodesOptions = {
    offset?: Vec2;
    /** 测试注入；缺省使用随机 id。 */
    idFactory?: () => string;
};

/** 粘贴剪贴板节点：重映射 id、偏移位置，并保留两端都在剪贴板内的连线。 */
export function pasteNodes(
    graph: GraphDocument,
    clipboard: NodeClipboard,
    options: PasteNodesOptions = {},
): { graph: GraphDocument; nodeIds: string[] } {
    if (clipboard.nodes.length === 0) {
        return { graph, nodeIds: [] };
    }

    const offset = options.offset ?? { x: 48, y: 48 };
    const used = new Set(graph.nodes.map((node) => node.id));
    const createId = (): string => {
        for (;;) {
            const id = options.idFactory?.() ?? createNodeId(graph);
            if (!used.has(id)) {
                used.add(id);
                return id;
            }
        }
    };

    const idMap = new Map<string, string>();
    const nodeIds: string[] = [];
    const nodes = clipboard.nodes.map((node) => {
        const id = createId();
        idMap.set(node.id, id);
        nodeIds.push(id);

        const ui = isRecord(node.ui) ? node.ui : {};
        const x = typeof ui.x === "number" ? ui.x : 0;
        const y = typeof ui.y === "number" ? ui.y : 0;

        return {
            ...structuredClone(node),
            id,
            ui: {
                ...ui,
                x: x + offset.x,
                y: y + offset.y,
            },
        };
    });

    const edges = clipboard.edges.map((edge) => ({
        from: {
            nodeId: idMap.get(edge.from.nodeId) ?? edge.from.nodeId,
            port: edge.from.port,
        },
        to: {
            nodeId: idMap.get(edge.to.nodeId) ?? edge.to.nodeId,
            port: edge.to.port,
        },
    }));

    return {
        graph: {
            ...graph,
            nodes: [...graph.nodes, ...nodes],
            edges: [...graph.edges, ...edges],
        },
        nodeIds,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 检查器动作：替换节点 config，其他字段保持不变。 */
export function updateNodeConfig(
    graph: GraphDocument,
    nodeId: string,
    config: unknown,
): GraphDocument {
    const index = graph.nodes.findIndex((node) => node.id === nodeId);
    if (index < 0) return graph;

    const nodes = [...graph.nodes];
    nodes[index] = {
        ...nodes[index]!,
        config: config as JsonValue,
    };

    return { ...graph, nodes };
}

function moveNodes(
    graph: GraphDocument,
    positions: readonly { nodeId: string; position: { x: number; y: number } }[],
): GraphDocument {
    if (positions.length === 0) return graph;

    const byId = new Map(positions.map((entry) => [entry.nodeId, entry.position]));
    let changed = false;
    const nodes = graph.nodes.map((node) => {
        const position = byId.get(node.id);
        if (position === undefined) return node;
        changed = true;
        return withNodePosition(node, position);
    });

    return changed ? { ...graph, nodes } : graph;
}

/** 折叠 / 展开单个节点；状态写入 `node.ui.collapsed`，不触及其他节点。 */
function setNodeCollapsed(
    graph: GraphDocument,
    nodeId: string,
    collapsed: boolean,
): GraphDocument {
    let changed = false;
    const nodes = graph.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        if ((node.ui?.collapsed === true) === collapsed) return node;
        changed = true;
        return withNodeCollapsed(node, collapsed);
    });

    return changed ? { ...graph, nodes } : graph;
}

function removeNodes(graph: GraphDocument, nodeIds: readonly string[]): GraphDocument {
    const removed = new Set(nodeIds);
    if (removed.size === 0) return graph;

    return {
        ...graph,
        nodes: graph.nodes.filter((node) => !removed.has(node.id)),
        edges: graph.edges.filter(
            (edge) => !removed.has(edge.from.nodeId) && !removed.has(edge.to.nodeId),
        ),
    };
}

function connect(
    graph: GraphDocument,
    from: CanvasPortRef,
    to: CanvasPortRef,
): GraphDocument {
    if (!hasNode(graph, from.nodeId) || !hasNode(graph, to.nodeId)) return graph;

    const key = edgeKeyFromPorts(from, to);
    if (graph.edges.some((edge) => edgeKeyFromPorts(edge.from, edge.to) === key)) {
        return graph;
    }

    return {
        ...graph,
        edges: [
            ...graph.edges,
            {
                from: { nodeId: from.nodeId, port: from.port },
                to: { nodeId: to.nodeId, port: to.port },
            },
        ],
    };
}

function disconnect(
    graph: GraphDocument,
    from: CanvasPortRef,
    to: CanvasPortRef,
): GraphDocument {
    const key = edgeKeyFromPorts(from, to);
    const edges = graph.edges.filter(
        (edge) => edgeKeyFromPorts(edge.from, edge.to) !== key,
    );

    return edges.length === graph.edges.length ? graph : { ...graph, edges };
}

function hasNode(graph: GraphDocument, nodeId: string): boolean {
    return graph.nodes.some((node) => node.id === nodeId);
}
