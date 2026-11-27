import { describe, expect, it } from "vitest";
import { tokenizeJson, type JsonToken } from "./json-highlight";

function joined(tokens: readonly JsonToken[]): string {
    return tokens.map((token) => token.text).join("");
}

function typesOf(source: string, text: string): string[] {
    return tokenizeJson(source)
        .filter((token) => token.text === text)
        .map((token) => token.type);
}

describe("tokenizeJson", () => {
    it("逐字还原原文（含空白与换行）", () => {
        const source = '{\n  "name": "flow",\n  "count": -12.5e3,\n  "ok": true,\n  "none": null\n}';
        expect(joined(tokenizeJson(source))).toBe(source);
    });

    it("区分对象键与字符串值", () => {
        const tokens = tokenizeJson('{"key": "value"}');
        expect(tokens[0]).toEqual({ text: "{", type: "punctuation" });
        expect(tokens[1]).toEqual({ text: '"key"', type: "key" });
        expect(tokens[2]).toEqual({ text: ":", type: "punctuation" });
        expect(tokens[3]).toEqual({ text: " ", type: "plain" });
        expect(tokens[4]).toEqual({ text: '"value"', type: "string" });
    });

    it("支持转义字符与键名判断", () => {
        const tokens = tokenizeJson('{"a\\"b": "c\\\\d"}');
        expect(tokens.find((token) => token.type === "key")?.text).toBe('"a\\"b"');
        expect(tokens.find((token) => token.type === "string")?.text).toBe('"c\\\\d"');
    });

    it("识别数字、布尔与 null", () => {
        const source = "[0, -1, 2.5, 1e4, true, false, null]";
        expect(typesOf(source, "0")).toEqual(["number"]);
        expect(typesOf(source, "-1")).toEqual(["number"]);
        expect(typesOf(source, "2.5")).toEqual(["number"]);
        expect(typesOf(source, "1e4")).toEqual(["number"]);
        expect(typesOf(source, "true")).toEqual(["boolean"]);
        expect(typesOf(source, "false")).toEqual(["boolean"]);
        expect(typesOf(source, "null")).toEqual(["null"]);
    });

    it("未闭合字符串回退为 plain，且不丢字符", () => {
        const source = '{"broken": "abc';
        const tokens = tokenizeJson(source);
        expect(tokens.find((token) => token.type === "string")).toBeUndefined();
        expect(tokens.at(-1)?.type).toBe("plain");
        expect(joined(tokens)).toBe(source);
    });

    it("空字符串不产生 token", () => {
        expect(tokenizeJson("")).toEqual([]);
    });

    it("非法字符逐字保留", () => {
        const source = "{\n  #comment\n}";
        expect(joined(tokenizeJson(source))).toBe(source);
    });
});
