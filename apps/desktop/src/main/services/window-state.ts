import { readJsonFile, writeJsonFile } from "./atomic-file";

export type SavedWindowState = {
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
};

const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function coerce(value: unknown): SavedWindowState | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (
        !isFiniteNumber(record.x) ||
        !isFiniteNumber(record.y) ||
        !isFiniteNumber(record.width) ||
        !isFiniteNumber(record.height)
    ) {
        return null;
    }
    if (record.width < MIN_WIDTH || record.height < MIN_HEIGHT) return null;

    return {
        x: Math.round(record.x),
        y: Math.round(record.y),
        width: Math.round(record.width),
        height: Math.round(record.height),
        maximized: record.maximized === true,
    };
}

/** 设备相关的窗口位置；放在 userData 下，不进入 AppConfig/工作区。 */
export class WindowStateStore {
    constructor(private readonly file: string) {}

    async load(): Promise<SavedWindowState | null> {
        try {
            return coerce(await readJsonFile<unknown>(this.file));
        } catch {
            return null;
        }
    }

    async save(state: SavedWindowState): Promise<void> {
        try {
            await writeJsonFile(this.file, state);
        } catch (error) {
            console.warn("[window-state] save failed", error);
        }
    }
}
