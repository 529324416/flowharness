import {
    HarnessErrorCode,
    deserializeGraph,
    type GraphDocument,
    type HarnessIssue,
    type RequirementCatalog,
} from "wireclaw";
import { designerRegistry } from "./catalog";

export type ValidateGraphOptions = {
    /** 宿主可提供的依赖目录；缺省时不校验 requirements（Provider 闭环在 M6） */
    requirements?: RequirementCatalog;
};

/**
 * 运行前的渲染进程校验。
 *
 * 用 `validate: false` 反序列化，再把 issues 一次性取回；有 issue 就阻断运行。
 * 内嵌子图（Subgraph / Loop / ForEach）由 wireclaw 递归校验，问题带回
 * `graphPath` 与容器 `nodeId`。
 */
export function validateGraphDocument(
    graph: GraphDocument,
    options: ValidateGraphOptions = {},
): HarnessIssue[] {
    const requirements =
        options.requirements === undefined
            ? {}
            : { requirements: options.requirements };

    try {
        const parsed = deserializeGraph(graph, {
            registry: designerRegistry,
            validate: false,
            ...requirements,
        });
        return [...parsed.validate(requirements)];
    } catch (error) {
        return [
            {
                code: HarnessErrorCode.InvalidGraph,
                message: errorMessage(error),
            },
        ];
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
