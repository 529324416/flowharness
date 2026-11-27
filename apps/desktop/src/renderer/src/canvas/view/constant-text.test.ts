import { describe, expect, it } from "vitest";
import {
    CONSTANT_PREVIEW_LIMIT,
    CONSTANT_TOOLTIP_LIMIT,
    truncateText,
} from "./constant-text";

describe("truncateText", () => {
    it("keeps short text unchanged", () => {
        expect(truncateText("hello", 10)).toEqual({
            text: "hello",
            truncated: false,
        });
    });

    it("cuts at the limit and reports truncation", () => {
        expect(truncateText("abcdef", 3)).toEqual({
            text: "abc",
            truncated: true,
        });
    });

    it("uses 200 characters for the preview and 400 for the tooltip", () => {
        expect(CONSTANT_PREVIEW_LIMIT).toBe(200);
        expect(CONSTANT_TOOLTIP_LIMIT).toBe(400);

        const text = "x".repeat(500);
        expect(truncateText(text, CONSTANT_PREVIEW_LIMIT).text).toHaveLength(200);
        expect(truncateText(text, CONSTANT_TOOLTIP_LIMIT).text).toHaveLength(400);
    });
});
