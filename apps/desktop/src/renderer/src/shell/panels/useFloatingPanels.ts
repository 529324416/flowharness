import { useCallback, useRef, useState } from "react";

export type PanelId = "run-log" | "inspector";

export type FloatingPanelState = {
    id: PanelId;
    open: boolean;
    collapsed: boolean;
    /** null 表示使用 PanelLayer 根据容器尺寸计算的默认位置。 */
    x: number | null;
    y: number | null;
    width: number;
    height: number;
    z: number;
};

export const PANEL_DEFAULTS: Record<
    PanelId,
    { width: number; height: number; title: string }
> = {
    "run-log": { width: 448, height: 224, title: "运行日志" },
    inspector: { width: 256, height: 432, title: "属性" },
};

const INITIAL_PANELS: FloatingPanelState[] = [
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
];

export type FloatingPanelsApi = {
    panels: FloatingPanelState[];
    isOpen: (id: PanelId) => boolean;
    toggle: (id: PanelId) => void;
    close: (id: PanelId) => void;
    focus: (id: PanelId) => void;
    update: (id: PanelId, patch: Partial<FloatingPanelState>) => void;
};

export function useFloatingPanels(): FloatingPanelsApi {
    const [panels, setPanels] = useState<FloatingPanelState[]>(INITIAL_PANELS);
    const topZ = useRef(2);

    const focus = useCallback((id: PanelId) => {
        topZ.current += 1;
        const z = topZ.current;
        setPanels((current) =>
            current.map((panel) => (panel.id === id ? { ...panel, z } : panel)),
        );
    }, []);

    const update = useCallback((id: PanelId, patch: Partial<FloatingPanelState>) => {
        setPanels((current) =>
            current.map((panel) => (panel.id === id ? { ...panel, ...patch } : panel)),
        );
    }, []);

    const toggle = useCallback(
        (id: PanelId) => {
            setPanels((current) => {
                const target = current.find((panel) => panel.id === id);
                if (!target) return current;

                if (!target.open) {
                    topZ.current += 1;
                    const z = topZ.current;
                    return current.map((panel) =>
                        panel.id === id ? { ...panel, open: true, z } : panel,
                    );
                }

                return current.map((panel) =>
                    panel.id === id ? { ...panel, open: false } : panel,
                );
            });
        },
        [],
    );

    const close = useCallback((id: PanelId) => {
        setPanels((current) =>
            current.map((panel) => (panel.id === id ? { ...panel, open: false } : panel)),
        );
    }, []);

    const isOpen = useCallback(
        (id: PanelId) => panels.some((panel) => panel.id === id && panel.open),
        [panels],
    );

    return { panels, isOpen, toggle, close, focus, update };
}
