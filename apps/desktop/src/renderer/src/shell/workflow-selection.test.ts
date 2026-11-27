import { describe, expect, it } from "vitest";
import {
    orderedSelection,
    pruneSelection,
    selectRange,
    toggleSelected,
} from "./workflow-selection";

describe("workflow selection", () => {
    it("toggles single items", () => {
        const first = toggleSelected(new Set<string>(), "a");
        expect([...first]).toEqual(["a"]);

        const second = toggleSelected(first, "b");
        expect([...second]).toEqual(["a", "b"]);

        const third = toggleSelected(second, "a");
        expect([...third]).toEqual(["b"]);
    });

    it("selects an inclusive range in both directions", () => {
        const ordered = ["a", "b", "c", "d"];
        expect([...selectRange(ordered, "b", "d")]).toEqual(["b", "c", "d"]);
        expect([...selectRange(ordered, "d", "b")]).toEqual(["b", "c", "d"]);
        expect([...selectRange(ordered, "c", "c")]).toEqual(["c"]);
    });

    it("falls back to the target when the anchor is gone", () => {
        expect([...selectRange(["a", "b"], null, "b")]).toEqual(["b"]);
        expect([...selectRange(["a", "b"], "missing", "a")]).toEqual(["a"]);
    });

    it("prunes removed documents and keeps the reference when unchanged", () => {
        const selected = new Set(["a", "b"]);
        expect(pruneSelection(selected, ["a", "b", "c"])).toBe(selected);
        expect([...pruneSelection(selected, ["b"])]).toEqual(["b"]);
    });

    it("orders the selection by list order", () => {
        expect(orderedSelection(new Set(["c", "a"]), ["a", "b", "c"])).toEqual([
            "a",
            "c",
        ]);
    });
});
