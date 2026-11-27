import { describe, expect, it } from "vitest";
import {
    MAIN_GRAPH_REF,
    MAIN_GRAPH_TEMPLATE,
    cloneMainGraphTemplate,
    createDocumentId,
    createGraphTemplate,
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

    it("creates additional graph documents with their own id", () => {
        const graph = createGraphTemplate("graph-abc", "第二张图");
        expect(graph.id).toBe("graph-abc");
        expect(graph.title).toBe("第二张图");
        expect(isGraphDocument(graph)).toBe(true);
        expect(createDocumentId()).toMatch(/^graph_[a-f0-9]{8}$/);
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

    it("returns the same document when there is nothing to migrate", () => {
        expect(parseGraphDocument(MAIN_GRAPH_TEMPLATE)).toBe(MAIN_GRAPH_TEMPLATE);
    });

    it("migrates legacy Merge nodes to Filter, including embedded graphs", () => {
        const legacy = {
            ...MAIN_GRAPH_TEMPLATE,
            nodes: [
                { id: "merge", type: "core.merge", typeVersion: 1 },
                {
                    id: "loop",
                    type: "core.loop",
                    typeVersion: 1,
                    config: {
                        graph: {
                            version: 1,
                            id: "inner",
                            nodes: [
                                {
                                    id: "inner-merge",
                                    type: "core.merge",
                                    typeVersion: 1,
                                },
                            ],
                            edges: [],
                        },
                    },
                },
            ],
            edges: [],
        };

        const parsed = parseGraphDocument(legacy);
        expect(parsed.nodes[0]?.type).toBe("core.filter");

        const loopConfig = parsed.nodes[1]?.config as {
            graph: { nodes: { type: string }[] };
        };
        expect(loopConfig.graph.nodes[0]?.type).toBe("core.filter");
        expect(JSON.stringify(parsed)).not.toContain("core.merge");
    });
});
