import type { WorkbenchPlan } from "@flowharness/contracts";

/** 顺序计划：每个图一个独立 run，暂不声明 bindings。 */
export function createWorkbenchPlan(
    graphIds: readonly string[],
): WorkbenchPlan {
    return {
        graphs: graphIds.map((graphId, index) => ({
            graphId,
            role: `step-${String(index + 1)}`,
        })),
        bindings: [],
        trigger: "manual",
    };
}

export function planGraphIds(plan: WorkbenchPlan): string[] {
    return plan.graphs.map((graph) => graph.graphId);
}

export function isWorkbenchPlan(value: unknown): value is WorkbenchPlan {
    if (!isRecord(value)) return false;
    if (!Array.isArray(value.graphs)) return false;
    if (!value.graphs.every(isPlanGraph)) return false;
    if (!Array.isArray(value.bindings)) return false;
    if (!value.bindings.every(isPlanBinding)) return false;
    return value.trigger === "manual" || value.trigger === "onOpen";
}

function isPlanGraph(value: unknown): boolean {
    return (
        isRecord(value) &&
        typeof value.graphId === "string" &&
        value.graphId.length > 0 &&
        typeof value.role === "string" &&
        value.role.length > 0
    );
}

function isPlanBinding(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return isPort(value.from) && isPort(value.to);
}

function isPort(value: unknown): boolean {
    return (
        isRecord(value) &&
        typeof value.graphId === "string" &&
        value.graphId.length > 0 &&
        typeof value.port === "string" &&
        value.port.length > 0
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
