import type { CanvasDocument } from "../core/types";
import type { FlowNode } from "./flow-types";

/**
 * 只有边集合或运行状态变化时才重建 react-flow 边；指标刷新不应打断边动画。
 */
export function edgeSignature(document: CanvasDocument): string {
    return JSON.stringify(
        document.edges.map((edge) => [edge.id, edge.status ?? "idle"]),
    );
}

/**
 * 合并投影结果时保留 react-flow 写回节点的内部字段（measured / internals /
 * handleBounds 等）。
 *
 * 直接替换成裸对象会让边在重新测量期间短暂失去端点，导致 EdgeWrapper
 * 卸载重建、CSS 动画从头开始；同时也会让拖动 / 端口锚点短暂跳动。
 */
export function mergeFlowNodes(
    current: readonly FlowNode[],
    next: readonly FlowNode[],
): FlowNode[] {
    const previous = new Map(current.map((node) => [node.id, node]));
    return next.map((node) => {
        const existing = previous.get(node.id);
        if (existing === undefined) return node;
        return {
            ...existing,
            type: node.type,
            position: node.position,
            data: node.data,
            selected: node.selected,
        };
    });
}
