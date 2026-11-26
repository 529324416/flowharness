import { useMemo, type ReactElement } from "react";
import type { RunEventDto, RunSnapshot } from "@flowharness/contracts";
import {
    Badge,
    EmptyState,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    type BadgeVariant,
} from "../../ui";
import {
    collectRunProblems,
    type DesignerProblem,
    type DesignerProblemSource,
} from "../../designer/core/problems";
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
        case "node:error":
            return event.nodeId;
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

/** 运行日志面板内容；面板外框由 PanelFrame 提供。 */
export function RunLogContent({
    events,
    snapshot = null,
    problems = [],
    onSelectProblem,
}: RunLogContentProps): ReactElement {
    const visible = events.slice(-120);
    const runProblems = useMemo(
        () => collectRunProblems(events, snapshot),
        [events, snapshot],
    );
    const allProblems = useMemo(
        () => [...problems, ...runProblems],
        [problems, runProblems],
    );

    return (
        <Tabs defaultValue="log" className={styles.root}>
            <TabsList className={styles.list}>
                <TabsTrigger value="log">日志</TabsTrigger>
                <TabsTrigger value="problems">
                    问题{allProblems.length > 0 ? ` (${String(allProblems.length)})` : ""}
                </TabsTrigger>
            </TabsList>

            <TabsContent value="log" className={styles.content}>
                {visible.length === 0 ? (
                    <EmptyState
                        compact
                        title="暂无运行事件"
                        description="运行一个 Graph 后，事件流会显示在这里"
                    />
                ) : (
                    <ul className={styles.log}>
                        {visible.map((event, index) => (
                            <li key={`${event.at}-${index}`} className={styles.row}>
                                <span className={styles.time}>{formatTime(event.at)}</span>
                                <Badge variant={badgeFor(event)}>{event.type}</Badge>
                                <span className={styles.detail}>{detailFor(event)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </TabsContent>

            <TabsContent value="problems" className={styles.content}>
                {allProblems.length === 0 ? (
                    <EmptyState
                        compact
                        title="暂无问题"
                        description="校验错误、失效连线与运行失败会显示在这里"
                    />
                ) : (
                    <ul className={styles.problems}>
                        {allProblems.map((problem) => {
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
            </TabsContent>
        </Tabs>
    );
}
