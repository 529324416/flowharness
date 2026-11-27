import { useCallback, useEffect, useRef, useState } from "react";
import type {
    RunEventBatch,
    RunSnapshot,
    RunStatus,
} from "@flowharness/contracts";
import type { GraphDocument, HarnessIssue } from "wireclaw";
import type { CanvasEdgeStatus, CanvasRunMetrics, CanvasStatus } from "../../canvas/core/types";
import {
    applyRunEventsToView,
    createRunView,
    type RunViewState,
} from "../core/run-events";
import type { RequirementCatalog } from "wireclaw";
import { sameRunSnapshot } from "../../run/run-snapshot";
import { validateGraphDocument } from "../core/validate";

export type UseDesignerRunResult = {
    snapshot: RunSnapshot | null;
    status: RunStatus;
    starting: boolean;
    controlling: boolean;
    issues: readonly HarnessIssue[];
    error: string | null;
    nodeStatuses: Readonly<Record<string, CanvasStatus>>;
    edgeStatuses: Readonly<Record<string, CanvasEdgeStatus>>;
    /** 运行中节点的 token / 耗时指标；结束或重置后清空。 */
    nodeMetrics: Readonly<Record<string, CanvasRunMetrics>>;
    start: (
        graph: GraphDocument,
        workspaceId: string,
        onWillStart?: () => void | Promise<void>,
    ) => Promise<RunSnapshot | null>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    cancel: () => Promise<void>;
    reset: () => void;
    clearMessages: () => void;
};

const EMPTY_VIEW: RunViewState = {
    nodeStatuses: {},
    edgeStatuses: {},
    nodeMetrics: {},
};

/**
 * 运行指标（HUD）的画布更新节流。
 *
 * 节点 / 边状态仍然逐批即时投影；token 尾部文本只按此间隔刷新，避免
 * 每个 stream 片段都重建整张画布。
 */
const METRICS_THROTTLE_MS = 150;

/**
 * 设计器的运行控制。
 *
 * - 启动前在 renderer 侧 validate；有 issue 直接阻断；
 * - 只消费当前 runId 的事件，避免 Diagnostics 自检事件污染节点状态；
 * - 启动响应前到达的事件先缓冲，拿到 runId 后再回放；
 * - 节点与边状态由同一批事件投影，取消/结束后不残留 running/active。
 */
