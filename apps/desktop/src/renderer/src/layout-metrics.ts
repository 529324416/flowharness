/**
 * 画布外布局的尺寸契约（面板 / 侧栏）。
 *
 * 组件与测试共用同一组常量，避免出现「请求 256、实际被最小宽度钳到 280」
 * 或「侧栏 token 与默认值不一致」这类漂移。
 */
export type PanelId = "run-log" | "inspector" | "session-history";

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

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_DEFAULT_WIDTH = 260;
