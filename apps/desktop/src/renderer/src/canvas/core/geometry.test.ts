import { describe, expect, it } from "vitest";
import { containsPoint, intersects, screenToWorld, worldToScreen } from "./geometry";

describe("canvas geometry", () => {
    it("round-trips screen and world coordinates", () => {
        const viewport = { x: 120, y: -40, zoom: 1.5 };
        const world = { x: 80, y: 160 };
        const screen = worldToScreen(world, viewport);
        expect(screen).toEqual({ x: 240, y: 200 });
        expect(screenToWorld(screen, viewport)).toEqual(world);
    });

    it("checks point containment and rect intersection", () => {
        const rect = { x: 10, y: 20, width: 100, height: 50 };
        expect(containsPoint(rect, { x: 10, y: 20 })).toBe(true);
        expect(containsPoint(rect, { x: 111, y: 20 })).toBe(false);
        expect(intersects(rect, { x: 50, y: 40, width: 100, height: 10 })).toBe(true);
        expect(intersects(rect, { x: 200, y: 200, width: 10, height: 10 })).toBe(false);
    });
});
