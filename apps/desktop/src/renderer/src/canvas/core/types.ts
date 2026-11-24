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

/**
 * 节点渲染数据。
 *
 * 这是 GraphDocument 的投影，不持有运行身份；config 只用于检查器展示，
 * Canvas 组件不解释它。
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
    | { type: "setViewport"; viewport: Viewport };
