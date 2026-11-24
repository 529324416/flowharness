import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { RunSnapshot, WorkspaceSummary } from "@flowharness/contracts";
import type { NodeRequirement } from "wireclaw";
import {
    Alert,
    Button,
    EmptyState,
} from "../ui";
import type { CanvasEdgeStatus } from "../canvas/core/types";
import { edgeKeyFromPorts } from "../canvas/core/edge-key";
import { CanvasView } from "../canvas/view/CanvasView";
import { toCanvasDocument } from "../designer/core/adapter";
import { findInvalidEdges } from "../designer/core/edges";
import { findNodeCatalogEntry, NODE_CATALOG, NODE_PRESETS } from "../designer/core/catalog";
import {
    collectDesignerProblems,
    type DesignerProblem,
    type DesignerProblemsModel,
} from "../designer/core/problems";
import { useDesignerDocument } from "../designer/state/useDesignerDocument";
import { useDesignerRun } from "../designer/state/useDesignerRun";
import { useRecentNodes } from "../designer/state/useRecentNodes";
import type { InspectorModel } from "../inspector/model";
import type { RunControls } from "../run/run-controls";
import {
    NODE_LIBRARY_MAX_HEIGHT,
    NODE_LIBRARY_WIDTH,
    NodeLibraryPanel,
} from "./NodeLibraryPanel";import styles from "./DesignerView.module.css";

export type DesignerSaveStatus = "saved" | "saving" | "conflict" | "error";

export type DesignerViewProps = {
    workspace: WorkspaceSummary | null;
    busy?: boolean;
    /** 工作区创建 / 打开失败的错误；文档加载错误在内部处理。 */
    error?: string | null;
    onCreateWorkspace: () => void;
    onRunWillStart: () => void;
    onRunStarted: (snapshot: RunSnapshot) => void;
    onRunControlsChange: (controls: RunControls | null) => void;
    onSaveStatusChange: (status: DesignerSaveStatus | null) => void;
    onInspectorChange: (model: InspectorModel | null) => void;
    onProblemsChange: (model: DesignerProblemsModel | null) => void;
};

