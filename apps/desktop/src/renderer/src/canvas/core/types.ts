export type Vec2 = { x: number; y: number };

export type Size = { width: number; height: number };

/** 画布视口；与 react-flow 的 Viewport 同形，但不依赖它。 */
export type Viewport = {
    x: number;
    y: number;
    zoom: number;
};

export type CanvasStatus =
    | "idle"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "skipped";

export type CanvasEdgeStatus = "idle" | "active" | "error";

/** 一个具名端口；Canvas 不解释 type 的业务含义。 */
export type CanvasPort = {
    name: string;
    type: string;
};

export type CanvasPortRef = {
    nodeId: string;
    port: string;
};

/** 节点级健康提示；由设计期 Provider 问题投影，不参与运行状态。 */
export type CanvasNodeNotice = {
    severity: "warning" | "danger";
    message: string;
};

/** 节点内联字段的运行时下拉选项；Canvas 不解释字段语义。 */
export type CanvasFieldOption = {
    value: string;
    label: string;
};

/**
 * 被上游连接固定的字段：只读展示来源值，不在当前节点提供编辑入口。
 */
export type CanvasLockedField = {
    /** 来源节点上的当前值（已解析为可读文本）。 */
    value: string;
    /** 来源说明；用于 tooltip 与无障碍描述。 */
    reason: string;
};

/**
 * 节点渲染数据。
 *
 * 这是 GraphDocument 的投影，不持有运行身份；config 只供节点 Body 内联编辑与
 * 检查器展示，Canvas 组件不解释它的业务语义。
 */
export type CanvasNodeData = {
    kind: string;
    title: string;
    summary?: string;
    status: CanvasStatus;
    meta?: string;
    inputs: readonly CanvasPort[];
    outputs: readonly CanvasPort[];
    config?: unknown;
    /** 节点类型无法解析时的降级原因；正常节点为 undefined。 */
    error?: string;
    /** Provider / 配置健康提示；不改变运行状态。 */
    notice?: CanvasNodeNotice;
    /** 内联字段下拉选项（按 config 字段名），由工作台在投影时注入。 */
    fieldOptions?: Readonly<Record<string, readonly CanvasFieldOption[]>>;
    /** 被连接固定、不可编辑的字段及其来源值。 */
    lockedFields?: Readonly<Record<string, CanvasLockedField>>;
    /** 已连接输入端口在节点内的显示值；缺省显示端口名。 */
    slotLabels?: Readonly<Record<string, string>>;
    /** 已连接端口（输入 / 输出）：用于端口徽标在方块与圆点之间切换。 */
    connectedPorts?: {
        inputs: readonly string[];
        outputs: readonly string[];
    };
    /** 折叠态：只显示已连接端口与有数据的字段。 */
    collapsed?: boolean;
    /** 折叠态需要保留的 config 字段（已按默认值过滤）；展开时忽略。 */
    collapsedFields?: readonly string[];
};

export type CanvasNode = {
    id: string;
    kind: string;
    position: Vec2;
    size?: Size;
    data: CanvasNodeData;
};

export type CanvasEdge = {
    id: string;
    source: CanvasPortRef;
    target: CanvasPortRef;
    status: CanvasEdgeStatus;
};

export type CanvasDocument = {
    nodes: readonly CanvasNode[];
    edges: readonly CanvasEdge[];
    viewport: Viewport;
};

/**
 * 画布发出的语义命令。
 *
 * Canvas 不修改 GraphDocument；设计器负责把命令应用到文档上。
 * 后续 addNode / updateNodeConfig 等设计器动作不经过 CanvasCommand。
 */
export type CanvasCommand =
    | {
          type: "moveNodes";
          positions: readonly { nodeId: string; position: Vec2 }[];
      }
    | { type: "removeNodes"; nodeIds: readonly string[] }
    | { type: "connect"; from: CanvasPortRef; to: CanvasPortRef }
    | { type: "disconnect"; from: CanvasPortRef; to: CanvasPortRef }
    | { type: "setNodeCollapsed"; nodeId: string; collapsed: boolean }
    | { type: "setViewport"; viewport: Viewport };
