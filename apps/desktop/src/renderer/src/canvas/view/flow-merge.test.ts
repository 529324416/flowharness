import { describe, expect, it } from "vitest";
import type { CanvasDocument } from "../core/types";
import type { FlowNode } from "./flow-types";
import { edgeSignature, mergeFlowNodes } from "./flow-merge";

function node(
    id: string,
    data: Record<string, unknown>,
    extra: Record<string, unknown> = {},
): FlowNode {
    return {
        id,
        type: "core.constant",
        position: { x: 0, y: 0 },
        data,
        ...extra,
    } as unknown as FlowNode;
}

describe("flow merge", () => {
    it("keeps react-flow node internals while updating the projection", () => {
        const measured = { width: 220, height: 120 };
        const internals = { handleBounds: { source: [], target: [] } };
        const previous = [
            node("a", { status: "running" }, { measured, internals, selected: false }),
        ];
        const next = [
            node(
                "a",
                { status: "completed" },
                { selected: true, position: { x: 10, y: 20 } },
            ),
        ];

        const merged = mergeFlowNodes(previous, next);
        const mergedExtra = merged[0] as unknown as {
            measured?: unknown;
            internals?: unknown;
        };

        expect(mergedExtra.measured).toBe(measured);
        expect(mergedExtra.internals).toBe(internals);
        expect(merged[0]?.data).toBe(next[0]?.data);
        expect(merged[0]?.position).toEqual({ x: 10, y: 20 });
        expect(merged[0]?.selected).toBe(true);
    });

    it("drops removed nodes and keeps new nodes untouched", () => {
        const previous = [node("a", {}), node("b", {})];
        const fresh = node("c", {});

        const merged = mergeFlowNodes(previous, [node("b", { value: 2 }), fresh]);

        expect(merged.map((item) => item.id)).toEqual(["b", "c"]);
        expect(merged[1]).toBe(fresh);
    });

    it("rebuilds edges only when ids or statuses change", () => {
        const document = (status: "idle" | "active" | "error"): CanvasDocument => ({
            nodes: [],
            edges: [
                {
                    id: "a->b",
                    source: { nodeId: "a", port: "out" },
                    target: { nodeId: "b", port: "in" },
                    status,
                },
            ],
            viewport: { x: 0, y: 0, zoom: 1 },
        });

        expect(edgeSignature(document("idle"))).toBe(edgeSignature(document("idle")));
        expect(edgeSignature(document("active"))).not.toBe(
            edgeSignature(document("idle")),
        );
        expect(edgeSignature(document("error"))).not.toBe(
            edgeSignature(document("active")),
        );
    });
});
