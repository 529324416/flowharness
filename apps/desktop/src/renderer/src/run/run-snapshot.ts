import type { RunSnapshot } from "@flowharness/contracts";

/**
 * 运行快照只会在生命周期节点变化；`node:stream` 批次里的快照字段完全相同。
 * 用它避免每个 token 批次都触发 React 重渲染。
 */
export function sameRunSnapshot(
    current: RunSnapshot | null,
    next: RunSnapshot,
): boolean {
    if (current === null) return false;

    return (
        current.runId === next.runId &&
        current.workspaceId === next.workspaceId &&
        current.workbenchId === next.workbenchId &&
        current.graphId === next.graphId &&
        current.status === next.status &&
        current.startedAt === next.startedAt &&
        current.endedAt === next.endedAt &&
        current.error === next.error
    );
}
