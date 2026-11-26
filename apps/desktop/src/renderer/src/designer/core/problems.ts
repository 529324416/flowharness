import type { RunEventDto, RunSnapshot } from "@flowharness/contracts";
import type {
    GraphDocument,
    HarnessIssue,
    RequirementCatalog,
} from "wireclaw";
import { edgeKeyFromPorts } from "../../canvas/core/edge-key";
import { findInvalidEdges, type InvalidEdge } from "./edges";
import { validateGraphDocument } from "./validate";

export type DesignerProblemSource = "validation" | "edge" | "run" | "provider";

export type DesignerProblemSeverity = "error" | "warning";

/**
 * 问题面板的一条可定位问题。
 *
 * `nodeId` 是顶层图里的节点（内嵌图问题指向容器节点）；
 * `edgeId` 与画布稳定边 key 一致，可直接用来高亮/定位。
 */
export type DesignerProblem = {
    id: string;
    severity: DesignerProblemSeverity;
    source: DesignerProblemSource;
    message: string;
    code?: string;
    nodeId?: string;
    edgeId?: string;
    port?: string;
    /** 内嵌图路径，例如 `subgraph.<nodeId>/loop.<nodeId>` */
    graphPath?: string;
    /** 内嵌图内的实际节点 id */
    nestedNodeId?: string;
};

/** 设计器传给外壳/面板的问题模型；`select` 由设计器实现（选中并聚焦）。 */
export type DesignerProblemsModel = {
    problems: readonly DesignerProblem[];
    select: (problem: DesignerProblem) => void;
};

export type CollectDesignerProblemsOptions = {
    /** 已计算过的失效连线，避免重复投影 */
    invalidEdges?: readonly InvalidEdge[];
    /** 宿主可提供的依赖目录；缺省时不校验 requirements */
    requirements?: RequirementCatalog;
};

/**
 * 汇总运行前问题：wireclaw `Graph.validate()` + 画布投影侧的失效连线。
 *
 * - 校验问题优先，失效连线只补充未被 `edgeIndex` 覆盖的边；
 * - 内嵌图问题通过 `graphPath` / `nestedNodeId` 展示，但仍定位到容器节点。
 */
export function collectDesignerProblems(
    graph: GraphDocument,
    options: CollectDesignerProblemsOptions = {},
): readonly DesignerProblem[] {
    const edgeIds = graph.edges.map((edge) =>
        edgeKeyFromPorts(edge.from, edge.to),
    );
    const issues = validateGraphDocument(graph, {
        ...(options.requirements === undefined
            ? {}
            : { requirements: options.requirements }),
    });

    const reportedEdgeIds = new Set<string>();
    const problems: DesignerProblem[] = issues.map((issue, index) => {
        const edgeId =
            issue.edgeIndex === undefined
                ? undefined
                : edgeIds[issue.edgeIndex];
        if (edgeId !== undefined) reportedEdgeIds.add(edgeId);

        return {
            id: `validation:${issue.code}:${String(issue.edgeIndex ?? "graph")}:${String(index)}`,
            severity: "error",
            source: "validation",
            code: issue.code,
            message: formatIssue(issue),
            ...(issue.nodeId === undefined ? {} : { nodeId: issue.nodeId }),
            ...(edgeId === undefined ? {} : { edgeId }),
            ...(issue.port === undefined ? {} : { port: issue.port }),
            ...(issue.graphPath === undefined
                ? {}
                : { graphPath: issue.graphPath }),
            ...(issue.nestedNodeId === undefined
                ? {}
                : { nestedNodeId: issue.nestedNodeId }),
        };
    });

    const invalidEdges = options.invalidEdges ?? findInvalidEdges(graph);
    for (const invalid of invalidEdges) {
        if (reportedEdgeIds.has(invalid.id)) continue;

        const nodeId = existingNodeId(graph, invalid);
        problems.push({
            id: `edge:${invalid.id}`,
            severity: "warning",
            source: "edge",
            message: invalid.message,
            edgeId: invalid.id,
            ...(nodeId === undefined ? {} : { nodeId }),
        });
    }

    return problems;
}

/** 运行期问题：节点错误与无法定位到节点的运行失败。 */
export function collectRunProblems(
    events: readonly RunEventDto[],
    snapshot: RunSnapshot | null,
): readonly DesignerProblem[] {
    const problems: DesignerProblem[] = [];
    let hasNodeError = false;

    events.forEach((event, index) => {
        if (event.type !== "node:error") return;
        hasNodeError = true;
        problems.push({
            id: `run:node:${event.nodeId}:${String(index)}`,
            severity: "error",
            source: "run",
            message: event.message,
            nodeId: event.nodeId,
        });
    });

    if (
        !hasNodeError &&
        snapshot?.status === "failed" &&
        snapshot.error !== undefined
    ) {
        problems.push({
            id: `run:failed:${snapshot.runId}`,
            severity: "error",
            source: "run",
            message: snapshot.error,
        });
    }

    return problems;
}

function formatIssue(issue: HarnessIssue): string {
    if (issue.graphPath === undefined) return issue.message;
    return `${issue.message}（内嵌图 ${issue.graphPath}）`;
}

function existingNodeId(
    graph: GraphDocument,
    invalid: InvalidEdge,
): string | undefined {
    const ids = new Set(graph.nodes.map((node) => node.id));
    if (ids.has(invalid.sourceNodeId)) return invalid.sourceNodeId;
    if (ids.has(invalid.targetNodeId)) return invalid.targetNodeId;
    return undefined;
}
