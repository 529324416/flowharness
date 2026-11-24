import {
    HarnessErrorCode,
    deserializeGraph,
    type GraphDocument,
    type HarnessIssue,
} from "wireclaw";
import { designerRegistry } from "./catalog";

/**
 * 运行前的渲染进程校验。
 *
 * 用 `validate: false` 反序列化，再把 issues 一次性取回；有 issue 就阻断运行。
 * requirements 校验（Provider / 工具 / 参数）留到 M3。
 */
export function validateGraphDocument(graph: GraphDocument): HarnessIssue[] {
    try {
        const parsed = deserializeGraph(graph, {
            registry: designerRegistry,
            validate: false,
        });
        return [...parsed.validate()];
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
