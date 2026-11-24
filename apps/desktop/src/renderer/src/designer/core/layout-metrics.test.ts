import { describe, expect, it } from "vitest";
import { CANVAS_METRICS } from "../../canvas/metrics";
import {
    PANEL_DEFAULTS,
    PANEL_HEADER_HEIGHT,
    PANEL_MIN_HEIGHT,
    PANEL_MIN_WIDTH,
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_MIN_WIDTH,
} from "../../layout-metrics";

describe("layout metrics", () => {
    it("keeps panel defaults inside the minimum size", () => {
        for (const panel of Object.values(PANEL_DEFAULTS)) {
            expect(panel.width).toBeGreaterThanOrEqual(PANEL_MIN_WIDTH);
            expect(panel.height).toBeGreaterThanOrEqual(PANEL_MIN_HEIGHT);
        }
        expect(PANEL_DEFAULTS.inspector.width).toBe(PANEL_MIN_WIDTH);
        expect(PANEL_HEADER_HEIGHT).toBe(34);
    });

    it("keeps the sidebar default inside the drag range", () => {
        expect(SIDEBAR_DEFAULT_WIDTH).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH);
        expect(SIDEBAR_DEFAULT_WIDTH).toBeLessThanOrEqual(SIDEBAR_MAX_WIDTH);
    });

    it("keeps canvas geometry at the documented values", () => {
        expect(CANVAS_METRICS.gridSize).toBe(24);
        expect(CANVAS_METRICS.portSize).toBe(10);
        expect(CANVAS_METRICS.portHitSize).toBeGreaterThan(CANVAS_METRICS.portSize);
        expect(CANVAS_METRICS.edgeWidth).toBe(1.4);
    });
});
