import { describe, expect, it } from "vitest";
import type { GraphDocument } from "wireclaw";
import { toCanvasDocument } from "./adapter";

function makeGraph(): GraphDocument {
    return {
        version: 1,
        id: "graph-test",
        title: "Test Graph",
        metadata: { keep: true },
        parameters: [{ name: "topic", type: "string", required: true }],
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
            },
            {
                id: "n3",
                type: "core.unknown",
                typeVersion: 1,
                ui: { x: 300, y: 400 },
            },
        ],
        edges: [
            {
                from: { nodeId: "n1", port: "value" },
                to: { nodeId: "n2", port: "text" },
            },
        ],
        ui: {
            viewport: { x: 5, y: 6, zoom: 0.5 },
            theme: "keep",
        },
    };
}

describe("toCanvasDocument", () => {
    it("projects nodes, ports, layout, viewport and edges", () => {
        const document = toCanvasDocument(makeGraph());

        expect(document.nodes.map((node) => node.id)).toEqual(["n1", "n2", "n3"]);
        expect(document.nodes[0]?.position).toEqual({ x: 10, y: 20 });
        expect(document.nodes[0]?.data.title).toBe("Constant");
        expect(document.nodes[0]?.data.outputs.map((port) => port.name)).toContain(
            "value",
        );
        expect(document.nodes[1]?.position).toEqual({ x: 360, y: 80 });
        expect(document.viewport).toEqual({ x: 5, y: 6, zoom: 0.5 });

        expect(document.edges).toHaveLength(1);
        expect(document.edges[0]?.id).toBe("n1:value->n2:text");
        expect(document.edges[0]?.source).toEqual({ nodeId: "n1", port: "value" });
        expect(document.edges[0]?.status).toBe("idle");
    });

    it("degrades an unknown node type instead of throwing", () => {
        const document = toCanvasDocument(makeGraph());
        const unknown = document.nodes[2]!;

        expect(unknown.kind).toBe("core.unknown");
        expect(unknown.data.title).toBe("core.unknown");
        expect(unknown.data.error).toBeTruthy();
        expect(unknown.data.inputs).toEqual([]);
        expect(unknown.data.outputs).toEqual([]);
    });

    it("applies runtime status and presentation overrides", () => {
        const document = toCanvasDocument(makeGraph(), {
            statuses: { n1: "running" },
            edgeStatuses: { "n1:value->n2:text": "active" },
            presentation: { n1: { summary: "custom summary", meta: "custom" } },
        });

        expect(document.nodes[0]?.data.status).toBe("running");
        expect(document.nodes[0]?.data.summary).toBe("custom summary");
        expect(document.nodes[0]?.data.meta).toBe("custom");
        expect(document.edges[0]?.status).toBe("active");
    });

    it("exposes config and derives a default summary", () => {
        const document = toCanvasDocument(makeGraph());

        expect(document.nodes[0]?.data.config).toEqual({
            value: { type: "text", text: "hi" },
        });
        expect(document.nodes[0]?.data.summary).toBe("value");
    });
});
