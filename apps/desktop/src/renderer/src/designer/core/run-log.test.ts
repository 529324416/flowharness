import { describe, expect, it } from "vitest";
import type { RunEventDto, RunSnapshot } from "@flowharness/contracts";
import type { DesignerProblem } from "./problems";
import { buildRunLogRows } from "./run-log";

const validationProblem: DesignerProblem = {
    id: "validation:missing-port:0:0",
    severity: "error",
    source: "validation",
    message: "端口缺失",
    nodeId: "output",
};

const edgeProblem: DesignerProblem = {
    id: "edge:constant:value->output:missing",
    severity: "warning",
    source: "edge",
    message: "失效连线",
    edgeId: "constant:value->output:missing",
};

function snapshot(
    status: RunSnapshot["status"],
    error?: string,
): RunSnapshot {
    return {
        runId: "run_1",
        graphId: "graph_1",
        status,
        startedAt: 1,
        ...(error === undefined ? {} : { error }),
    };
}

describe("run log rows", () => {
    it("puts pre-run problems before the event stream", () => {
        const events: RunEventDto[] = [
            { type: "run:start", runId: "run_1", graphId: "graph_1", at: 1 },
        ];

        const rows = buildRunLogRows([validationProblem, edgeProblem], events, null);

        expect(rows.slice(0, 2)).toEqual([
            { kind: "problem", problem: validationProblem },
            { kind: "problem", problem: edgeProblem },
        ]);
        expect(rows[2]).toEqual({ kind: "event", event: events[0] });
    });

    it("turns a node error into one problem row instead of duplicating it", () => {
        const events: RunEventDto[] = [
            { type: "node:start", runId: "run_1", nodeId: "a", at: 1 },
            { type: "node:error", runId: "run_1", nodeId: "a", message: "boom", at: 2 },
            { type: "run:end", runId: "run_1", status: "failed", outputs: {}, at: 3 },
        ];

        const rows = buildRunLogRows([], events, snapshot("failed", "boom"));

        expect(rows).toHaveLength(3);
        expect(rows[1]).toEqual({
            kind: "problem",
            problem: {
                id: "run:node:a:1",
                severity: "error",
                source: "run",
                message: "boom",
                nodeId: "a",
            },
        });
        // 有节点错误时不再追加图级失败行。
        expect(rows.filter((row) => row.kind === "problem")).toHaveLength(1);
    });

    it("appends a graph-level failure when no node error exists", () => {
        const events: RunEventDto[] = [
            { type: "run:start", runId: "run_1", graphId: "graph_1", at: 1 },
            { type: "run:end", runId: "run_1", status: "failed", outputs: {}, at: 2 },
        ];

        const rows = buildRunLogRows([], events, snapshot("failed", "run failed"));
        const last = rows.at(-1);

        expect(last).toEqual({
            kind: "problem",
            problem: {
                id: "run:failed:run_1",
                severity: "error",
                source: "run",
                message: "run failed",
            },
        });
    });

    it("keeps pre-run problems and only the latest events when the limit is hit", () => {
        const events: RunEventDto[] = Array.from({ length: 5 }, (_, index) => ({
            type: "node:start" as const,
            runId: "run_1",
            nodeId: `n${String(index)}`,
            at: index,
        }));

        const rows = buildRunLogRows([validationProblem], events, null, 2);

        expect(rows).toHaveLength(3);
        expect(rows[0]).toEqual({ kind: "problem", problem: validationProblem });
        expect(rows[1]).toEqual({ kind: "event", event: events[3] });
        expect(rows[2]).toEqual({ kind: "event", event: events[4] });
    });

    it("ignores successful and cancelled runs", () => {
        expect(buildRunLogRows([], [], snapshot("completed"))).toEqual([]);
        expect(buildRunLogRows([], [], snapshot("cancelled"))).toEqual([]);
    });
});
