import type { JsonObject, JsonValue } from "wireclaw";
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
    /** 特定字段的只读覆盖值（例如 Provider 已连接时显示来源 Provider）。 */
    fieldValues?: Readonly<Record<string, JsonValue | undefined>>;
    /** 特定字段的额外提示（例如 Provider 模型目录为空）。 */
    fieldHints?: Readonly<Record<string, string>>;
    /** 被连接固定、不可编辑的字段及原因。 */
    fieldLocks?: Readonly<Record<string, string>>;
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
