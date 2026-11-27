import type { JsonObject, JsonValue, NodeDocument } from "wireclaw";
import type { Vec2, Viewport } from "../../canvas/core/types";

export const DEFAULT_VIEWPORT: Viewport = { x: 24, y: 28, zoom: 1 };

const GRID_ORIGIN_X = 80;
const GRID_ORIGIN_Y = 80;
const GRID_STEP_X = 280;
const GRID_STEP_Y = 180;
const GRID_COLUMNS = 4;

/**
 * 节点坐标来自 wireclaw 预留的 `ui`，运行时忽略该字段。
 * 缺少布局的图（例如外部导入）按确定性网格摆放，不写回文档。
 */
export function readNodePosition(node: NodeDocument, index: number): Vec2 {
    const x = readNumber(node.ui?.x);
    const y = readNumber(node.ui?.y);
    if (x !== undefined && y !== undefined) return { x, y };

    return {
        x: GRID_ORIGIN_X + (index % GRID_COLUMNS) * GRID_STEP_X,
        y: GRID_ORIGIN_Y + Math.floor(index / GRID_COLUMNS) * GRID_STEP_Y,
    };
}

/** 只改 x/y，保留 ui 里的其他键（例如自定义展示信息）。 */
export function withNodePosition(node: NodeDocument, position: Vec2): NodeDocument {
    return {
        ...node,
        ui: { ...(node.ui ?? {}), x: position.x, y: position.y },
    };
}

/** 节点折叠态保存在 `ui.collapsed`；缺省展开。 */
export function readNodeCollapsed(node: NodeDocument): boolean {
    return node.ui?.collapsed === true;
}

/** 只改 `ui.collapsed`，其余布局与自定义字段保留。 */
export function withNodeCollapsed(
    node: NodeDocument,
    collapsed: boolean,
): NodeDocument {
    return {
        ...node,
        ui: { ...(node.ui ?? {}), collapsed },
    };
}

export function readViewport(ui: JsonObject | undefined): Viewport {
    const viewport = ui?.viewport;
    if (isJsonObject(viewport)) {
        const x = readNumber(viewport.x);
        const y = readNumber(viewport.y);
        const zoom = readNumber(viewport.zoom);
        if (x !== undefined && y !== undefined && zoom !== undefined && zoom > 0) {
            return { x, y, zoom };
        }
    }

    return { ...DEFAULT_VIEWPORT };
}

export function withViewport(ui: JsonObject | undefined, viewport: Viewport): JsonObject {
    return {
        ...(ui ?? {}),
        viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    };
}

function readNumber(value: JsonValue | undefined): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
