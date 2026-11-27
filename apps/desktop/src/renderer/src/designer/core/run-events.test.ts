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
    it("initializes nodes, edges and metrics as idle", () => {
        expect(createRunView(wiredGraph)).toEqual({
            nodeStatuses: { a: "idle", b: "idle" },
            edgeStatuses: { [edgeId]: "idle" },
            nodeMetrics: {},
        });
    });

    it("animates the outgoing edge only while the source streams", () => {
        let view = createRunView(wiredGraph);

        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:start", runId: "run", nodeId: "a", at: 1 }),
        ]);
        expect(view.nodeStatuses.a).toBe("running");
        // 节点开始执行时数据已经送达，入边（这里是出边的另一端）不流动。
        expect(view.edgeStatuses[edgeId]).toBe("idle");

        view = applyRunEventsToView(wiredGraph, view, [
            event({
                type: "node:stream",
                runId: "run",
                nodeId: "a",
                port: "text",
                chunk: { type: "text", text: "he" },
                at: 2,
            }),
            event({
                type: "node:stream",
                runId: "run",
                nodeId: "a",
                port: "text",
                chunk: { type: "text", text: "llo" },
                at: 3,
            }),
        ]);
        expect(view.edgeStatuses[edgeId]).toBe("active");
        expect(view.nodeMetrics.a).toEqual({
            startedAt: 1,
            tokens: 2,
            tail: "hello",
        });

        view = applyRunEventsToView(wiredGraph, view, [
            event({
                type: "node:end",
                runId: "run",
                nodeId: "a",
                outputs: {},
                at: 4,
            }),
        ]);
        expect(view.nodeStatuses.a).toBe("completed");
        // 输出结束，连线动画立即停止。
        expect(view.edgeStatuses[edgeId]).toBe("idle");
    });

    it("does not animate edges when a node starts without streaming", () => {
        let view = createRunView(wiredGraph);
        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:start", runId: "run", nodeId: "a", at: 1 }),
            event({
                type: "node:end",
                runId: "run",
                nodeId: "a",
                outputs: {},
                at: 2,
            }),
            event({ type: "node:start", runId: "run", nodeId: "b", at: 3 }),
        ]);

        expect(view.nodeStatuses.b).toBe("running");
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

    it("clears active edges and metrics when a run is cancelled", () => {
        let view = createRunView(wiredGraph);
        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:start", runId: "run", nodeId: "a", at: 1 }),
            event({
                type: "node:stream",
                runId: "run",
                nodeId: "a",
                port: "text",
                chunk: "x",
                at: 2,
            }),
        ]);
        expect(view.edgeStatuses[edgeId]).toBe("active");

        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "run:end", runId: "run", status: "cancelled", outputs: {}, at: 3 }),
        ]);
        expect(view.edgeStatuses[edgeId]).toBe("idle");
        expect(view.nodeMetrics).toEqual({});
    });

    it("keeps the same view object when events change nothing", () => {
        let view = createRunView(wiredGraph);
        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:skipped", runId: "run", nodeId: "a", at: 1 }),
        ]);

        const repeated = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:skipped", runId: "run", nodeId: "a", at: 2 }),
        ]);
        expect(repeated).toBe(view);
    });

    it("resets metrics on start and keeps the tail capped", () => {
        let view = createRunView(wiredGraph);
        view = applyRunEventsToView(wiredGraph, view, [
            event({ type: "node:start", runId: "run", nodeId: "a", at: 10 }),
            event({
                type: "node:stream",
                runId: "run",
                nodeId: "a",
                port: "text",
                chunk: "x".repeat(300),
                at: 11,
            }),        ]);

        expect(view.nodeMetrics.a?.tokens).toBe(1);
        expect(view.nodeMetrics.a?.startedAt).toBe(10);
        expect(view.nodeMetrics.a?.tail).toHaveLength(240);
    });
});
