import type { Edge, Node } from "@xyflow/react";
import type { CanvasEdgeStatus, CanvasNodeData } from "../core/types";

/** 节点视图附加的回调；不进入 CanvasDocument，只存在于 view 层。 */
export type FlowNodeData = CanvasNodeData & {
    onUpdateConfig?: (config: unknown) => void;
    readOnly?: boolean;
};

/** react-flow 只出现在 view 层；对外的领域类型是 CanvasNode / CanvasEdge。 */
export type FlowNode = Node<FlowNodeData, string>;

export type FlowEdgeData = {
    status: CanvasEdgeStatus;
};

export type FlowEdge = Edge<FlowEdgeData>;
