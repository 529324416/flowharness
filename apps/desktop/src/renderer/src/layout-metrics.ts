/**
 * 画布外布局的尺寸契约（面板 / 侧栏）。
 *
 * 组件与测试共用同一组常量，避免出现「请求 256、实际被最小宽度钳到 280」
 * 或「侧栏 token 与默认值不一致」这类漂移。
 */
export type PanelId = "run-log" | "inspector" | "session-history";

export const PANEL_IDS: readonly PanelId[] = [
    "inspector",
    "run-log",
    "session-history",
];

/**
 * 可序列化的浮动面板布局。
 *
 * 与 GraphDocument.ui.panels 的条目同形；x / y 为 null 表示由容器计算默认位置。
 */
export type PanelLayoutState = {
    id: PanelId;
    open: boolean;
    collapsed: boolean;
    x: number | null;
    y: number | null;
    width: number;
    height: number;
    z: number;
};

export const PANEL_MIN_WIDTH = 280;
export const PANEL_MIN_HEIGHT = 140;
export const PANEL_EDGE = 16;
/** 面板头部高度；折叠高度与 FloatingPanel 的钳制共用。 */
export const PANEL_HEADER_HEIGHT = 34;

export const PANEL_DEFAULTS: Record<
    PanelId,
    { width: number; height: number; title: string }
> = {
    "run-log": { width: 448, height: 224, title: "运行日志" },
    inspector: { width: 280, height: 432, title: "属性" },
    "session-history": { width: 420, height: 520, title: "会话历史" },
};

/** 首次打开 / 没有保存布局时的浮动面板状态。 */
export const DEFAULT_PANEL_LAYOUT: readonly PanelLayoutState[] = [
    {
        id: "inspector",
        open: true,
        collapsed: false,
        x: null,
        y: null,
        width: PANEL_DEFAULTS.inspector.width,
        height: PANEL_DEFAULTS.inspector.height,
        z: 2,
    },
    {
        id: "run-log",
        open: true,
        collapsed: false,
        x: null,
        y: null,
        width: PANEL_DEFAULTS["run-log"].width,
        height: PANEL_DEFAULTS["run-log"].height,
        z: 1,
    },
    {
        id: "session-history",
        open: false,
        collapsed: false,
        x: null,
        y: null,
        width: PANEL_DEFAULTS["session-history"].width,
        height: PANEL_DEFAULTS["session-history"].height,
        z: 0,
    },
];

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_DEFAULT_WIDTH = 260;
