/** 节点库 → 画布拖拽载荷。 */
export type NodeDragPayload =
    | { kind: "type"; type: string }
    | { kind: "preset"; presetId: string };

export const NODE_DRAG_MIME = "application/x-flowharness-node";

export function writeNodeDragPayload(
    dataTransfer: DataTransfer,
    payload: NodeDragPayload,
): void {
    dataTransfer.setData(NODE_DRAG_MIME, JSON.stringify(payload));
    dataTransfer.effectAllowed = "copy";
}

export function parseNodeDragPayload(raw: string): NodeDragPayload | null {
    if (raw.length === 0) return null;

    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== "object" || value === null) return null;
        const record = value as Record<string, unknown>;
        if (record.kind === "type" && typeof record.type === "string" && record.type.length > 0) {
            return { kind: "type", type: record.type };
        }
        if (
            record.kind === "preset" &&
            typeof record.presetId === "string" &&
            record.presetId.length > 0
        ) {
            return { kind: "preset", presetId: record.presetId };
        }
        return null;
    } catch {
        return null;
    }
}

export function readNodeDragPayload(
    dataTransfer: DataTransfer,
): NodeDragPayload | null {
    return parseNodeDragPayload(dataTransfer.getData(NODE_DRAG_MIME));
}
