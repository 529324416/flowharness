/**
 * 工作台实例文档（Workbench Instance）。
 *
 * 一个实例绑定 1..n 个 Harness 图；`layout` 只保存实例级覆盖，
 * 默认布局仍以 GraphDocument.ui 为准。
 */
export type WorkbenchPlan = {
    graphs: { graphId: string; role: string; inputs?: unknown }[];
    bindings: {
        from: { graphId: string; port: string };
        to: { graphId: string; port: string };
    }[];
    trigger: "manual" | "onOpen";
};

export type WorkbenchMode = "design" | "run";

export type WorkbenchInstanceDocument = {
    schemaVersion: 1;
    id: string;
    type: string;
    title: string;
    graphs: { graphId: string; role: string }[];
    plan: WorkbenchPlan | null;
    /** 工作台当前阶段；旧实例缺省按 design 处理。 */
    mode?: WorkbenchMode;
    /** 运行阶段最近一次 run / 会话，用于恢复运行页。 */
    runId?: string | null;
    sessionId?: string | null;
    layout?: {
        viewport?: { x: number; y: number; zoom: number };
        overrides?: Record<string, { x: number; y: number }>;
    };
    parameters: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

/** 工作台实例列表摘要。 */
export type WorkbenchSummary = {
    id: string;
    title: string;
    type: string;
    updatedAt: string;
    size: number;
};
