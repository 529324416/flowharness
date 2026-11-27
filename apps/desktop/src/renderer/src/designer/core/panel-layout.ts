import type { JsonObject, JsonValue } from "wireclaw";
import {
    PANEL_IDS,
    type PanelId,
    type PanelLayoutState,
} from "../../layout-metrics";

/**
 * 读取 GraphDocument.ui.panels 中的浮动面板布局。
 *
 * 布局是 `ui` 的自由子对象：缺失或损坏时返回 null，由调用方恢复默认；
 * 未知面板 id 忽略，避免旧版本数据影响当前面板。
 */
export function readPanelLayout(
    ui: JsonObject | undefined,
): PanelLayoutState[] | null {
    const panels = ui?.panels;
    if (!isJsonObject(panels)) return null;

    const layout: PanelLayoutState[] = [];
    for (const id of PANEL_IDS) {
        const entry = panels[id];
        if (!isJsonObject(entry)) continue;

        const width = readPositive(entry.width);
        const height = readPositive(entry.height);
        const z = readNumber(entry.z);
        if (width === undefined || height === undefined || z === undefined) {
            continue;
        }

        layout.push({
            id,
            open: entry.open === true,
            collapsed: entry.collapsed === true,
            x: readNullableNumber(entry.x),
            y: readNullableNumber(entry.y),
            width,
            height,
            z,
        });
    }

    return layout.length === 0 ? null : layout;
}

/** 把面板布局写回 ui，保留 viewport 与其他未知键。 */
export function withPanelLayout(
    ui: JsonObject | undefined,
    layout: readonly PanelLayoutState[],
): JsonObject {
    const panels: Record<string, JsonValue> = {};

    for (const panel of layout) {
        if (!PANEL_IDS.includes(panel.id)) continue;
        panels[panel.id] = {
            open: panel.open,
            collapsed: panel.collapsed,
            x: panel.x,
            y: panel.y,
            width: panel.width,
            height: panel.height,
            z: panel.z,
        };
    }

    return { ...(ui ?? {}), panels };
}

/** 比较两份布局；顺序无关，按面板 id 对齐。 */
export function samePanelLayout(
    left: readonly PanelLayoutState[] | null,
    right: readonly PanelLayoutState[] | null,
): boolean {
    if (left === null || right === null) return left === right;

    const byId = new Map<PanelId, PanelLayoutState>(
        left.map((panel) => [panel.id, panel]),
    );
    if (byId.size !== right.length) return false;

    return right.every((panel) => {
        const other = byId.get(panel.id);
        return (
            other !== undefined &&
            other.open === panel.open &&
            other.collapsed === panel.collapsed &&
            other.x === panel.x &&
            other.y === panel.y &&
            other.width === panel.width &&
            other.height === panel.height &&
            other.z === panel.z
        );
    });
}

function readNumber(value: JsonValue | undefined): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPositive(value: JsonValue | undefined): number | undefined {
    const number = readNumber(value);
    return number !== undefined && number > 0 ? number : undefined;
}

function readNullableNumber(value: JsonValue | undefined): number | null {
    if (value === null || value === undefined) return null;
    return readNumber(value) ?? null;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
