/**
 * 画布几何常量。
 *
 * 这些值会被写入画布根节点的 CSS 变量（`--fh-node-width` 等），
 * 视觉样式与命中区都从这里取值，避免 TS 与 CSS 各写一份。
 */
export const CANVAS_METRICS = {
    nodeWidth: 220,
    nodeHeaderHeight: 30,
    portSize: 10,
    /** 端口可点击区域直径（视觉圆点之外的透明热区）。 */
    portHitSize: 24,
    edgeWidth: 1.4,
    /** 可见网格与拖拽吸附共用同一间距。 */
    gridSize: 24,
    minimapWidth: 168,
    minimapHeight: 96,
    minZoom: 0.25,
    maxZoom: 2,
} as const;
