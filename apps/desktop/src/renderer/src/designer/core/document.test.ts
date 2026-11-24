import { describe, expect, it } from "vitest";
import {
    MAIN_GRAPH_REF,
    MAIN_GRAPH_TEMPLATE,
    cloneMainGraphTemplate,
    isGraphDocument,
    parseGraphDocument,
} from "./document";

describe("designer document contract", () => {
    it("uses the stable main document ref", () => {
        expect(MAIN_GRAPH_REF).toEqual({ kind: "harness", id: "main" });
    });

    it("provides a runnable Constant → Output template", () => {
        expect(isGraphDocument(MAIN_GRAPH_TEMPLATE)).toBe(true);
        expect(MAIN_GRAPH_TEMPLATE.nodes.map((node) => node.type)).toEqual([
            "core.constant",
            "core.output",
        ]);
        expect(MAIN_GRAPH_TEMPLATE.edges).toEqual([
            {
                from: { nodeId: "constant", port: "value" },
                to: { nodeId: "output", port: "text" },
            },
        ]);
    });

    it("clones the template without sharing references", () => {
        const clone = cloneMainGraphTemplate();
        expect(clone).toEqual(MAIN_GRAPH_TEMPLATE);
        expect(clone).not.toBe(MAIN_GRAPH_TEMPLATE);
        expect(clone.nodes).not.toBe(MAIN_GRAPH_TEMPLATE.nodes);
    });

    it("rejects structurally invalid documents", () => {
        expect(isGraphDocument(null)).toBe(false);
        expect(isGraphDocument({})).toBe(false);
        expect(isGraphDocument({ ...MAIN_GRAPH_TEMPLATE, version: 99 })).toBe(false);
        expect(
            isGraphDocument({
                ...MAIN_GRAPH_TEMPLATE,
                nodes: [{ id: "n", type: "core.output" }],
            }),
        ).toBe(false);
        expect(
            isGraphDocument({
                ...MAIN_GRAPH_TEMPLATE,
                edges: [{ from: { nodeId: "a" }, to: { nodeId: "b", port: "in" } }],
            }),
        ).toBe(false);
        expect(() => parseGraphDocument({})).toThrow("GraphDocument");
    });
});
