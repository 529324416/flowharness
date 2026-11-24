import type { GraphDocument } from "wireclaw";
import { edgeKeyFromPorts } from "../../canvas/core/edge-key";
import { describeDesignerNode, type NodePresentation } from "./catalog";

export type InvalidEdge = {
    /** 与画布一致的稳定边 id：`from:port->to:port` */
    id: string;
    message: string;
    /** 连线起点节点 id；用于问题面板定位 */
    sourceNodeId: string;
    /** 连线终点节点 id；用于问题面板定位 */
    targetNodeId: string;
};

/**
 * 找出「悬空」的连线：节点不存在、节点类型无法解析，或端口在当前 config 下不存在。
 *
 * 端口来自 `describeDesignerNode(type, config)`，因此配置变化导致动态端口收缩后，
 * 失效连线会在下一次投影时被标出来（当前内建节点端口是静态的）。
 */
export function findInvalidEdges(graph: GraphDocument): readonly InvalidEdge[] {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const views = new Map<string, NodePresentation>();
    const viewOf = (nodeId: string): NodePresentation | undefined => {
        const node = nodes.get(nodeId);
        if (node === undefined) return undefined;

        const cached = views.get(nodeId);
        if (cached !== undefined) return cached;

        const view = describeDesignerNode(node.type, node.config);
        views.set(nodeId, view);
        return view;
    };

    const issues: InvalidEdge[] = [];

    for (const edge of graph.edges) {
        const id = edgeKeyFromPorts(edge.from, edge.to);
        const reasons: string[] = [];

        const source = viewOf(edge.from.nodeId);
        const target = viewOf(edge.to.nodeId);

        if (source === undefined) {
            reasons.push(`起点节点不存在：${edge.from.nodeId}`);
        } else if (source.error !== undefined) {
            reasons.push(`起点类型无法解析：${edge.from.nodeId}`);
        } else if (!source.outputs.some((port) => port.name === edge.from.port)) {
            reasons.push(`起点端口不存在：${edge.from.nodeId}.${edge.from.port}`);
        }

        if (target === undefined) {
            reasons.push(`终点节点不存在：${edge.to.nodeId}`);
        } else if (target.error !== undefined) {
            reasons.push(`终点类型无法解析：${edge.to.nodeId}`);
        } else if (!target.inputs.some((port) => port.name === edge.to.port)) {
            reasons.push(`终点端口不存在：${edge.to.nodeId}.${edge.to.port}`);
        }

        if (reasons.length > 0) {
            issues.push({
                id,
                message: reasons.join("；"),
                sourceNodeId: edge.from.nodeId,
                targetNodeId: edge.to.nodeId,
            });
        }
    }

    return issues;
}
