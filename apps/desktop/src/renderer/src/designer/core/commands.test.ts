import { describe, expect, it } from "vitest";
import type { GraphDocument } from "wireclaw";
import {
    addNode,
    applyCanvasCommand,
    copyNodes,
    createNodeId,
    nextNodePosition,
    pasteNodes,
    updateNodeConfig,
} from "./commands";

function makeGraph(): GraphDocument {
    return {
        version: 1,
        id: "graph-test",
        metadata: { keep: true },
        parameters: [{ name: "topic", type: "string" }],
        events: [{ name: "progress" }],
        toolSet: { include: ["search"] },
        nodes: [
            {
                id: "n1",
                type: "core.constant",
                typeVersion: 1,
                config: { value: { type: "text", text: "hi" } },
                requires: [{ kind: "parameter", name: "topic" }],
                ui: { x: 10, y: 20, note: "keep" },
            },
            {
                id: "n2",
                type: "core.output",
                typeVersion: 1,
                ui: { x: 300, y: 20 },
            },
        ],
        edges: [
            {
                from: { nodeId: "n1", port: "value" },
                to: { nodeId: "n2", port: "text" },
            },
        ],
    };
}

describe("copy / paste nodes", () => {
    it("copies only the selected nodes and their internal edges", () => {
        const graph = makeGraph();
        const clipboard = copyNodes(graph, ["n1"]);

        expect(clipboard?.nodes.map((node) => node.id)).toEqual(["n1"]);
        expect(clipboard?.edges).toEqual([]);

        const full = copyNodes(graph, ["n1", "n2"]);
        expect(full?.edges).toHaveLength(1);
        expect(copyNodes(graph, [])).toBeNull();
    });

    it("remaps ids, offsets positions and keeps config", () => {
        const graph = makeGraph();
        const clipboard = copyNodes(graph, ["n1", "n2"]);
        expect(clipboard).not.toBeNull();

        let next = 0;
        const result = pasteNodes(graph, clipboard!, {
            idFactory: () => `copy-${String(next++)}`,
        });

        expect(result.nodeIds).toEqual(["copy-0", "copy-1"]);
        expect(result.graph.nodes).toHaveLength(4);
        expect(result.graph.edges).toHaveLength(2);

        const pasted = result.graph.nodes[2]!;
        expect(pasted.id).toBe("copy-0");
        expect(pasted.ui).toMatchObject({ x: 58, y: 68, note: "keep" });
        expect(pasted.config).toEqual(graph.nodes[0]?.config);

        const pastedEdge = result.graph.edges[1]!;
        expect(pastedEdge.from.nodeId).toBe("copy-0");
        expect(pastedEdge.to.nodeId).toBe("copy-1");
    });

    it("does not mutate the original graph", () => {
        const graph = makeGraph();
        const snapshot = structuredClone(graph);
        const clipboard = copyNodes(graph, ["n1", "n2"]);
        pasteNodes(graph, clipboard!, { idFactory: () => createNodeId(graph) });

        expect(graph).toEqual(snapshot);
    });
});

