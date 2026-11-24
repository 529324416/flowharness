import { describe, expect, it } from "vitest";
import { cloneMainGraphTemplate } from "./document";
import {
    importDocumentTitle,
    parseHarnessJson,
    serializeHarnessJson,
    withDocumentTitle,
} from "./harness-json";

describe("harness JSON import / export", () => {
    it("parses a valid GraphDocument and rejects other JSON", () => {
        const graph = cloneMainGraphTemplate();
        const parsed = parseHarnessJson(JSON.stringify(graph));

        expect(parsed).toEqual(graph);
        expect(parseHarnessJson("not json")).toBeNull();
        expect(parseHarnessJson(JSON.stringify({ version: 99 }))).toBeNull();
    });

    it("overrides the document title without touching other fields", () => {
        const graph = cloneMainGraphTemplate();
        const renamed = withDocumentTitle(graph, "新标题");

        expect(renamed).toMatchObject({ id: "main", title: "新标题" });
        expect(withDocumentTitle("bad", "x")).toBeNull();
    });

    it("exports with layout by default and strips ui on request", () => {
        const graph = cloneMainGraphTemplate();
        graph.ui = { viewport: { x: 1, y: 2, zoom: 1 } };
        graph.nodes[0]!.ui = { x: 10, y: 20 };

        const withUi = serializeHarnessJson(graph, { stripUi: false });
        expect(withUi).not.toBeNull();
        expect(JSON.parse(withUi!)).toMatchObject({
            ui: { viewport: { x: 1, y: 2, zoom: 1 } },
        });

        const withoutUi = serializeHarnessJson(graph, { stripUi: true });
        const parsed = JSON.parse(withoutUi!) as {
            ui?: unknown;
            nodes: { ui?: unknown }[];
        };
        expect(parsed.ui).toBeUndefined();
        expect(parsed.nodes.every((node) => node.ui === undefined)).toBe(true);
    });

    it("suggests imported document titles", () => {
        expect(importDocumentTitle("workflow.json")).toBe("workflow");
        expect(importDocumentTitle("workflow.json", "原图")).toBe("原图（导入）");
        expect(importDocumentTitle(".json")).toBe("导入的图");
    });
});
