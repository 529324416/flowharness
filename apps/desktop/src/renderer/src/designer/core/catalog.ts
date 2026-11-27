import {
    createBuiltinNodeRegistry,
    createEditorCatalog,
    describeNodeType,
    type JsonObject,
    type JsonValue,
    type NodeCatalogEntry,
    type NodePresetDocument,
} from "wireclaw";
import { designerPresetLibrary } from "./presets";

/** 设计器使用的内建节点注册表；后续可在这里合并宿主注册的节点类型。 */
export const designerRegistry = createBuiltinNodeRegistry();

/**
 * 编辑器目录：节点类型 + 预设 + 目录版本。
 *
 * 用 `createEditorCatalog` 而不是 `describeNodeTypes`，这样默认 config、
 * configSchema、分类与预设都来自 wireclaw，FH 侧不再维护第二份节点元数据。
 */
export const EDITOR_CATALOG = createEditorCatalog(designerRegistry, {
    presets: designerPresetLibrary,
});

/**
 * 仅保留反序列化与旧图渲染、但不出现在节点库 / 插入菜单的类型。
 *
 * `core.merge` 已由 `core.filter` 取代；旧图仍能打开与运行，但新增节点
 * 时只提供 Filter。
 */
const HIDDEN_NODE_TYPES: ReadonlySet<string> = new Set(["core.merge"]);

export const NODE_CATALOG: readonly NodeCatalogEntry[] =
    EDITOR_CATALOG.nodeTypes.filter(
        (entry) => !HIDDEN_NODE_TYPES.has(entry.type),
    );

export const NODE_PRESETS: readonly NodePresetDocument[] = EDITOR_CATALOG.presets;

/** 分类顺序与显示名；未知分类排到最后并使用原始 id。 */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
    io: "输入 / 输出",
    data: "数据",
    model: "模型",
    control: "控制流",
    composite: "组合",
    tool: "工具",
    event: "事件与日志",
};

const CATEGORY_ORDER: readonly string[] = [
    "io",
    "data",
    "model",
    "control",
    "composite",
    "tool",
    "event",
];

export type NodeCatalogGroup = {
    id: string;
    label: string;
    entries: readonly NodeCatalogEntry[];
};

export function categoryLabel(category: string | undefined): string {
    if (category === undefined) return "其他";
    return CATEGORY_LABELS[category] ?? category;
}

/** 按分类分组；组内保持注册顺序，空分类不返回。 */
export function groupNodeCatalog(
    entries: readonly NodeCatalogEntry[] = NODE_CATALOG,
): readonly NodeCatalogGroup[] {
    const groups = new Map<string, NodeCatalogEntry[]>();

    for (const entry of entries) {
        const id = entry.category ?? "other";
        const bucket = groups.get(id);
        if (bucket === undefined) {
            groups.set(id, [entry]);
        } else {
            bucket.push(entry);
        }
    }

    const order = [...CATEGORY_ORDER];
    for (const id of groups.keys()) {
        if (!order.includes(id)) order.push(id);
    }

    return order
        .filter((id) => groups.has(id))
        .map((id) => ({
            id,
            label: categoryLabel(id === "other" ? undefined : id),
            entries: groups.get(id) ?? [],
        }));
}

function searchText(entry: NodeCatalogEntry): string {
    return [
        entry.title ?? "",
        entry.type,
        entry.description ?? "",
        entry.category ?? "",
        ...(entry.keywords ?? []),
    ]
        .join(" ")
        .toLowerCase();
}

/** 标题 / 类型 / 描述 / 关键词的包含匹配。 */
export function searchNodeCatalog(
    query: string,
    entries: readonly NodeCatalogEntry[] = NODE_CATALOG,
): readonly NodeCatalogEntry[] {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return entries;
    return entries.filter((entry) => searchText(entry).includes(needle));
}

export function findNodeCatalogEntry(type: string): NodeCatalogEntry | undefined {
    return NODE_CATALOG.find((entry) => entry.type === type);
}

/** 深拷贝类型默认 config；没有默认值时返回 undefined。 */
export function defaultConfigOf(entry: NodeCatalogEntry): JsonValue | undefined {
    return entry.defaultConfig === undefined
        ? undefined
        : structuredClone(entry.defaultConfig);
}

export type DesignerPort = {
    name: string;
    type: string;
};

export type NodePresentation = {
    title: string;
    description?: string;
    inputs: readonly DesignerPort[];
    outputs: readonly DesignerPort[];
    /** 节点类型无法创建示例实例时的原因；此时端口为空。 */
    error?: string;
};

/**
 * 解析节点类型的展示信息。
 *
 * 端口可能依赖 config（动态端口），所以每次都传入节点实例的 config；
 * 未知类型不抛错，降级为占位节点，交由校验输出问题。
 */
export function describeDesignerNode(type: string, config: unknown): NodePresentation {
    try {
        const entry = describeNodeType(designerRegistry, type, {
            config: config as JsonValue | undefined,
        });

        return {
            title: entry.title ?? type,
            ...(entry.description === undefined
                ? {}
                : { description: entry.description }),
            inputs: entry.inputs.map(toDesignerPort),
            outputs: entry.outputs.map(toDesignerPort),
        };
    } catch (error) {
        return {
            title: type,
            inputs: [],
            outputs: [],
            error: errorMessage(error),
        };
    }
}

function toDesignerPort(port: { name: string; type: string }): DesignerPort {
    return { name: port.name, type: port.type };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** 供表单组件复用的 JSON Schema 类型别名。 */
export type DesignerConfigSchema = JsonObject;
