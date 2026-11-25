import { describe, expect, it } from "vitest";
import { sameNodeSelection } from "./selection";

describe("sameNodeSelection", () => {
    it("treats the same ids in any order as equal", () => {
        expect(sameNodeSelection(["a", "b"], ["b", "a"])).toBe(true);
        expect(sameNodeSelection([], [])).toBe(true);
    });

    it("detects added, removed or replaced ids", () => {
        expect(sameNodeSelection(["a"], ["a", "b"])).toBe(false);
        expect(sameNodeSelection(["a", "b"], ["a"])).toBe(false);
        expect(sameNodeSelection(["a"], ["b"])).toBe(false);
    });
});
