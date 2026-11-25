import { describe, expect, it } from "vitest";
import {
    createWorkbenchPlan,
    isWorkbenchPlan,
    planGraphIds,
} from "./plan";

describe("WorkbenchPlan", () => {
    it("creates a sequential plan over independent graphs", () => {
        const plan = createWorkbenchPlan(["graph-a", "graph-b"]);

        expect(plan).toEqual({
            graphs: [
                { graphId: "graph-a", role: "step-1" },
                { graphId: "graph-b", role: "step-2" },
            ],
            bindings: [],
            trigger: "manual",
        });
        expect(planGraphIds(plan)).toEqual(["graph-a", "graph-b"]);
        expect(isWorkbenchPlan(plan)).toBe(true);
    });

    it("rejects malformed plans", () => {
        expect(isWorkbenchPlan(null)).toBe(false);
        expect(isWorkbenchPlan({})).toBe(false);
        expect(
            isWorkbenchPlan({
                graphs: [{ graphId: "", role: "step-1" }],
                bindings: [],
                trigger: "manual",
            }),
        ).toBe(false);
        expect(
            isWorkbenchPlan({
                graphs: [{ graphId: "a", role: "step-1" }],
                bindings: [],
                trigger: "later",
            }),
        ).toBe(false);
    });
});
