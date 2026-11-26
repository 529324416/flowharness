import type { RunEventDto, RunSnapshot } from "@flowharness/contracts";
import type { DesignerProblem } from "./problems";

/** 运行日志的一行：运行事件，或可定位的校验 / 运行问题。 */
export type RunLogRow =
    | { kind: "problem"; problem: DesignerProblem }
    | { kind: "event"; event: RunEventDto };

/** 面板只保留最近 120 条事件，避免长跑时 DOM 无限增长。 */
export const RUN_LOG_EVENT_LIMIT = 120;

/**
 * 把问题与运行事件合并成一条按时间排列的日志。
 *
 * - 运行前问题（校验 / 失效连线）没有时间戳，排在最前；
 * - `node:error` 事件直接转成问题行（带消息、可定位），不再重复渲染事件行；
 * - 只保留最近 `limit` 条事件；整次运行失败且没有节点错误时，在末尾补一条图级错误。
 */
export function buildRunLogRows(
    problems: readonly DesignerProblem[],
    events: readonly RunEventDto[],
    snapshot: RunSnapshot | null,
    limit: number = RUN_LOG_EVENT_LIMIT,
): RunLogRow[] {
    const rows: RunLogRow[] = problems
        .filter((problem) => problem.source !== "run")
        .map((problem) => ({ kind: "problem", problem }));

    const start = Math.max(0, events.length - limit);
    for (let index = start; index < events.length; index += 1) {
        const event = events[index];
        if (event === undefined) continue;

        if (event.type === "node:error") {
            rows.push({
                kind: "problem",
                problem: {
                    id: `run:node:${event.nodeId}:${String(index)}`,
                    severity: "error",
                    source: "run",
                    message: event.message,
                    nodeId: event.nodeId,
                },
            });
        } else {
            rows.push({ kind: "event", event });
        }
    }

    if (
        snapshot?.status === "failed" &&
        snapshot.error !== undefined &&
        !events.some((event) => event.type === "node:error")
    ) {
        rows.push({
            kind: "problem",
            problem: {
                id: `run:failed:${snapshot.runId}`,
                severity: "error",
                source: "run",
                message: snapshot.error,
            },
        });
    }

    return rows;
}
