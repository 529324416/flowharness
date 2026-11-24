import { describe, expect, it } from "vitest";
import type { RunEventDto, RunSnapshot } from "@flowharness/contracts";
import type { GraphDocument, JsonValue } from "wireclaw";
import { cloneMainGraphTemplate, MAIN_GRAPH_TEMPLATE } from "./document";
import {
    collectDesignerProblems,
    collectRunProblems,
} from "./problems";

describe("designer problems", () => {
    it("reports nothing for the default template", () => {
        expect(collectDesignerProblems(MAIN_GRAPH_TEMPLATE)).toEqual([]);
    });

    it("locates a broken edge by stable edge id and node", () => {
        const graph = cloneMainGraphTemplate();
        graph.edges[0]!.to.port = "missing";

        const problems = collectDesignerProblems(graph);
        const broken = problems.find(
            (problem) => problem.edgeId === "constant:value->output:missing",
        );

        expect(broken).toBeDefined();
        expect(broken?.severity).toBe("error");
        expect(broken?.nodeId).toBe("output");
        expect(broken?.port).toBe("missing");
        // 校验问题已覆盖该边，不再追加失效连线警告。
        expect(
            problems.filter(
                (problem) => problem.edgeId === "constant:value->output:missing",
            ),
        ).toHaveLength(1);
    });

    it("keeps a graph-level issue when the document cannot be deserialized", () => {
        const graph = cloneMainGraphTemplate();
        graph.nodes.push({
            id: "ghost",
            type: "core.not-registered",
            typeVersion: 1,
        });

        const problems = collectDesignerProblems(graph);
        expect(problems.length).toBeGreaterThan(0);
        expect(problems[0]?.source).toBe("validation");
    });

    it("carries nested graph path and container node for embedded issues", () => {
        const inner: JsonValue = {
            version: 1,
            id: "inner",
            nodes: [
                {
                    id: "innerConstant",
                    type: "core.constant",
                    typeVersion: 1,
                    config: { value: { type: "text", text: "x" } },
                },
                { id: "innerOutput", type: "core.output", typeVersion: 1 },
            ],
            edges: [
                {
                    from: { nodeId: "innerConstant", port: "value" },
                    to: { nodeId: "innerOutput", port: "missing" },
                },
            ],
        };

        const graph: GraphDocument = {
            version: 1,
            id: "outer",
            nodes: [
                {
                    id: "sub",
                    type: "core.subgraph",
                    typeVersion: 1,
                    config: { graph: inner },
                },
            ],
            edges: [],
        };

        const problem = collectDesignerProblems(graph).find(
            (candidate) => candidate.graphPath !== undefined,
        );

        expect(problem).toBeDefined();
        expect(problem?.nodeId).toBe("sub");
        expect(problem?.graphPath).toBe("subgraph.sub");
        expect(problem?.nestedNodeId).toBe("innerOutput");
        expect(problem?.message).toContain("内嵌图");
    });
});

describe("run problems", () => {
    const snapshot = (status: RunSnapshot["status"], error?: string): RunSnapshot => ({
        runId: "run_1",
        graphId: "main",
        status,
        startedAt: 1,
        ...(error === undefined ? {} : { error }),
    });

    it("projects node errors to selectable problems", () => {
        const events: RunEventDto[] = [
            { type: "node:error", runId: "run_1", nodeId: "a", message: "boom", at: 2 },
        ];

        expect(collectRunProblems(events, snapshot("failed", "run failed"))).toEqual([
            {
                id: "run:node:a:0",
                severity: "error",
                source: "run",
                message: "boom",
                nodeId: "a",
            },
        ]);
    });

    it("adds a graph-level failure when no node error exists", () => {
        const problems = collectRunProblems([], snapshot("failed", "run failed"));
        expect(problems).toHaveLength(1);
        expect(problems[0]?.nodeId).toBeUndefined();
        expect(problems[0]?.message).toBe("run failed");
    });

    it("ignores successful and cancelled runs", () => {
        expect(collectRunProblems([], snapshot("completed"))).toEqual([]);
        expect(collectRunProblems([], snapshot("cancelled"))).toEqual([]);
    });
});
