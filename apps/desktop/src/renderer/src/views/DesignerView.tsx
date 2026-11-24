import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import type { RunSnapshot, WorkspaceSummary } from "@flowharness/contracts";
import type { NodeRequirement } from "wireclaw";
import { Plus } from "lucide-react";
import {
    Alert,
    Button,
    EmptyState,
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuTrigger,
} from "../ui";
import { CanvasView } from "../canvas/view/CanvasView";
import { toCanvasDocument } from "../designer/core/adapter";
import { NODE_CATALOG } from "../designer/core/catalog";
import { useDesignerDocument } from "../designer/state/useDesignerDocument";
import { useDesignerRun } from "../designer/state/useDesignerRun";
import type { InspectorModel } from "../inspector/model";
import type { RunControls } from "../run/run-controls";
import styles from "./DesignerView.module.css";

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
}: DesignerViewProps): ReactElement {
    const {
        status,
        document: graph,
        error: loadError,
        saveState,
        reload,
        applyCommand,
        addNode,
        updateNodeConfig,
        flush,
    } = useDesignerDocument(workspace?.id ?? null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const {
        snapshot,
        status: runStatus,
        starting,
        issues,
        error: runError,
        nodeStatuses,
        start,
        cancel,
        reset,
        clearMessages,
    } = useDesignerRun();

    useEffect(() => {
        setSelectedNodeId(null);
    }, [graph?.id]);

    useEffect(() => {
        reset();
    }, [workspace?.id, reset]);

    const canvas = useMemo(
        () => (graph === null ? null : toCanvasDocument(graph)),
        [graph],
    );

    const handleRun = useCallback(async (): Promise<void> => {
        if (graph === null || workspace === null) return;

        const started = await start(graph, workspace.id, onRunWillStart);
        if (started !== null) onRunStarted(started);
    }, [graph, onRunStarted, onRunWillStart, start, workspace]);

    const handleCancel = useCallback((): void => {
        void cancel();
    }, [cancel]);

    const isRunning = runStatus === "running" || runStatus === "paused";
    const editingDisabled =
        isRunning || starting || saveState.status === "conflict";

    const selectedGraphNode =
        graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
    const selectedCanvasNode =
        canvas?.nodes.find((node) => node.id === selectedNodeId) ?? null;

    const inspector = useMemo<InspectorModel | null>(() => {
        if (status !== "ready" || graph === null || canvas === null) {
            return null;
        }

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
                !isRunning && !starting && saveState.status !== "conflict",
            isRunning,
            run: () => {
                void handleRun();
            },
            cancel: handleCancel,
        };
    }, [
        graph,
        handleCancel,
        handleRun,
        isRunning,
        saveState.status,
        starting,
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
        issues.length > 0 ||
        displayError !== null ||
        saveState.status === "conflict" ||
        saveState.status === "error";

    return (
        <div className={styles.canvas}>
            <CanvasView
                key={workspace.id}
                document={canvas}
                title={graph.title ?? workspace.name}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onCommand={applyCommand}
                nodeStatuses={nodeStatuses}
                readOnly={editingDisabled}
            />

            <div className={styles.toolbar}>
                <Menu>
                    <MenuTrigger asChild>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={editingDisabled}
                        >
                            <Plus size={15} aria-hidden="true" />
                            添加节点
                        </Button>
                    </MenuTrigger>
                    <MenuContent
                        align="start"
                        side="bottom"
                        className={styles.nodeMenu}
                    >
                        <MenuLabel>节点类型</MenuLabel>
                        {NODE_CATALOG.map((entry) => (
                            <MenuItem
                                key={entry.type}
                                disabled={entry.error !== undefined}
                                onSelect={() => addNode(entry.type)}
                            >
                                {entry.title ?? entry.type}
                            </MenuItem>
                        ))}
                    </MenuContent>
                </Menu>
            </div>

            {hasBanners ? (
                <div className={styles.banners}>
                    {displayError !== null ? (
                        <Alert tone="danger" title="运行失败">
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
