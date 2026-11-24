import type { CanvasEdge, CanvasNode } from "./types";
import { edgeKey } from "./edge-key";

/** 添加边；同一对端口已存在时保持原数组（幂等）。 */
export function addEdgeUnique(edges: readonly CanvasEdge[], edge: CanvasEdge): CanvasEdge[] {
    const key = edgeKey(edge);
    if (edges.some((current) => edgeKey(current) === key)) {
        return edges as CanvasEdge[];
    }
    return [...edges, edge];
}

/** 删除节点，同时删除挂在节点上的边。 */
export function removeNodes(
    nodes: readonly CanvasNode[],
    edges: readonly CanvasEdge[],
    ids: readonly string[],
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
    const removed = new Set(ids);
    return {
        nodes: nodes.filter((node) => !removed.has(node.id)),
        edges: edges.filter(
            (edge) => !removed.has(edge.source) && !removed.has(edge.target),
        ),
    };
}

export function moveNode(
    nodes: readonly CanvasNode[],
    id: string,
    position: { x: number; y: number },
): CanvasNode[] {
    return nodes.map((node) => (node.id === id ? { ...node, position } : node));
}
