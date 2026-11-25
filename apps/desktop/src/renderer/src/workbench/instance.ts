import type { WorkbenchInstanceDocument } from "@flowharness/contracts";
import { isWorkbenchPlan } from "./plan";

export const WORKBENCH_SCHEMA_VERSION = 1;

export function createWorkbenchId(): string {
    return `wb_${crypto.randomUUID().slice(0, 8)}`;
}

export function defaultWorkbenchTitle(type: string): string {
    switch (type) {
        case "harness-designer":
            return "主工作台";
        case "graph-table":
            return "节点清单";
        case "plan-runner":
            return "批量运行";
        default:
            return type;
    }
}

export function createWorkbenchInstance(input: {
    id: string;
    type: string;
    title: string;
    graphId: string | null;
}): WorkbenchInstanceDocument {
    const now = new Date().toISOString();
    return {
        schemaVersion: WORKBENCH_SCHEMA_VERSION,
        id: input.id,
        type: input.type,
        title: input.title,
        graphs:
            input.graphId === null
                ? []
                : [{ graphId: input.graphId, role: "main" }],
        plan: null,
        mode: "design",
        runId: null,
        sessionId: null,
        parameters: {},
        createdAt: now,
        updatedAt: now,
    };
}

/** 工作台优先绑定的主图。 */
export function primaryGraphId(
    instance: WorkbenchInstanceDocument,
): string | null {
    return instance.graphs[0]?.graphId ?? null;
}

/** 更新主图引用并保留其他 graph 绑定。 */
export function withPrimaryGraph(
    instance: WorkbenchInstanceDocument,
    graphId: string,
): WorkbenchInstanceDocument {
    const rest = instance.graphs.filter(( graph, index) => index > 0 || graph.role !== "main");
    return {
        ...instance,
        graphs: [{ graphId, role: "main" }, ...rest.filter((graph) => graph.graphId !== graphId)],
        updatedAt: new Date().toISOString(),
    };
}

export function isWorkbenchInstanceDocument(
    value: unknown,
): value is WorkbenchInstanceDocument {
    if (!isRecord(value)) return false;
    if (value.schemaVersion !== WORKBENCH_SCHEMA_VERSION) return false;
    if (typeof value.id !== "string" || value.id.length === 0) return false;
    if (typeof value.type !== "string" || value.type.length === 0) return false;
    if (typeof value.title !== "string") return false;
    if (!Array.isArray(value.graphs)) return false;
    if (!value.graphs.every(isGraphBinding)) return false;
    if (value.plan !== null && !isWorkbenchPlan(value.plan)) return false;
    if (
        value.mode !== undefined &&
        value.mode !== "design" &&
        value.mode !== "run"
    ) {
        return false;
    }
    if (
        value.runId !== undefined &&
        value.runId !== null &&
        typeof value.runId !== "string"
    ) {
        return false;
    }
    if (
        value.sessionId !== undefined &&
        value.sessionId !== null &&
        typeof value.sessionId !== "string"
    ) {
        return false;
    }
    if (!isRecord(value.parameters)) return false;
    return true;
}

function isGraphBinding(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
        typeof value.graphId === "string" &&
        value.graphId.length > 0 &&
        typeof value.role === "string" &&
        value.role.length > 0
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
