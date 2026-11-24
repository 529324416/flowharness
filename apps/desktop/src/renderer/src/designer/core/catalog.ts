import {
    createBuiltinNodeRegistry,
    describeNodeType,
    describeNodeTypes,
    type JsonValue,
    type NodeCatalogEntry,
} from "wireclaw";

/** 设计器使用的内建节点注册表；后续可在这里合并宿主注册的节点类型。 */
export const designerRegistry = createBuiltinNodeRegistry();

/** 添加节点菜单/节点库共用；按默认 config 生成端口与错误信息。 */
export const NODE_CATALOG: readonly NodeCatalogEntry[] =
    describeNodeTypes(designerRegistry);

export function findNodeCatalogEntry(type: string): NodeCatalogEntry | undefined {
    return NODE_CATALOG.find((entry) => entry.type === type);
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
