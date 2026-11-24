import { describe, expect, it } from "vitest";
import type { GraphDocument } from "wireclaw";
import { cloneMainGraphTemplate } from "./document";
import { findInvalidEdges } from "./edges";

describe("findInvalidEdges", () => {
    it("accepts the default Constant → Output template", () => {
        expect(findInvalidEdges(cloneMainGraphTemplate())).toEqual([]);
    });

    it("reports a port that no longer exists on the source node", () => {
        const graph = cloneMainGraphTemplate();
        graph.edges[0]!.from.port = "missing";
        const issues = findInvalidEdges(graph);

        expect(issues).toHaveLength(1);
        expect(issues[0]?.id).toBe("constant:missing->output:text");
        expect(issues[0]?.message).toContain("起点端口不存在");
    });

    it("reports missing nodes on either side", () => {
        const graph = cloneMainGraphTemplate();
        graph.nodes = graph.nodes.filter((node) => node.id !== "output");
        const issues = findInvalidEdges(graph);

        expect(issues).toHaveLength(1);
        expect(issues[0]?.message).toContain("终点节点不存在");
    });

    it("reports unknown node types instead of throwing", () => {
        const graph = cloneMainGraphTemplate() as GraphDocument;
        graph.nodes = graph.nodes.map((node) =>
            node.id === "constant" ? { ...node, type: "core.unknown" } : node,
        );

        const issues = findInvalidEdges(graph);
        expect(issues).toHaveLength(1);
        expect(issues[0]?.message).toContain("起点类型无法解析");
    });
});
