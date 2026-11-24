import { describe, expect, it } from "vitest";
import type { CanvasNode } from "./types";
import { addEdgeUnique, moveNode, removeNodes } from "./commands";
import { edgeKey } from "./edge-key";

const edge = (id: string, source: string, target: string) => ({
    id,
    source,
    target,
    sourceHandle: "out",
    targetHandle: "in",
    type: "sciFi",
    data: { status: "idle" as const },
});

const node = (id: string): CanvasNode => ({
    id,
    type: "core.input",
    position: { x: 0, y: 0 },
    data: {
        kind: "core.input",
        title: id,
        status: "idle",
    },
});

describe("canvas commands", () => {
    it("deduplicates edges by stable port key", () => {
        const first = edge("a", "input", "model");
        const duplicate = edge("b", "input", "model");
        const other = edge("c", "model", "output");
        expect(edgeKey(first)).toBe("input:out->model:in");
        expect(addEdgeUnique([first], duplicate)).toEqual([first]);
        expect(addEdgeUnique([first], other)).toHaveLength(2);
    });

    it("removes nodes together with their edges", () => {
        const nodes = [node("a"), node("b")];
        const edges = [edge("e1", "a", "b"), edge("e2", "a", "c")];
        const result = removeNodes(nodes, edges, ["b"]);
        expect(result.nodes.map((item) => item.id)).toEqual(["a"]);
        expect(result.edges.map((item) => item.id)).toEqual(["e2"]);
    });

    it("moves a single node", () => {
        const nodes = [node("a"), node("b")];
        nodes[1] = { ...nodes[1], position: { x: 10, y: 10 } };
        const moved = moveNode(nodes, "a", { x: 40, y: 60 });
        expect(moved[0]?.position).toEqual({ x: 40, y: 60 });
        expect(moved[1]?.position).toEqual({ x: 10, y: 10 });
    });
});
