import type { JsonObject } from "wireclaw";
import type { CanvasPort, CanvasStatus } from "../canvas/core/types";

/** 检查器里的下拉选项；由 Provider 库等运行时数据注入。 */
export type InspectorFieldOption = {
    value: string;
    label: string;
};

export type InspectorNodeModel = {
    id: string;
    type: string;
    typeVersion: number;
    title: string;
    status: CanvasStatus;
    inputs: readonly CanvasPort[];
    outputs: readonly CanvasPort[];
    requirements: readonly string[];
    config: unknown;
    error?: string;
    /** 节点类型的 configSchema（wireclaw 受支持子集）；缺失时检查器只有 JSON。 */
    configSchema?: JsonObject;
    /** 特定字段的运行时下拉选项（providerId / modelId）。 */
    fieldOptions?: Readonly<Record<string, readonly InspectorFieldOption[]>>;
    description?: string;
    category?: string;
    builtIn?: boolean;
};

export type InspectorGraphModel = {
    id: string;
    title?: string;
    nodeCount: number;
    edgeCount: number;
    viewport: { x: number; y: number; zoom: number };
};

export type InspectorModel = {
    graph: InspectorGraphModel | null;
    node: InspectorNodeModel | null;
    canEdit: boolean;
    onUpdateConfig: (nodeId: string, config: unknown) => void;
};
