import type { Edge, Node } from "@xyflow/react";
import type { CanvasEdgeStatus, CanvasNodeData } from "../core/types";

/** react-flow 只出现在 view 层；对外的领域类型是 CanvasNode / CanvasEdge。 */
export type FlowNode = Node<CanvasNodeData, string>;

export type FlowEdgeData = {
    status: CanvasEdgeStatus;
};

export type FlowEdge = Edge<FlowEdgeData>;
