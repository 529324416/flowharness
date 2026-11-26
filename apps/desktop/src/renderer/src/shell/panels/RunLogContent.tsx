import { useMemo, type ReactElement } from "react";
import type { RunEventDto, RunSnapshot } from "@flowharness/contracts";
import { Badge, EmptyState, type BadgeVariant } from "../../ui";
import type {
    DesignerProblem,
    DesignerProblemSource,
} from "../../designer/core/problems";
import { buildRunLogRows } from "../../designer/core/run-log";
import styles from "./RunLogContent.module.css";

function badgeFor(event: RunEventDto): BadgeVariant {
    if (event.type === "node:error") return "danger";
    if (event.type === "run:end") {
        if (event.status === "failed") return "danger";
        if (event.status === "completed") return "success";
        if (event.status === "cancelled") return "warning";
    }
    if (event.type === "run:start" || event.type === "run:paused" || event.type === "run:resumed") {
        return "accent";
    }
    return "neutral";
}

function detailFor(event: RunEventDto): string {
    switch (event.type) {
        case "run:start":
            return event.graphId;
        case "run:end":
            return `status=${event.status}`;
        case "node:start":
        case "node:skipped":
            return event.nodeId;
        case "node:error":
            return `${event.nodeId} · ${event.message}`;
        case "node:end":
            return `${event.nodeId} · ${outputKeys(event.outputs)}`;
        case "node:stream":
            return `${event.nodeId}:${event.port} ${truncate(streamText(event.chunk), 96)}`;
        case "custom":
            return `${event.name} (${event.nodeId})`;
        case "run:paused":
        case "run:resumed":
            return "";
    }
}

function outputKeys(outputs: unknown): string {
    if (typeof outputs !== "object" || outputs === null) return "";
    const keys = Object.keys(outputs);
    return keys.length === 0 ? "无输出" : keys.join(", ");
}

function streamText(chunk: unknown): string {
    if (typeof chunk === "string") return chunk;
    if (typeof chunk === "object" && chunk !== null) {
        const value = chunk as { type?: unknown; text?: unknown };
        if (value.type === "text" && typeof value.text === "string") {
            return value.text;
        }
    }

    try {
        return JSON.stringify(chunk);
    } catch {
        return String(chunk);
    }
}

function truncate(text: string, length: number): string {
    return text.length > length ? `${text.slice(0, length)}…` : text;
}

function formatTime(at: number): string {
    return new Date(at).toTimeString().slice(0, 8);
}

const SOURCE_LABEL: Record<DesignerProblemSource, string> = {
    validation: "校验",
    edge: "连线",
    run: "运行",
    provider: "Provider",
};

function locationFor(problem: DesignerProblem): string {
    const parts = [problem.nodeId, problem.graphPath].filter(
        (part): part is string => part !== undefined,
    );
    if (parts.length > 0) return parts.join(" · ");
    return problem.edgeId ?? "图";
}

export type RunLogContentProps = {
    events: readonly RunEventDto[];
    snapshot?: RunSnapshot | null;
    /** 运行前的校验 / 失效连线问题 */
    problems?: readonly DesignerProblem[];
    onSelectProblem?: (problem: DesignerProblem) => void;
};

/**
 * 运行日志面板内容；面板外框由 PanelFrame 提供。
 *
 * 校验 / 连线 / 运行问题与运行事件合并为一条日志，不再单独占一个页签；
 * 问题行可点击定位到画布节点。
 */
export function RunLogContent({
    events,
    snapshot = null,
    problems = [],
    onSelectProblem,
}: RunLogContentProps): ReactElement {
    const rows = useMemo(
        () => buildRunLogRows(problems, events, snapshot),
        [events, problems, snapshot],
    );

    return (
        <div className={styles.root}>
            {rows.length === 0 ? (
                <EmptyState
                    compact
                    title="暂无运行日志"
                    description="运行事件与校验 / 运行问题会显示在这里"
                />
            ) : (
                <ul className={styles.log}>
                    {rows.map((row, index) => {
                        if (row.kind === "event") {
                            const { event } = row;
                            return (
                                <li
                                    key={`${String(event.at)}-${String(index)}`}
                                    className={styles.row}
                                >
                                    <span className={styles.time}>
                                        {formatTime(event.at)}
                                    </span>
                                    <Badge variant={badgeFor(event)}>
                                        {event.type}
                                    </Badge>
                                    <span className={styles.detail}>
                                        {detailFor(event)}
                                    </span>
                                </li>
                            );
                        }

                        const { problem } = row;
                        const selectable =
                            onSelectProblem !== undefined &&
                            (problem.nodeId !== undefined ||
                                problem.edgeId !== undefined);
                        return (
                            <li key={problem.id}>
                                <button
                                    type="button"
                                    className={styles.problem}
                                    disabled={!selectable}
                                    onClick={() => onSelectProblem?.(problem)}
                                >
                                    <Badge
                                        variant={
                                            problem.severity === "error"
                                                ? "danger"
                                                : "warning"
                                        }
                                    >
                                        {SOURCE_LABEL[problem.source]}
                                    </Badge>
                                    <span className={styles.problemText}>
                                        {problem.message}
                                    </span>
                                    <span className={styles.problemMeta}>
                                        {locationFor(problem)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
