/**
 * 节点库 UI 请求总线。
 *
 * 标题栏 / 快捷键 / 画布不在工作台 View 内部，无法直接拿到节点库 context；
 * 用一条很小的模块级事件总线把“打开插入菜单 / 打开管理器”的意图送进去。
 */
export type PresetUiEvent =
    | { type: "open-insert"; anchor?: { x: number; y: number } }
    | { type: "open-manager"; presetId?: string };

type Listener = (event: PresetUiEvent) => void;

const listeners = new Set<Listener>();

export function emitPresetUiEvent(event: PresetUiEvent): void {
    for (const listener of [...listeners]) listener(event);
}

export function onPresetUiEvent(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function openNodeLibrary(anchor?: { x: number; y: number }): void {
    emitPresetUiEvent(
        anchor === undefined
            ? { type: "open-insert" }
            : { type: "open-insert", anchor },
    );
}

export function openPresetManager(presetId?: string): void {
    emitPresetUiEvent(
        presetId === undefined
            ? { type: "open-manager" }
            : { type: "open-manager", presetId },
    );
}
