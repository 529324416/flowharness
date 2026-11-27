import { useCallback, useRef, useState } from "react";
import {
    DEFAULT_PANEL_LAYOUT,
    PANEL_DEFAULTS,
    type PanelId,
    type PanelLayoutState,
} from "../../layout-metrics";

export type { PanelId };
export { PANEL_DEFAULTS };

export type FloatingPanelState = PanelLayoutState;

function cloneDefaultLayout(): FloatingPanelState[] {
    return DEFAULT_PANEL_LAYOUT.map((panel) => ({ ...panel }));
}

export type FloatingPanelsApi = {
    panels: FloatingPanelState[];
    isOpen: (id: PanelId) => boolean;
    toggle: (id: PanelId) => void;
    open: (id: PanelId) => void;
    close: (id: PanelId) => void;
    focus: (id: PanelId) => void;
    update: (id: PanelId, patch: Partial<FloatingPanelState>) => void;
    /** 应用某张图保存的布局；null / 缺失面板恢复默认。 */
    applyLayout: (layout: readonly FloatingPanelState[] | null) => void;
};

export function useFloatingPanels(): FloatingPanelsApi {
    const [panels, setPanels] = useState<FloatingPanelState[]>(cloneDefaultLayout);
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

    const open = useCallback((id: PanelId) => {
        topZ.current += 1;
        const z = topZ.current;
        setPanels((current) =>
            current.map((panel) =>
                panel.id === id ? { ...panel, open: true, z } : panel,
            ),
        );
    }, []);

    const close = useCallback((id: PanelId) => {
        setPanels((current) =>
            current.map((panel) => (panel.id === id ? { ...panel, open: false } : panel)),
        );
    }, []);

    const isOpen = useCallback(
        (id: PanelId) => panels.some((panel) => panel.id === id && panel.open),
        [panels],
    );

    const applyLayout = useCallback(
        (layout: readonly FloatingPanelState[] | null) => {
            setPanels(() => {
                const saved = new Map(
                    (layout ?? []).map((panel) => [panel.id, panel]),
                );
                const next = DEFAULT_PANEL_LAYOUT.map((panel) => {
                    const override = saved.get(panel.id);
                    return override === undefined
                        ? { ...panel }
                        : { ...panel, ...override, id: panel.id };
                });
                topZ.current = Math.max(
                    2,
                    ...next.map((panel) => panel.z),
                );
                return next;
            });
        },
        [],
    );

    return { panels, isOpen, toggle, open, close, focus, update, applyLayout };
}
