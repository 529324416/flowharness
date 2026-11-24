import { describe, expect, it } from "vitest";
import type { RunEventDto } from "@flowharness/contracts";
import type { GraphDocument } from "wireclaw";
import { applyRunEvents, initNodeStatuses } from "./run-events";

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
