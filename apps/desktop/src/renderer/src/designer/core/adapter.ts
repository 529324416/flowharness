import type { GraphDocument } from "wireclaw";
import type {
    CanvasDocument,
    CanvasEdge,
    CanvasEdgeStatus,
    CanvasFieldOption,
    CanvasLockedField,
    CanvasNode,
    CanvasNodeData,
    CanvasNodeNotice,
    CanvasStatus,
} from "../../canvas/core/types";
import { edgeKeyFromPorts } from "../../canvas/core/edge-key";
import { describeDesignerNode, type DesignerPort, type NodePresentation } from "./catalog";
import { readNodePosition, readViewport } from "./layout";

export type CanvasPresentation = {
    summary?: string;
    meta?: string;
};

export type ToCanvasDocumentOptions = {
    /** 运行期状态；不写回 GraphDocument。 */
    statuses?: Readonly<Record<string, CanvasStatus>>;
    /** 边状态；M1 之后由运行事件映射使用。 */
    edgeStatuses?: Readonly<Record<string, CanvasEdgeStatus>>;
    /** 示例/测试用的展示覆盖；真实文档默认从 config 与端口派生。 */
    presentation?: Readonly<Record<string, CanvasPresentation>>;
    /** 节点级健康提示；来自 Provider / 依赖检查，不写回文档。 */
    notices?: Readonly<Record<string, CanvasNodeNotice>>;
    /** 节点内联字段下拉；按 nodeId → config 字段名注入。 */
    fieldOptions?: Readonly<
        Record<string, Readonly<Record<string, readonly CanvasFieldOption[]>>>
    >;
    /** 被连接固定、不可编辑的字段；按 nodeId → config 字段名注入。 */
    lockedFields?: Readonly<
        Record<string, Readonly<Record<string, CanvasLockedField>>>
    >;
    /** 已连接输入端口在节点 Body 内的显示值；按 nodeId → 端口名注入。 */
    slotLabels?: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

/**
 * GraphDocument → CanvasDocument。
 *
 * 单向投影：编辑通过 CanvasCommand 回写 GraphDocument，不做整图反向覆盖，
 * 避免丢失 typeVersion / requires / inputs / metadata 等字段。
 */
export function toCanvasDocument(
    graph: GraphDocument,
    options: ToCanvasDocumentOptions = {},
): CanvasDocument {
    const nodes: CanvasNode[] = graph.nodes.map((node, index) => {
        const presentation = describeDesignerNode(node.type, node.config);
        const override = options.presentation?.[node.id];
        const summary = override?.summary ?? summarize(node.config, presentation);
        const data: CanvasNodeData = {
            kind: node.type,
            title: presentation.title,
            status: options.statuses?.[node.id] ?? "idle",
            inputs: presentation.inputs,
            outputs: presentation.outputs,
            ...(summary === undefined ? {} : { summary }),
            ...(override?.meta === undefined ? {} : { meta: override.meta }),
            ...(node.config === undefined ? {} : { config: node.config }),
            ...(presentation.error === undefined ? {} : { error: presentation.error }),
            ...(options.notices?.[node.id] === undefined
                ? {}
                : { notice: options.notices[node.id] }),
            ...(options.fieldOptions?.[node.id] === undefined
                ? {}
                : { fieldOptions: options.fieldOptions[node.id] }),
            ...(options.lockedFields?.[node.id] === undefined
                ? {}
                : { lockedFields: options.lockedFields[node.id] }),
            ...(options.slotLabels?.[node.id] === undefined
                ? {}
                : { slotLabels: options.slotLabels[node.id] }),
        };

        return {
            id: node.id,
            kind: node.type,
            position: readNodePosition(node, index),
            data,
        };
    });

    const edges: CanvasEdge[] = graph.edges.map((edge) => {
        const id = edgeKeyFromPorts(edge.from, edge.to);

        return {
            id,
            source: { nodeId: edge.from.nodeId, port: edge.from.port },
            target: { nodeId: edge.to.nodeId, port: edge.to.port },
            status: options.edgeStatuses?.[id] ?? "idle",
        };
    });

    return { nodes, edges, viewport: readViewport(graph.ui) };
}

function summarize(
    config: unknown,
    presentation: NodePresentation,
): string | undefined {
    if (isRecord(config)) {
        const providerId = readString(config, "providerId");
        const modelId = readString(config, "modelId");
        if (modelId !== undefined) {
            return providerId === undefined ? modelId : `${providerId} · ${modelId}`;
        }

        const provider = providerId;
        const model = readString(config, "model");
        if (model !== undefined) {
            return provider === undefined ? model : `${provider} · ${model}`;
        }

        if (providerId !== undefined) return providerId;

        const condition = readString(config, "condition");
        if (condition !== undefined) return condition;

        const level = readString(config, "level");
        if (level !== undefined) return level;
    }

    const ports: readonly DesignerPort[] =
        presentation.outputs.length > 0 ? presentation.outputs : presentation.inputs;
    if (ports.length === 0) return undefined;

    const names = ports.slice(0, 2).map((port) => port.name);
    return ports.length > 2 ? `${names.join(" · ")} +${ports.length - 2}` : names.join(" · ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
    const candidate = value[key];
    return typeof candidate === "string" ? candidate : undefined;
}
