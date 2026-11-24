import { describe, expect, it } from "vitest";
import type { NodeDocument } from "wireclaw";
import {
    DEFAULT_VIEWPORT,
    readNodePosition,
    readViewport,
    withNodePosition,
    withViewport,
} from "./layout";

const node = (ui?: NodeDocument["ui"]): NodeDocument => ({
    id: "n1",
    type: "core.constant",
    typeVersion: 1,
    ...(ui === undefined ? {} : { ui }),
});

describe("designer layout", () => {
    it("uses deterministic grid fallback when ui is missing", () => {
        expect(readNodePosition(node(), 0)).toEqual({ x: 80, y: 80 });
        expect(readNodePosition(node(), 5)).toEqual({ x: 360, y: 260 });
    });

    it("reads x/y while preserving other ui keys on write", () => {
        const position = readNodePosition(node({ x: 12, y: 34, note: "keep" }), 0);
        expect(position).toEqual({ x: 12, y: 34 });

        const moved = withNodePosition(node({ x: 12, y: 34, note: "keep" }), {
            x: 100,
            y: 200,
        });
        expect(moved.ui).toEqual({ x: 100, y: 200, note: "keep" });
    });

    it("reads viewport with fallback for invalid values", () => {
        expect(readViewport({ viewport: { x: 1, y: 2, zoom: 0.5 } })).toEqual({
            x: 1,
            y: 2,
            zoom: 0.5,
        });
        expect(readViewport({ viewport: { x: 1, y: 2, zoom: 0 } })).toEqual(
            DEFAULT_VIEWPORT,
        );
        expect(readViewport(undefined)).toEqual(DEFAULT_VIEWPORT);
    });

    it("writes viewport while preserving other ui keys", () => {
        expect(withViewport({ theme: "keep" }, { x: 3, y: 4, zoom: 2 })).toEqual({
            theme: "keep",
            viewport: { x: 3, y: 4, zoom: 2 },
        });
    });
});
