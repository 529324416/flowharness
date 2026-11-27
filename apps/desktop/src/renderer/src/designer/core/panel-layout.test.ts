import { describe, expect, it } from "vitest";
import type { JsonObject } from "wireclaw";
import {
    readPanelLayout,
    samePanelLayout,
    withPanelLayout,
} from "./panel-layout";

function panel(overrides: Partial<Parameters<typeof withPanelLayout>[1][number]> = {}) {
    return {
        id: "inspector" as const,
        open: true,
        collapsed: false,
        x: 32,
        y: 48,
        width: 280,
        height: 432,
        z: 3,
        ...overrides,
    };
}

describe("panel layout", () => {
    it("round-trips panel positions while preserving other ui keys", () => {
        const ui: JsonObject = {
            viewport: { x: 5, y: 6, zoom: 0.5 },
            theme: "keep",
        };
        const layout = [
            panel(),
            panel({
                id: "run-log",
                open: false,
                collapsed: true,
                x: null,
                y: null,
                width: 448,
                height: 224,
                z: 1,
            }),
        ];

        const next = withPanelLayout(ui, layout);

        expect(next.viewport).toEqual(ui.viewport);
        expect(next.theme).toBe("keep");
        expect(readPanelLayout(next)).toEqual(layout);
    });

    it("ignores missing or invalid entries and unknown ids", () => {
        const ui = withPanelLayout(undefined, [panel()]);
        const panels = ui.panels as Record<string, unknown>;
        panels["run-log"] = { open: true, width: -1 };
        panels["session-history"] = { open: true, width: 420, height: 520, z: 0 };
        panels.unknown = { open: true, width: 1, height: 1, z: 1 };

        const layout = readPanelLayout(ui);

        expect(layout?.map((item) => item.id)).toEqual([
            "inspector",
            "session-history",
        ]);
    });

    it("returns null for a graph without a saved layout", () => {
        expect(readPanelLayout(undefined)).toBeNull();
        expect(readPanelLayout({})).toBeNull();
        expect(readPanelLayout({ panels: {} })).toBeNull();
    });

    it("compares layouts by panel id, not array order", () => {
        const left = [panel(), panel({ id: "run-log", x: 1, y: 2 })];
        const right = [panel({ id: "run-log", x: 1, y: 2 }), panel()];

        expect(samePanelLayout(left, right)).toBe(true);
        expect(
            samePanelLayout(left, [panel({ id: "run-log", x: 99, y: 2 }), panel()]),
        ).toBe(false);
        expect(samePanelLayout(null, [])).toBe(false);
    });
});
