import { describe, expect, it } from "vitest";
import type { GraphDocument } from "wireclaw";
import { MAIN_GRAPH_TEMPLATE } from "./document";
import { validateGraphDocument } from "./validate";

describe("designer graph validation", () => {
    it("accepts the default template", () => {
        expect(validateGraphDocument(MAIN_GRAPH_TEMPLATE)).toEqual([]);
    });

    it("reports edges that reference a missing node", () => {
        const graph: GraphDocument = {
            ...structuredClone(MAIN_GRAPH_TEMPLATE),
            edges: [
                {
                    from: { nodeId: "constant", port: "value" },
                    to: { nodeId: "missing", port: "text" },
                },
            ],
        };

        const issues = validateGraphDocument(graph);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.some((issue) => issue.message.includes("missing"))).toBe(true);
    });

    it("reports unknown node types as graph issues instead of throwing", () => {
        const graph: GraphDocument = {
            ...structuredClone(MAIN_GRAPH_TEMPLATE),
            nodes: [
                ...structuredClone(MAIN_GRAPH_TEMPLATE.nodes),
                { id: "unknown", type: "core.not-registered", typeVersion: 1 },
            ],
        };

        const issues = validateGraphDocument(graph);
        expect(issues.length).toBeGreaterThan(0);
    });

    it("reports duplicate node ids", () => {
        const graph: GraphDocument = {
            ...structuredClone(MAIN_GRAPH_TEMPLATE),
            nodes: [
                ...structuredClone(MAIN_GRAPH_TEMPLATE.nodes),
                { id: "constant", type: "core.constant", typeVersion: 1 },
            ],
        };

        const issues = validateGraphDocument(graph);
        expect(issues.some((issue) => issue.code === "duplicate_node_id")).toBe(true);
    });

    it("recursively validates an embedded subgraph", () => {
        const graph: GraphDocument = {
            version: 1,
            id: "outer",
            nodes: [
                {
                    id: "sub",
                    type: "core.subgraph",
                    typeVersion: 1,
                    config: {
                        graph: {
                            version: 1,
                            id: "inner",
                            nodes: [
                                { id: "constant", type: "core.constant", typeVersion: 1 },
                                { id: "output", type: "core.output", typeVersion: 1 },
                            ],
                            edges: [
                                {
                                    from: { nodeId: "constant", port: "value" },
                                    to: { nodeId: "output", port: "missing" },
                                },
                            ],
                        },
                    },
                },
            ],
            edges: [],
        };

        const issues = validateGraphDocument(graph);
        const nested = issues.find((issue) => issue.graphPath !== undefined);

        expect(nested).toBeDefined();
        expect(nested?.nodeId).toBe("sub");
        expect(nested?.graphPath).toBe("subgraph.sub");
        expect(nested?.nestedNodeId).toBe("output");
    });
});