describe("applyCanvasCommand", () => {
    it("moves nodes and preserves untouched document fields", () => {
        const graph = makeGraph();
        const next = applyCanvasCommand(graph, {
            type: "moveNodes",
            positions: [{ nodeId: "n1", position: { x: 50, y: 60 } }],
        });

        expect(next).not.toBe(graph);
        expect(next.nodes[0]?.ui).toEqual({ x: 50, y: 60, note: "keep" });
        expect(next.nodes[0]?.config).toEqual(graph.nodes[0]?.config);
        expect(next.nodes[0]?.requires).toEqual(graph.nodes[0]?.requires);
        expect(next.metadata).toEqual({ keep: true });
        expect(next.parameters).toEqual(graph.parameters);
        expect(next.events).toEqual(graph.events);
        expect(next.toolSet).toEqual(graph.toolSet);
    });

    it("removes nodes together with their edges", () => {
        const next = applyCanvasCommand(makeGraph(), {
            type: "removeNodes",
            nodeIds: ["n2"],
        });

        expect(next.nodes.map((node) => node.id)).toEqual(["n1"]);
        expect(next.edges).toEqual([]);
    });

    it("connects once and ignores duplicate edges", () => {
        const graph = makeGraph();
        const duplicate = applyCanvasCommand(graph, {
            type: "connect",
            from: { nodeId: "n1", port: "value" },
            to: { nodeId: "n2", port: "text" },
        });
        expect(duplicate).toBe(graph);

        const next = applyCanvasCommand(graph, {
            type: "connect",
            from: { nodeId: "n2", port: "out" },
            to: { nodeId: "n1", port: "in" },
        });
        expect(next.edges).toHaveLength(2);
        expect(next.edges[1]).toEqual({
            from: { nodeId: "n2", port: "out" },
            to: { nodeId: "n1", port: "in" },
        });
    });

    it("ignores connections to unknown nodes", () => {
        const graph = makeGraph();
        const next = applyCanvasCommand(graph, {
            type: "connect",
            from: { nodeId: "missing", port: "out" },
            to: { nodeId: "n2", port: "in" },
        });
        expect(next).toBe(graph);
    });

    it("disconnects by port address and is idempotent", () => {
        const graph = makeGraph();
        const next = applyCanvasCommand(graph, {
            type: "disconnect",
            from: { nodeId: "n1", port: "value" },
            to: { nodeId: "n2", port: "text" },
        });
        expect(next.edges).toEqual([]);

        const again = applyCanvasCommand(next, {
            type: "disconnect",
            from: { nodeId: "n1", port: "value" },
            to: { nodeId: "n2", port: "text" },
        });
        expect(again).toBe(next);
    });

    it("appends a node with layout while preserving the graph", () => {
        const graph = makeGraph();
        const next = addNode(graph, {
            id: "n3",
            type: "core.constant",
            typeVersion: 1,
            position: { x: 40, y: 80 },
            config: { value: { type: "text", text: "new" } },
        });

        expect(next).not.toBe(graph);
        expect(next.nodes).toHaveLength(3);
        expect(next.nodes[2]).toEqual({
            id: "n3",
            type: "core.constant",
            typeVersion: 1,
            config: { value: { type: "text", text: "new" } },
            ui: { x: 40, y: 80 },
        });
        expect(next.metadata).toEqual({ keep: true });
        expect(next.edges).toEqual(graph.edges);

        expect(
            addNode(next, {
                id: "n3",
                type: "core.output",
                typeVersion: 1,
                position: { x: 0, y: 0 },
            }),
        ).toBe(next);
    });

    it("creates unique node ids and cascade positions", () => {
        const graph = makeGraph();
        const id = createNodeId(graph);
        expect(id).toMatch(/^node_[a-f0-9]{8}$/);
        expect(graph.nodes.some((node) => node.id === id)).toBe(false);

        expect(nextNodePosition(graph)).toEqual({ x: 120, y: 340 });
    });

    it("updates the viewport without dropping other graph ui keys", () => {
        const graph: GraphDocument = {
            ...makeGraph(),
            ui: { theme: "keep", viewport: { x: 0, y: 0, zoom: 1 } },
        };

        const next = applyCanvasCommand(graph, {
            type: "setViewport",
            viewport: { x: 12, y: 24, zoom: 1.5 },
        });

        expect(next.ui).toEqual({
            theme: "keep",
            viewport: { x: 12, y: 24, zoom: 1.5 },
        });
        expect(next.nodes).toBe(graph.nodes);
    });

    it("updates only the selected node config", () => {
        const graph = makeGraph();
        const next = updateNodeConfig(graph, "n1", {
            value: { type: "text", text: "edited" },
        });

        expect(next).not.toBe(graph);
        expect(next.nodes[0]?.config).toEqual({
            value: { type: "text", text: "edited" },
        });
        expect(next.nodes[0]?.requires).toEqual(graph.nodes[0]?.requires);
        expect(next.nodes[1]).toBe(graph.nodes[1]);

        expect(updateNodeConfig(graph, "missing", {})).toBe(graph);
    });
});
