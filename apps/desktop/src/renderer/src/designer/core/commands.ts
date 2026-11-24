import type { GraphDocument, JsonValue } from "wireclaw";
import type { CanvasCommand, CanvasPortRef, Vec2 } from "../../canvas/core/types";
import { edgeKeyFromPorts } from "../../canvas/core/edge-key";
import { withNodePosition, withViewport } from "./layout";

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
