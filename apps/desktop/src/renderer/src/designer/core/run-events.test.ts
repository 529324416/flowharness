import { describe, expect, it } from "vitest";
import type { RunEventDto } from "@flowharness/contracts";
import type { GraphDocument } from "wireclaw";
import {
    applyRunEvents,
    applyRunEventsToView,
    createRunView,
    initNodeStatuses,
} from "./run-events";

const graph: GraphDocument = {
    version: 1,
    id: "g",
    nodes: [
        { id: "a", type: "core.constant", typeVersion: 1 },
        { id: "b", type: "core.output", typeVersion: 1 },
    ],
    edges: [],
};

function event(value: RunEventDto): RunEventDto {
    return value;
}

describe("designer run event projection", () => {
    it("initializes every graph node as idle", () => {
        expect(initNodeStatuses(graph)).toEqual({ a: "idle", b: "idle" });
    });

    it("maps node lifecycle events to canvas statuses", () => {
        const statuses = applyRunEvents(initNodeStatuses(graph), [
            event({ type: "node:start", runId: "run", nodeId: "a", at: 1 }),
            event({
                type: "node:end",
                runId: "run",
                nodeId: "a",
                outputs: {},
                at: 2,
            }),
            event({ type: "node:start", runId: "run", nodeId: "b", at: 3 }),
            event({ type: "node:error", runId: "run", nodeId: "b", message: "boom", at: 4 }),
        ]);

        expect(statuses).toEqual({ a: "completed", b: "failed" });
    });

    it("marks running nodes failed when the run fails, idle when cancelled", () => {
        const running = { a: "running", b: "running" } as const;

        expect(
            applyRunEvents(running, [
                event({
                    type: "run:end",
                    runId: "run",
                    status: "failed",
                    outputs: {},
                    at: 1,
                }),
            ]),
        ).toEqual({ a: "failed", b: "failed" });

        expect(
            applyRunEvents(running, [
                event({
                    type: "run:end",
                    runId: "run",
                    status: "cancelled",
                    outputs: {},
                    at: 1,
                }),
            ]),
        ).toEqual({ a: "idle", b: "idle" });

        // 暂停中取消也不能留下 paused。
        expect(
            applyRunEvents({ a: "paused", b: "paused" }, [
                event({
                    type: "run:end",
                    runId: "run",
                    status: "cancelled",
                    outputs: {},
                    at: 2,
                }),
            ]),
        ).toEqual({ a: "idle", b: "idle" });
    });

    it("tracks paused / resumed and skipped", () => {
        const statuses = applyRunEvents({ a: "running", b: "running" }, [
            event({ type: "run:paused", runId: "run", at: 1 }),
            event({ type: "node:skipped", runId: "run", nodeId: "b", at: 2 }),
            event({ type: "run:resumed", runId: "run", at: 3 }),
        ]);

        expect(statuses).toEqual({ a: "running", b: "skipped" });
    });
});

const wiredGraph: GraphDocument = {
    version: 1,
    id: "wired",
    nodes: [
        { id: "a", type: "core.constant", typeVersion: 1 },
        { id: "b", type: "core.output", typeVersion: 1 },
    ],
    edges: [
        {
            from: { nodeId: "a", port: "value" },
            to: { nodeId: "b", port: "text" },
        },
    ],
};

const edgeId = "a:value->b:text";

describe("designer run edge projection", () => {
    it("initializes nodes and edges as idle", () => {
        expect(createRunView(wiredGraph)).toEqual({
            nodeStatuses: { a: "idle", b: "idle" },
            edgeStatuses: { [edgeId]: "idle" },
        });
    });

    it("activates incoming and outgoing edges across node lifecycle", () => {
        let view = createRunView(wiredGraph);

        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:start", runId: "run", nodeId: "a", at: 1 }),
        ]);
        expect(view.nodeStatuses.a).toBe("running");
        // 节点执行中还没有产出，出边保持 idle。
        expect(view.edgeStatuses[edgeId]).toBe("idle");

        view = applyRunEventsToView(wiredGraph, view, [
            event({
                type: "node:end",
                runId: "run",
                nodeId: "a",
                outputs: {},
                at: 2,
            }),
        ]);
        expect(view.nodeStatuses.a).toBe("completed");
        expect(view.edgeStatuses[edgeId]).toBe("active");

        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:start", runId: "run", nodeId: "b", at: 3 }),
            event({ type: "node:end", runId: "run", nodeId: "b", outputs: {}, at: 4 }),
        ]);
        expect(view.edgeStatuses[edgeId]).toBe("idle");

        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "run:end", runId: "run", status: "completed", outputs: {}, at: 5 }),
        ]);
        expect(view.edgeStatuses[edgeId]).toBe("idle");
    });

    it("marks connected edges failed and keeps them after a failed run", () => {
        let view = createRunView(wiredGraph);
        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:start", runId: "run", nodeId: "a", at: 1 }),
            event({ type: "node:error", runId: "run", nodeId: "b", message: "boom", at: 2 }),
        ]);

        expect(view.nodeStatuses.b).toBe("failed");
        expect(view.edgeStatuses[edgeId]).toBe("error");

        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "run:end", runId: "run", status: "failed", outputs: {}, at: 3 }),
        ]);
        expect(view.edgeStatuses[edgeId]).toBe("error");
    });

    it("clears active edges when a run is cancelled", () => {
        let view = createRunView(wiredGraph);
        view = applyRunEventsToView(wiredGraph, view, [
            event({
                type: "node:end",
                runId: "run",
                nodeId: "a",
                outputs: {},
                at: 1,
            }),
        ]);
        expect(view.edgeStatuses[edgeId]).toBe("active");

        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "run:end", runId: "run", status: "cancelled", outputs: {}, at: 2 }),
        ]);
        expect(view.edgeStatuses[edgeId]).toBe("idle");
    });

    it("keeps the same view object when stream events do not change status", () => {
        let view = createRunView(wiredGraph);
        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:start", runId: "run", nodeId: "a", at: 1 }),
        ]);

        const afterStream = applyRunEventsToView(wiredGraph, view, [
            event({
                type: "node:stream",
                runId: "run",
                nodeId: "a",
                port: "text",
                chunk: "he",
                at: 2,
            }),
            event({
                type: "node:stream",
                runId: "run",
                nodeId: "a",
                port: "text",
                chunk: "llo",
                at: 3,
            }),
        ]);

        expect(afterStream).toBe(view);
    });
});