export function useDesignerRun(
    requirements?: RequirementCatalog,
): UseDesignerRunResult {
    const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
    const [starting, setStarting] = useState(false);
    const [controlling, setControlling] = useState(false);
    const [issues, setIssues] = useState<readonly HarnessIssue[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<RunViewState>(EMPTY_VIEW);

    const activeRunIdRef = useRef<string | null>(null);
    const pendingRef = useRef<RunEventBatch[]>([]);
    const graphRef = useRef<GraphDocument | null>(null);
    /** 完整投影（含未节流的指标），供下一批事件继续累加。 */
    const fullViewRef = useRef<RunViewState>(EMPTY_VIEW);
    /** 已展示到画布上的指标；HUD 从这里读取。 */
    const displayedMetricsRef = useRef<Record<string, CanvasRunMetrics>>({});
    const metricsTimerRef = useRef<number | null>(null);

    const clearMetricsTimer = useCallback(() => {
        if (metricsTimerRef.current === null) return;
        window.clearTimeout(metricsTimerRef.current);
        metricsTimerRef.current = null;
    }, []);

    useEffect(() => () => clearMetricsTimer(), [clearMetricsTimer]);

    /**
     * 投影一批事件，但把指标以 150ms 节流写入视图。
     *
     * 完整指标保存在 ref 中继续累加，节流只影响画布重渲染频率。
     */
    const applyEvents = useCallback(
        (events: RunEventBatch["events"]) => {
            const graph = graphRef.current;
            if (graph === null) return;

            const current = fullViewRef.current;
            const next = applyRunEventsToView(graph, current, events);
            if (next === current) return;
            fullViewRef.current = next;

            if (
                next.nodeMetrics !== current.nodeMetrics &&
                metricsTimerRef.current === null
            ) {
                metricsTimerRef.current = window.setTimeout(() => {
                    metricsTimerRef.current = null;
                    const latest = fullViewRef.current.nodeMetrics;
                    if (latest === displayedMetricsRef.current) return;
                    displayedMetricsRef.current = latest;
                    setView((currentView) => ({
                        ...currentView,
                        nodeMetrics: latest,
                    }));
                }, METRICS_THROTTLE_MS);
            }

            if (
                next.nodeStatuses !== current.nodeStatuses ||
                next.edgeStatuses !== current.edgeStatuses
            ) {
                setView({
                    nodeStatuses: next.nodeStatuses,
                    edgeStatuses: next.edgeStatuses,
                    nodeMetrics: displayedMetricsRef.current,
                });
            }
        },
        [],
    );

    const applyBatch = useCallback(
        (batch: RunEventBatch) => {
            setSnapshot((current) =>
                sameRunSnapshot(current, batch.snapshot) ? current : batch.snapshot,
            );
            applyEvents(batch.events);
        },
        [applyEvents],
    );

    useEffect(() => {
        return window.flowharness.onEvent((envelope) => {
            if (envelope.topic !== "run") return;

            const batch = envelope.payload as RunEventBatch;
            const activeRunId = activeRunIdRef.current;

            if (activeRunId === null) {
                pendingRef.current.push(batch);
                if (pendingRef.current.length > 20) pendingRef.current.shift();
                return;
            }

            if (batch.runId !== activeRunId) return;
            applyBatch(batch);
        });
    }, [applyBatch]);

    const start = useCallback(
        async (
            graph: GraphDocument,
            workspaceId: string,
            onWillStart?: () => void | Promise<void>,
        ): Promise<RunSnapshot | null> => {
            const validationIssues = validateGraphDocument(
                graph,
                requirements === undefined ? {} : { requirements },
            );
            setIssues(validationIssues);
            setError(null);

            if (validationIssues.length > 0) {
                clearMetricsTimer();
                fullViewRef.current = EMPTY_VIEW;
                displayedMetricsRef.current = {};
                setSnapshot(null);
                setView(EMPTY_VIEW);
                return null;
            }

            await onWillStart?.();

            activeRunIdRef.current = null;
            pendingRef.current = [];
            graphRef.current = graph;
            clearMetricsTimer();
            const initialView = createRunView(graph);
            fullViewRef.current = initialView;
            displayedMetricsRef.current = initialView.nodeMetrics;
            setStarting(true);
            setSnapshot(null);
            setView(initialView);

            try {
                const result = await window.flowharness.startRun({
                    workspaceId,
                    graph,
                    input: { text: "" },
                });

                if (!result.ok) {
                    setError(result.error.message);
                    return null;
                }

                activeRunIdRef.current = result.data.runId;
                setSnapshot(result.data);

                const buffered = pendingRef.current;
                pendingRef.current = [];
                for (const batch of buffered) {
                    if (batch.runId === result.data.runId) applyBatch(batch);
                }

                return result.data;
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
                return null;
            } finally {
                setStarting(false);
            }
        },
        [applyBatch, requirements],
    );

    const runControl = useCallback(
        async (
            action: (runId: string) => Promise<
                { ok: true; data: RunSnapshot } | { ok: false; error: { message: string } }
            >,
            transition: "run:paused" | "run:resumed",
        ): Promise<void> => {
            const runId = activeRunIdRef.current;
            if (runId === null) return;

            setControlling(true);
            try {
                const result = await action(runId);
                if (!result.ok) {
                    setError(result.error.message);
                    return;
                }
                setSnapshot(result.data);

                // 即使引擎没有补发 paused/resumed 事件，也同步节点投影。
                applyEvents([{ type: transition, runId, at: Date.now() }]);
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                setControlling(false);
            }
        },
        [applyEvents],
    );

    const pause = useCallback(
        () =>
            runControl(
                (runId) => window.flowharness.pauseRun(runId),
                "run:paused",
            ),
        [runControl],
    );

    const resume = useCallback(
        () =>
            runControl(
                (runId) => window.flowharness.resumeRun(runId),
                "run:resumed",
            ),
        [runControl],
    );

    const cancel = useCallback(async (): Promise<void> => {
        const runId = activeRunIdRef.current;
        if (runId === null) return;

        const result = await window.flowharness.cancelRun(runId);
        if (!result.ok) setError(result.error.message);
    }, []);

    const reset = useCallback(() => {
        activeRunIdRef.current = null;
        pendingRef.current = [];
        graphRef.current = null;
        clearMetricsTimer();
        fullViewRef.current = EMPTY_VIEW;
        displayedMetricsRef.current = {};
        setSnapshot(null);
        setStarting(false);
        setControlling(false);
        setIssues([]);
        setError(null);
        setView(EMPTY_VIEW);
    }, [clearMetricsTimer]);

    const clearMessages = useCallback(() => {
        setIssues([]);
        setError(null);
        // 运行失败的错误来自 snapshot；关闭 banner 时一并清掉，事件日志仍保留。
        setSnapshot(null);
    }, []);

    const status: RunStatus = snapshot?.status ?? "idle";

    return {
        snapshot,
        status,
        starting,
        controlling,
        issues,
        error,
        nodeStatuses: view.nodeStatuses,
        edgeStatuses: view.edgeStatuses,
        nodeMetrics: view.nodeMetrics,
        start,
        pause,
        resume,
        cancel,
        reset,
        clearMessages,
    };
}