/** 设计器视图：加载 / 编辑 / 自动保存 main GraphDocument。 */
export function DesignerView({
    workspace,
    busy = false,
    error,
    onCreateWorkspace,
    onRunWillStart,
    onRunStarted,
    onRunControlsChange,
    onSaveStatusChange,
    onInspectorChange,
    onProblemsChange,
}: DesignerViewProps): ReactElement {
    const {
        status,
        document: graph,
        error: loadError,
        saveState,
        reload,
        applyCommand,
        addNode,
        addNodeFromPreset,
        updateNodeConfig,
        flush,
    } = useDesignerDocument(workspace?.id ?? null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryAnchor, setLibraryAnchor] = useState<{ x: number; y: number } | null>(
        null,
    );
    const [focusNode, setFocusNode] = useState<{
        nodeId: string;
        seq: number;
    } | null>(null);
    const { entries: recentNodes, record: recordRecentNode } = useRecentNodes();

    const {
        snapshot,
        status: runStatus,
        starting,
        controlling,
        issues,
        error: runError,
        nodeStatuses,
        edgeStatuses: runEdgeStatuses,
        start,
        pause,
        resume,
        cancel,
        reset,
        clearMessages,
    } = useDesignerRun();

    useEffect(() => {
        setSelectedNodeId(null);
        setLibraryOpen(false);
        setLibraryAnchor(null);
        setFocusNode(null);
    }, [graph?.id]);

    useEffect(() => {
        reset();
    }, [workspace?.id, reset]);

    const invalidEdges = useMemo(
        () => (graph === null ? [] : findInvalidEdges(graph)),
        [graph],
    );

    const edgeStatuses = useMemo(() => {
        const merged: Record<string, CanvasEdgeStatus> = { ...runEdgeStatuses };
        for (const edge of invalidEdges) merged[edge.id] = "error";
        return merged;
    }, [invalidEdges, runEdgeStatuses]);

    const canvas = useMemo(
        () => (graph === null ? null : toCanvasDocument(graph, { edgeStatuses })),
        [edgeStatuses, graph],
    );

    const problems = useMemo(
        () =>
            graph === null
                ? []
                : collectDesignerProblems(graph, { invalidEdges }),
        [graph, invalidEdges],
    );

    const selectProblem = useCallback(
        (problem: DesignerProblem): void => {
            let nodeId = problem.nodeId;
            if (nodeId === undefined && problem.edgeId !== undefined && graph !== null) {
                const edge = graph.edges.find(
                    (candidate) =>
                        edgeKeyFromPorts(candidate.from, candidate.to) ===
                        problem.edgeId,
                );
                nodeId = edge?.from.nodeId;
            }
            if (nodeId === undefined) return;

            setSelectedNodeId(nodeId);
            setFocusNode((current) => ({
                nodeId,
                seq: (current?.seq ?? 0) + 1,
            }));
        },
        [graph],
    );

    const problemsModel = useMemo<DesignerProblemsModel>(
        () => ({ problems, select: selectProblem }),
        [problems, selectProblem],
    );

    useEffect(() => {
        onProblemsChange(problemsModel);
    }, [onProblemsChange, problemsModel]);

    useEffect(() => {
        return () => onProblemsChange(null);
    }, [onProblemsChange]);

    const handleRun = useCallback(async (): Promise<void> => {
        if (graph === null || workspace === null) return;

        const started = await start(graph, workspace.id, onRunWillStart);
        if (started !== null) onRunStarted(started);
    }, [graph, onRunStarted, onRunWillStart, start, workspace]);

    const handleCancel = useCallback((): void => {
        void cancel();
    }, [cancel]);

    /** 右键菜单「添加节点」：把视口坐标换算成画布内坐标，并钳制在可视区域内。 */
    const openNodeLibrary = useCallback((position: { x: number; y: number }): void => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect === undefined) {
            setLibraryAnchor(null);
            setLibraryOpen(true);
            return;
        }

        const panelWidth = NODE_LIBRARY_WIDTH;
        const panelHeight = NODE_LIBRARY_MAX_HEIGHT;
        const edge = 12;
        setLibraryAnchor({
            x: Math.min(
                Math.max(edge, position.x - rect.left),
                Math.max(edge, rect.width - panelWidth - edge),
            ),
            y: Math.min(
                Math.max(edge, position.y - rect.top),
                Math.max(edge, rect.height - panelHeight - edge),
            ),
        });
        setLibraryOpen(true);
    }, []);

    const handleAddNode = useCallback(
        (type: string): void => {
            addNode(type);
            recordRecentNode({ kind: "type", id: type });
        },
        [addNode, recordRecentNode],
    );

    const handleAddPreset = useCallback(
        (presetId: string): void => {
            addNodeFromPreset(presetId);
            recordRecentNode({ kind: "preset", id: presetId });
        },
        [addNodeFromPreset, recordRecentNode],
    );

    const isRunning = runStatus === "running";
    const isPaused = runStatus === "paused";
    const runBusy = starting || controlling;
    const editingDisabled =
        isRunning || isPaused || runBusy || saveState.status === "conflict";

    const selectedGraphNode =
        graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
    const selectedCanvasNode =
        canvas?.nodes.find((node) => node.id === selectedNodeId) ?? null;

    const inspector = useMemo<InspectorModel | null>(() => {
        if (status !== "ready" || graph === null || canvas === null) {
            return null;
        }

        const entry =
            selectedGraphNode === null
                ? undefined
                : findNodeCatalogEntry(selectedGraphNode.type);

        const node =
            selectedGraphNode !== null && selectedCanvasNode !== null
                ? {
                      id: selectedGraphNode.id,
                      type: selectedGraphNode.type,
                      typeVersion: selectedGraphNode.typeVersion,
                      title: selectedCanvasNode.data.title,
                      status: nodeStatuses[selectedGraphNode.id] ?? "idle",
                      inputs: selectedCanvasNode.data.inputs,
                      outputs: selectedCanvasNode.data.outputs,
                      requirements: (selectedGraphNode.requires ?? []).map(
                          formatRequirement,
                      ),
                      config: selectedGraphNode.config,
                      ...(selectedCanvasNode.data.error === undefined
                          ? {}
                          : { error: selectedCanvasNode.data.error }),
                      ...(entry?.configSchema === undefined
                          ? {}
                          : { configSchema: entry.configSchema }),
                      ...(entry?.description === undefined
                          ? {}
                          : { description: entry.description }),
                      ...(entry?.category === undefined
                          ? {}
                          : { category: entry.category }),
                      ...(entry?.builtIn === undefined
                          ? {}
                          : { builtIn: entry.builtIn }),
                  }
                : null;

        return {
            graph: {
                id: graph.id,
                title: graph.title,
                nodeCount: graph.nodes.length,
                edgeCount: graph.edges.length,
                viewport: canvas.viewport,
            },
            node,
            canEdit: !editingDisabled,
            onUpdateConfig: updateNodeConfig,
        };
    }, [
        canvas,
        editingDisabled,
        graph,
        nodeStatuses,
        selectedCanvasNode,
        selectedGraphNode,
        status,
        updateNodeConfig,
    ]);

    useEffect(() => {
        onInspectorChange(inspector);
    }, [inspector, onInspectorChange]);

    useEffect(() => {
        return () => onInspectorChange(null);
    }, [onInspectorChange]);

    const runControls = useMemo<RunControls | null>(() => {
        if (status !== "ready" || graph === null || workspace === null) return null;

        return {
            canRun:
                !isRunning &&
                !isPaused &&
                !runBusy &&
                saveState.status !== "conflict",
            canPause: isRunning && !runBusy,
            canResume: isPaused && !runBusy,
            isRunning,
            isPaused,
            run: () => {
                void handleRun();
            },
            pause: () => {
                void pause();
            },
            resume: () => {
                void resume();
            },
            cancel: handleCancel,
        };
    }, [
        graph,
        handleCancel,
        handleRun,
        isPaused,
        isRunning,
        pause,
        resume,
        runBusy,
        saveState.status,
        status,
        workspace,
    ]);

    useEffect(() => {
        onRunControlsChange(runControls);
    }, [onRunControlsChange, runControls]);

    useEffect(() => {
        return () => onRunControlsChange(null);
    }, [onRunControlsChange]);

    const saveIndicator = useMemo<DesignerSaveStatus | null>(() => {
        if (status !== "ready") return null;
        if (saveState.status === "pending" || saveState.status === "saving") {
            return "saving";
        }
        return saveState.status;
    }, [saveState.status, status]);

    useEffect(() => {
        onSaveStatusChange(saveIndicator);
    }, [onSaveStatusChange, saveIndicator]);

    useEffect(() => {
        return () => onSaveStatusChange(null);
    }, [onSaveStatusChange]);

    if (workspace === null) {
        return (
            <div className={styles.state}>
                <EmptyState
                    title="还没有工作区"
                    description="创建一个工作区，开始编排第一个 Harness 工作流。"
                    action={
                        <Button
                            variant="primary"
                            aria-label="新建工作区"
                            disabled={busy}
                            onClick={onCreateWorkspace}
                        >
                            新建工作区
                        </Button>
                    }
                />
                {error ? (
                    <Alert tone="danger" title="工作区操作失败" className={styles.alert}>
                        {error}
                    </Alert>
                ) : null}
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className={styles.state}>
                <Alert tone="danger" title="无法加载工作流">
                    {loadError ?? "工作流文档不可用"}
                    <div className={styles.actions}>
                        <Button size="sm" onClick={reload}>
                            重试
                        </Button>
                    </div>
                </Alert>
            </div>
        );
    }

    if (status !== "ready" || canvas === null || graph === null) {
        return (
            <div className={styles.state}>
                <EmptyState title="正在打开工作流…" description={workspace.name} />
            </div>
        );
    }

    const displayError =
        runError ??
        (snapshot?.status === "failed" ? snapshot.error ?? "运行失败" : null);
    const saveMessage =
        saveState.status === "conflict" || saveState.status === "error"
            ? saveState.error
            : null;
    const hasBanners =
        invalidEdges.length > 0 ||
        issues.length > 0 ||
        displayError !== null ||
        saveState.status === "conflict" ||
        saveState.status === "error";

    return (
        <div ref={canvasRef} className={styles.canvas}>
            <CanvasView
                key={workspace.id}
                document={canvas}
                title={graph.title ?? workspace.name}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onCommand={applyCommand}
                nodeStatuses={nodeStatuses}
                readOnly={editingDisabled}
                onAddNode={openNodeLibrary}
                focusNode={focusNode}
            />

            {libraryOpen && !editingDisabled ? (
                <NodeLibraryPanel
                    entries={NODE_CATALOG}
                    presets={NODE_PRESETS}
                    recent={recentNodes}
                    anchor={libraryAnchor ?? undefined}
                    disabled={editingDisabled}
                    onAdd={handleAddNode}
                    onAddPreset={handleAddPreset}
                    onClose={() => {
                        setLibraryOpen(false);
                        setLibraryAnchor(null);
                    }}
                />
            ) : null}

            {hasBanners ? (
                <div className={styles.banners}>
                    {displayError !== null ? (
                        <Alert tone="danger" title="运行错误">
                            <p>{displayError}</p>
                            <div className={styles.actions}>
                                <Button size="sm" onClick={clearMessages}>
                                    关闭
                                </Button>
                            </div>
                        </Alert>
                    ) : issues.length > 0 ? (
                        <Alert tone="danger" title="无法运行：存在校验问题">
                            <ul className={styles.issues}>
                                {issues.slice(0, 4).map((issue, index) => (
                                    <li key={`${issue.code}-${index}`}>{issue.message}</li>
                                ))}
                                {issues.length > 4 ? (
                                    <li>还有 {issues.length - 4} 项问题…</li>
                                ) : null}
                            </ul>
                            <div className={styles.actions}>
                                <Button size="sm" onClick={clearMessages}>
                                    关闭
                                </Button>
                            </div>
                        </Alert>
                    ) : null}

                    {invalidEdges.length > 0 ? (
                        <Alert tone="warning" title="存在失效连线">
                            <ul className={styles.issues}>
                                {invalidEdges.slice(0, 3).map((edge) => (
                                    <li key={edge.id}>{edge.message}</li>
                                ))}
                                {invalidEdges.length > 3 ? (
                                    <li>还有 {invalidEdges.length - 3} 条失效连线…</li>
                                ) : null}
                            </ul>
                        </Alert>
                    ) : null}

                    {saveState.status === "conflict" ? (
                        <Alert tone="warning" title="保存冲突">
                            <p>{saveMessage}</p>
                            <div className={styles.actions}>
                                <Button size="sm" onClick={reload}>
                                    重新加载
                                </Button>
                            </div>
                        </Alert>
                    ) : null}

                    {saveState.status === "error" ? (
                        <Alert tone="danger" title="保存失败">
                            <p>{saveMessage}</p>
                            <div className={styles.actions}>
                                <Button size="sm" onClick={() => void flush()}>
                                    重试保存
                                </Button>
                            </div>
                        </Alert>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function formatRequirement(requirement: NodeRequirement): string {
    switch (requirement.kind) {
        case "tool":
            return `tool · ${requirement.name}`;
        case "provider":
            return `provider · ${requirement.providerId}`;
        case "model":
            return `model · ${requirement.providerId}/${requirement.modelId}`;
        case "parameter":
            return `parameter · ${requirement.name}`;
    }
}
