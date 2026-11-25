import { describe, expect, it } from "vitest";
import {
    WORKBENCH_TEMPLATES,
    getWorkbenchTemplate,
} from "./templates";

const WORKBENCH_TYPES = new Set([
    "harness-designer",
    "graph-table",
    "plan-runner",
    "flow-runner",
]);

describe("workbench templates", () => {
    it("has unique ids and registered workbench types", () => {
        const ids = WORKBENCH_TEMPLATES.map((template) => template.id);
        expect(new Set(ids).size).toBe(ids.length);

        for (const template of WORKBENCH_TEMPLATES) {
            expect(WORKBENCH_TYPES.has(template.type)).toBe(true);
            expect(template.title.length).toBeGreaterThan(0);
        }
    });

    it("creates a starter graph for blank templates", () => {
        const template = getWorkbenchTemplate("harness-blank");
        expect(template).toBeDefined();

        const graph = template?.createGraph?.("graph_template");
        expect(graph?.id).toBe("graph_template");
        expect(graph?.nodes.length).toBeGreaterThan(0);
        expect(graph?.edges.length).toBeGreaterThan(0);
        expect(graph?.nodes.map((node) => node.type)).toEqual(
            expect.arrayContaining(["core.constant", "core.output"]),
        );
    });

    it("returns undefined for unknown templates", () => {
        expect(getWorkbenchTemplate("missing")).toBeUndefined();
    });
});
