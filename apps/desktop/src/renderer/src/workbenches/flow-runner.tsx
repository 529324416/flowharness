import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactElement,
} from "react";
import { ArrowLeft, CircleStop, Pause, Play, SkipForward } from "lucide-react";
import type { RequirementCatalog } from "wireclaw";
import { Alert, Badge, Button, EmptyState } from "../ui";
import { CanvasView } from "../canvas/view/CanvasView";
import { toCanvasDocument } from "../designer/core/adapter";
import { useDesignerDocument } from "../designer/state/useDesignerDocument";
import { useDesignerRun } from "../designer/state/useDesignerRun";
import { DocumentNavigation } from "../shell/navigation/DocumentNavigation";
import type {
    WorkbenchDefinition,
    WorkbenchViewProps,
} from "../workbench/types";
import styles from "./FlowRunnerWorkbench.module.css";

function RunStatusBadge({ status }: { status: string }): ReactElement {
    return (
        <Badge variant={status === "running" ? "accent" : "neutral"}>
            {status}
        </Badge>
    );
}

/** 运行页配置：固定工作流 + 进入运行阶段。 */
function FlowRunConfig({
    activeDocumentId,
    documents,
    shell,
    error,
}: WorkbenchViewProps): ReactElement {
    const document = documents.find((item) => item.id === activeDocumentId);

    return (
        <div className={styles.config}>
            <div className={styles.configCard}>
                <p className={styles.eyebrow}>FIXED WORKFLOW</p>
                <h1 className={styles.configTitle}>
                    {document?.title ?? "选择一条工作流"}
                </h1>
                <p className={styles.configText}>
                    运行页会以只读画布固定展示这条工作流，运行时自动聚焦当前节点，
                    连线随数据流动；结果与会话仍由浮动面板承载。
                </p>
                {error !== null ? (
                    <Alert tone="danger" title="工作流不可用">
                        {error}
                    </Alert>
                ) : null}
                <div className={styles.configActions}>
                    <Button
                        variant="primary"
                        size="sm"
                        disabled={document === undefined}
                        onClick={() => void shell.onModeChange("run")}
                    >
                        <Play size={16} aria-hidden="true" />
                        进入运行
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** 带动画的固定工作流运行页：只读画布 + 运行控制 + 节点时间线。 */
function FlowRunStage({
    workspace,
    activeDocumentId,
    shell,
    busy,
}: WorkbenchViewProps): ReactElement {
    const {
        document: graph,
        status: documentStatus,
        error: documentError,
    } = useDesignerDocument(workspace?.id ?? null, activeDocumentId);
    const [requirementCatalog, setRequirementCatalog] = useState<
        RequirementCatalog | undefined
    >(undefined);
    const run = useDesignerRun(requirementCatalog);
    const [focusNode, setFocusNode] = useState<{
        nodeId: string;
        seq: number;
    } | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const result = await window.flowharness.listProviders();
            if (!result.ok || cancelled) return;
            setRequirementCatalog({
                providers: result.data
                    .filter((provider) => provider.available)
                    .map((provider) => provider.id),
                models: result.data.flatMap((provider) =>
                    provider.models.map((modelId) => ({
                        providerId: provider.id,
                        modelId,
                    })),
                ),
            });
        })();
        return () => {
            cancelled = true;
        };
    }, [workspace?.id]);

    useEffect(() => {
        shell.onRunControlsChange(null);
        shell.onSaveStatusChange(null);
        shell.onInspectorChange(null);
        shell.onProblemsChange(null);
        shell.onDocumentActionsChange(null);
        shell.onControllerChange(null);
    }, [shell]);

    const canvas = useMemo(
        () =>
            graph === null
                ? null
                : toCanvasDocument(graph, {
                      edgeStatuses: run.edgeStatuses,
                  }),
        [graph, run.edgeStatuses],
    );

    const runningNodeId = useMemo(
        () =>
            Object.entries(run.nodeStatuses).find(
                ([, status]) => status === "running",
            )?.[0],
        [run.nodeStatuses],
    );

    useEffect(() => {
        if (runningNodeId === undefined) return;
        setFocusNode((current) =>
            current?.nodeId === runningNodeId
                ? current
                : { nodeId: runningNodeId, seq: (current?.seq ?? 0) + 1 },
        );
    }, [runningNodeId]);

    const start = useCallback(async (): Promise<void> => {
        if (graph === null) return;
        const snapshot = await run.start(
            graph,
            workspace.id,
            shell.onRunWillStart,
        );
        if (snapshot !== null) shell.onRunStarted(snapshot);
    }, [graph, run, shell, workspace.id]);

    if (documentStatus === "loading") {
        return <p className={styles.loading}>正在读取工作流…</p>;
    }

    if (graph === null || canvas === null) {
        return (
            <EmptyState
                title="没有可运行的工作流"
                description={documentError ?? "请先在左侧选择一条工作流。"}
            />
        );
    }

    const issue = run.issues[0]?.message ?? run.error;

    return (
        <div className={styles.stage}>
            <header className={styles.header}>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void shell.onModeChange("design")}
                >
                    <ArrowLeft size={16} aria-hidden="true" />
                    返回配置
                </Button>
                <span className={styles.title}>
                    {graph.title ?? activeDocumentId ?? "运行页"}
                </span>
                <RunStatusBadge status={run.status} />
                <span className={styles.spacer} />
                {run.status === "running" ? (
                    <>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={run.controlling}
                            onClick={() => void run.pause()}
                        >
                            <Pause size={15} aria-hidden="true" />
                            暂停
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void run.cancel()}
                        >
                            <CircleStop size={15} aria-hidden="true" />
                            取消
                        </Button>
                    </>
                ) : run.status === "paused" ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={run.controlling}
                        onClick={() => void run.resume()}
                    >
                        <SkipForward size={15} aria-hidden="true" />
                        继续
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        size="sm"
                        disabled={busy || run.starting}
                        onClick={() => void start()}
                    >
                        <Play size={15} aria-hidden="true" />
                        运行
                    </Button>
                )}
            </header>

            {issue !== undefined && issue !== null && issue.length > 0 ? (
                <div className={styles.alert}>
                    <Alert tone="danger" title="运行前置检查未通过">
                        {issue}
                    </Alert>
                </div>
            ) : null}

            <div className={styles.canvas}>
                <CanvasView
                    key={`${workspace.id}:${activeDocumentId ?? "none"}`}
                    document={canvas}
                    title={graph.title ?? workspace.name}
                    readOnly
                    nodeStatuses={run.nodeStatuses}
                    focusNode={focusNode}
                />
            </div>

            <footer className={styles.timeline}>
                {graph.nodes.map((node) => {
                    const status = run.nodeStatuses[node.id] ?? "idle";
                    return (
                        <span
                            key={node.id}
                            className={styles.chip}
                            data-status={status}
                        >
                            <span className={styles.chipDot} />
                            {node.id}
                            <span className={styles.chipStatus}>{status}</span>
                        </span>
                    );
                })}
            </footer>
        </div>
    );
}

export const flowRunnerWorkbench: WorkbenchDefinition = {
    type: "flow-runner",
    title: "运行页",
    description: "固定工作流 + 带动画的只读运行页",
    canOpen: (instance) => instance.graphs.length > 0,
    navigation: { design: DocumentNavigation, run: DocumentNavigation },
    View: FlowRunConfig,
    RunView: FlowRunStage,
};
