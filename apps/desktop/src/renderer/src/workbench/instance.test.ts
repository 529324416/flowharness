import { describe, expect, it } from "vitest";
import {
    createWorkbenchInstance,
    defaultWorkbenchTitle,
    isWorkbenchInstanceDocument,
    primaryGraphId,
    withPrimaryGraph,
} from "./instance";

describe("workbench instance document", () => {
    it("creates a schemaVersion 1 instance with a primary graph", () => {
        const instance = createWorkbenchInstance({
            id: "wb_test",
            type: "harness-designer",
            title: defaultWorkbenchTitle("harness-designer"),
            graphId: "main",
        });

        expect(instance.schemaVersion).toBe(1);
        expect(instance.type).toBe("harness-designer");
        expect(instance.title).toBe("主工作台");
        expect(defaultWorkbenchTitle("plan-runner")).toBe("批量运行");
        expect(instance.graphs).toEqual([{ graphId: "main", role: "main" }]);
        expect(instance.plan).toBeNull();
        expect(instance.mode).toBe("design");
        expect(instance.runId).toBeNull();
        expect(instance.sessionId).toBeNull();
        expect(isWorkbenchInstanceDocument(instance)).toBe(true);
    });

    it("accepts persisted run context and rejects invalid modes", () => {
        const instance = createWorkbenchInstance({
            id: "wb_test",
            type: "harness-designer",
            title: "主工作台",
            graphId: "main",
        });

        expect(
            isWorkbenchInstanceDocument({
                ...instance,
                mode: "run",
                runId: "run_1",
                sessionId: "ses_1",
            }),
        ).toBe(true);
        expect(
            isWorkbenchInstanceDocument({
                ...instance,
                mode: "paused",
            }),
        ).toBe(false);
        expect(
            isWorkbenchInstanceDocument({
                ...instance,
                sessionId: 42,
            }),
        ).toBe(false);
    });

    it("updates the primary graph without duplicating bindings", () => {
        const instance = createWorkbenchInstance({
            id: "wb_test",
            type: "harness-designer",
            title: "主工作台",
            graphId: "main",
        });
        const updated = withPrimaryGraph(instance, "graph_b");

        expect(primaryGraphId(updated)).toBe("graph_b");
        expect(updated.graphs).toEqual([{ graphId: "graph_b", role: "main" }]);
        expect(updated.updatedAt >= instance.updatedAt).toBe(true);
    });

    it("rejects malformed instances", () => {
        expect(isWorkbenchInstanceDocument(null)).toBe(false);
        expect(isWorkbenchInstanceDocument({})).toBe(false);
        expect(
            isWorkbenchInstanceDocument({
                schemaVersion: 1,
                id: "wb",
                type: "harness-designer",
                title: "x",
                graphs: [{ graphId: "", role: "main" }],
                plan: null,
                parameters: {},
            }),
        ).toBe(false);
    });
});
