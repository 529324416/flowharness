import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { RunSnapshot, WorkspaceSummary } from "@flowharness/contracts";
import type {
    GraphDocument,
    NodePresetDocument,
    NodeRequirement,
    RequirementCatalog,
} from "wireclaw";
import {
    Alert,
    Button,
    EmptyState,
} from "../ui";
import type { CanvasEdgeStatus, CanvasNodeNotice } from "../canvas/core/types";
import { edgeKeyFromPorts } from "../canvas/core/edge-key";
import { CanvasView } from "../canvas/view/CanvasView";
import { toCanvasDocument, type CanvasPresentation } from "../designer/core/adapter";
import { collectProviderProblems, resolveModelProvider } from "../designer/core/provider-problems";
import { findInvalidEdges } from "../designer/core/edges";
import {
    copyNodes,
    pasteNodes,
    type NodeClipboard,
} from "../designer/core/commands";
import { findNodeCatalogEntry } from "../designer/core/catalog";
import { BUILTIN_PRESETS } from "../designer/core/presets";
import {
    collectDesignerProblems,
    type DesignerProblem,
    type DesignerProblemsModel,
} from "../designer/core/problems";
import {
    useDesignerDocument,
    type DesignerDocumentActions,
} from "../designer/state/useDesignerDocument";
import { useDesignerRun } from "../designer/state/useDesignerRun";
import { useRecentNodes } from "../designer/state/useRecentNodes";
import type { InspectorFieldOption, InspectorModel } from "../inspector/model";import type { RunControls } from "../run/run-controls";
import type { WorkbenchController } from "../workbench/types";
import { onPresetUiEvent } from "../presets/bus";
import {
    CreatePresetDialog,
    type PresetCapture,
} from "../presets/CreatePresetDialog";
import { usePresetLibrary } from "../presets/context";
import { NODE_DRAG_MIME, parseNodeDragPayload } from "../presets/drag";
import { toPresetDocument } from "../presets/model";
import { useProviderLibrary } from "../providers/context";
import { profileOptionLabel } from "../providers/model";
import {
    NODE_LIBRARY_MAX_HEIGHT,
    NODE_LIBRARY_WIDTH,
    NodeLibraryPalette,
} from "../presets/NodeLibraryPalette";
import styles from "./DesignerView.module.css";

export type DesignerSaveStatus = "saved" | "saving" | "conflict" | "error";

export type DesignerViewProps = {
    workspace: WorkspaceSummary | null;
    /** 当前打开的 Harness 文档 id；由外壳的文档菜单切换。 */
    documentId: string | null;
    busy?: boolean;
    /** 工作区 / 文档操作失败的错误；文档加载错误在内部处理。 */
    error?: string | null;
    onCreateWorkspace: () => void;
    /** 空态 CTA：新建一条工作流。 */
    onCreateDocument: () => void;
    onRunWillStart: () => void | Promise<void>;
    onRunStarted: (snapshot: RunSnapshot) => void;
    onRunControlsChange: (controls: RunControls | null) => void;
    onSaveStatusChange: (status: DesignerSaveStatus | null) => void;
    onInspectorChange: (model: InspectorModel | null) => void;
    onProblemsChange: (model: DesignerProblemsModel | null) => void;
    onDocumentActionsChange: (actions: DesignerDocumentActions | null) => void;
    onControllerChange: (controller: WorkbenchController | null) => void;
    /** 保存冲突时把当前内存文档另存为副本。 */
    onSaveConflictCopy: (graph: GraphDocument) => void;
};

/** 设计器视图：加载 / 编辑 / 自动保存一份 Harness GraphDocument。 */
export function DesignerView({
    workspace,
    documentId,
    busy = false,
    error,
    onCreateWorkspace,
    onCreateDocument,
    onRunWillStart,
    onRunStarted,
    onRunControlsChange,
    onSaveStatusChange,
    onInspectorChange,
    onProblemsChange,
    onDocumentActionsChange,
    onControllerChange,
    onSaveConflictCopy,
}: DesignerViewProps): ReactElement {
    const {
        status,
        document: graph,
        error: loadError,
        saveState,
        canUndo,
        canRedo,
        undo,
        redo,
        reload,
        applyCommand,
        addNode,
        addNodeFromPreset,
        updateNodeConfig,
        replaceDocument,
        flush,
    } = useDesignerDocument(workspace?.id ?? null, documentId);
    const canvasRef = useRef<HTMLDivElement>(null);
    const clipboardRef = useRef<NodeClipboard | null>(null);
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const [selectionRequest, setSelectionRequest] = useState<{
        nodeIds: string[];
        seq: number;
    } | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryAnchor, setLibraryAnchor] = useState<{ x: number; y: number } | null>(
        null,
    );
    const [libraryInsert, setLibraryInsert] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [presetCapture, setPresetCapture] = useState<PresetCapture | null>(null);
    const { library, managerOpen } = usePresetLibrary();
    const [focusNode, setFocusNode] = useState<{
        nodeId: string;
        seq: number;
    } | null>(null);
    const requestSelection = useCallback((nodeIds: string[]): void => {
        setSelectedNodeIds(nodeIds);
        setSelectionRequest((current) => ({
            nodeIds,
            seq: (current?.seq ?? 0) + 1,
        }));
    }, []);
    const { entries: recentNodes, record: recordRecentNode } = useRecentNodes();
    const { view: providerLibrary } = useProviderLibrary();

    const requirementCatalog = useMemo<RequirementCatalog>(
        () => ({
            providers: providerLibrary.profiles
                .filter((status) => status.available)
                .map((status) => status.profile.id),
            models: providerLibrary.profiles.flatMap((status) =>
                status.profile.models.map((model) => ({
                    providerId: status.profile.id,
                    modelId: model.id,
                })),
            ),
        }),
        [providerLibrary],
    );

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
    } = useDesignerRun(requirementCatalog);

    useEffect(() => {
        setSelectedNodeIds([]);
        setSelectionRequest((current) => ({
            nodeIds: [],
            seq: (current?.seq ?? 0) + 1,
        }));
        setLibraryOpen(false);
        setLibraryAnchor(null);
        setLibraryInsert(null);
        setFocusNode(null);
        clipboardRef.current = null;
    }, [documentId]);

    useEffect(() => {
        reset();
    }, [workspace?.id, documentId, reset]);

    // 删除 / 撤销后清掉已经不在图里的选中项。
    useEffect(() => {
        if (graph === null) return;
        setSelectedNodeIds((current) => {
            const ids = new Set(graph.nodes.map((node) => node.id));
            const next = current.filter((id) => ids.has(id));
            return next.length === current.length ? current : next;
        });
    }, [graph]);

    const invalidEdges = useMemo(
        () => (graph === null ? [] : findInvalidEdges(graph)),
        [graph],
    );

    const edgeStatuses = useMemo(() => {
        const merged: Record<string, CanvasEdgeStatus> = { ...runEdgeStatuses };
        for (const edge of invalidEdges) merged[edge.id] = "error";
        return merged;
    }, [invalidEdges, runEdgeStatuses]);

    const baseProblems = useMemo(
        () =>
            graph === null
                ? []
                : collectDesignerProblems(graph, { invalidEdges }),
        [graph, invalidEdges],
    );

    const providerProblems = useMemo(
        () =>
            graph === null
                ? []
                : collectProviderProblems(graph, providerLibrary),
        [graph, providerLibrary],
    );

    const providerErrors = useMemo(
        () => providerProblems.filter((problem) => problem.severity === "error"),
        [providerProblems],
    );
    const hasProviderErrors = providerErrors.length > 0;

    const providerNotices = useMemo(() => {
        const notices: Record<string, CanvasNodeNotice> = {};
        for (const problem of providerProblems) {
            if (problem.nodeId === undefined) continue;
            const current = notices[problem.nodeId];
            if (
                current === undefined ||
                (problem.severity === "error" && current.severity === "warning")
            ) {
                notices[problem.nodeId] = {
                    severity: problem.severity === "error" ? "danger" : "warning",
                    message: problem.message,
                };
            }
        }
        return notices;
    }, [providerProblems]);

    const providerPresentation = useMemo<Record<string, CanvasPresentation>>(() => {
        const presentation: Record<string, CanvasPresentation> = {};
        if (graph === null) return presentation;

        for (const node of graph.nodes) {
            const config = isRecord(node.config) ? node.config : {};
            const modelId =
                typeof config.modelId === "string" && config.modelId.length > 0
                    ? config.modelId
                    : undefined;

            if (node.type === "core.provider") {
                const providerId =
                    typeof config.providerId === "string"
                        ? config.providerId
                        : undefined;
                const status = providerLibrary.profiles.find(
                    (item) => item.profile.id === providerId,
                );
                const label = status?.profile.label ?? providerId;
                if (label !== undefined) presentation[node.id] = { summary: label };
                continue;
            }

            if (node.type !== "core.model") continue;
            const binding = resolveModelProvider(graph, node);
            if (!binding.connected) continue;
            const status = providerLibrary.profiles.find(
                (item) => item.profile.id === binding.providerId,
            );
            const label = status?.profile.label ?? binding.providerId;
            const summary = [label, modelId].filter(Boolean).join(" · ");
            if (summary.length > 0) presentation[node.id] = { summary };
        }

        return presentation;
    }, [graph, providerLibrary]);

    const canvas = useMemo(
        () =>
            graph === null
                ? null
                : toCanvasDocument(graph, {
                      edgeStatuses,
                      notices: providerNotices,
                      presentation: providerPresentation,
                  }),
        [edgeStatuses, graph, providerNotices, providerPresentation],
    );

    const problems = useMemo(
        () => [...baseProblems, ...providerProblems],
        [baseProblems, providerProblems],
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

            requestSelection([nodeId]);
            setFocusNode((current) => ({
                nodeId,
                seq: (current?.seq ?? 0) + 1,
            }));
        },
        [graph, requestSelection],
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

    const documentActions = useMemo<DesignerDocumentActions>(
        () => ({ flush, reload }),
        [flush, reload],
    );

    useEffect(() => {
        onDocumentActionsChange(documentActions);
    }, [documentActions, onDocumentActionsChange]);

    useEffect(() => {
        return () => onDocumentActionsChange(null);
    }, [onDocumentActionsChange]);

    const handleRun = useCallback(async (): Promise<void> => {
        if (graph === null || workspace === null) return;
        if (hasProviderErrors) return;

        const started = await start(graph, workspace.id, onRunWillStart);
        if (started !== null) onRunStarted(started);
    }, [graph, hasProviderErrors, onRunStarted, onRunWillStart, start, workspace]);

    const handleCancel = useCallback((): void => {
        void cancel();
    }, [cancel]);

    /** 打开插入菜单；screen 是视口坐标（用于锚点），flow 是画布落点。 */
    const openNodeLibrary = useCallback(
        (
            screen?: { x: number; y: number },
            flow?: { x: number; y: number },
        ): void => {
            setLibraryInsert(flow ?? null);
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect === undefined) {
                setLibraryAnchor(null);
                setLibraryOpen(true);
                return;
            }

            if (screen === undefined) {
                setLibraryAnchor({
                    x: Math.max(12, rect.width / 2 - NODE_LIBRARY_WIDTH / 2),
                    y: 16,
                });
                setLibraryOpen(true);
                return;
            }

            const panelWidth = NODE_LIBRARY_WIDTH;
            const panelHeight = NODE_LIBRARY_MAX_HEIGHT;
            const edge = 12;
            setLibraryAnchor({
                x: Math.min(
                    Math.max(edge, screen.x - rect.left),
                    Math.max(edge, rect.width - panelWidth - edge),
                ),
                y: Math.min(
                    Math.max(edge, screen.y - rect.top),
                    Math.max(edge, rect.height - panelHeight - edge),
                ),
            });
            setLibraryOpen(true);
        },
        [],
    );

    const handleAddNode = useCallback(
        (type: string, position?: { x: number; y: number }): void => {
            addNode(type, position);
            recordRecentNode({ kind: "type", id: type });
        },
        [addNode, recordRecentNode],
    );

    const handleAddPreset = useCallback(
        (preset: NodePresetDocument, position?: { x: number; y: number }): void => {
            addNodeFromPreset(preset, position);
            recordRecentNode({ kind: "preset", id: preset.presetId });
        },
        [addNodeFromPreset, recordRecentNode],
    );

    const copySelection = useCallback((): void => {
        if (graph === null || selectedNodeIds.length === 0) return;
        clipboardRef.current = copyNodes(graph, selectedNodeIds);
    }, [graph, selectedNodeIds]);

    const pasteSelection = useCallback((): void => {
        if (graph === null) return;
        const clipboard = clipboardRef.current;
        if (clipboard === null) return;

        const result = pasteNodes(graph, clipboard);
        if (result.nodeIds.length === 0) return;

        replaceDocument(result.graph);
        requestSelection(result.nodeIds);
    }, [graph, replaceDocument, requestSelection]);

    const isRunning = runStatus === "running";
    const isPaused = runStatus === "paused";
    const runBusy = starting || controlling;
    const editingDisabled =
        isRunning || isPaused || runBusy || saveState.status === "conflict";

    const resolvePreset = useCallback(
        (presetId: string): NodePresetDocument | null => {
            const user = library.presets.find((item) => item.id === presetId);
            if (user !== undefined) return toPresetDocument(user);
            return (
                BUILTIN_PRESETS.find((item) => item.presetId === presetId) ?? null
            );
        },
        [library.presets],
    );

    const handleCreatePreset = useCallback(
        (nodeId: string): void => {
            const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
            if (node === undefined) return;
            setPresetCapture({
                type: node.type,
                typeVersion: node.typeVersion,
                ...(node.config === undefined
                    ? {}
                    : { config: structuredClone(node.config) }),
            });
        },
        [graph],
    );

    const handleDropNode = useCallback(
        (raw: string, position: { x: number; y: number }): void => {
            if (editingDisabled) return;
            const payload = parseNodeDragPayload(raw);
            if (payload === null) return;

            setLibraryOpen(false);
            setLibraryAnchor(null);
            setLibraryInsert(null);

            if (payload.kind === "type") {
                handleAddNode(payload.type, position);
                return;
            }
            const preset = resolvePreset(payload.presetId);
            if (preset !== null) handleAddPreset(preset, position);
        },
        [editingDisabled, handleAddNode, handleAddPreset, resolvePreset],
    );

    // 标题栏 / 快捷键请求打开插入菜单。
    useEffect(
        () =>
            onPresetUiEvent((event) => {
                if (event.type !== "open-insert") return;
                if (editingDisabled) return;
                openNodeLibrary(event.anchor);
            }),
        [editingDisabled, openNodeLibrary],
    );

    useEffect(() => {
        if (!managerOpen) return;
        setLibraryOpen(false);
        setLibraryAnchor(null);
        setLibraryInsert(null);
    }, [managerOpen]);

    const undoEdit = useCallback((): void => {
        if (editingDisabled || !canUndo) return;
        undo();
    }, [canUndo, editingDisabled, undo]);

    const redoEdit = useCallback((): void => {
        if (editingDisabled || !canRedo) return;
        redo();
    }, [canRedo, editingDisabled, redo]);

    // M4 编辑快捷键：仅设计器挂载时生效，输入框内不拦截。
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (!(event.ctrlKey || event.metaKey)) return;

            const target = event.target;
            if (
                target instanceof HTMLElement &&
                target.closest("input, textarea, select, [contenteditable='true']")
            ) {
                return;
            }

            switch (event.key.toLowerCase()) {
                case "z":
                    event.preventDefault();
                    if (event.shiftKey) redoEdit();
                    else undoEdit();
                    break;
                case "y":
                    event.preventDefault();
                    redoEdit();
                    break;
                case "c":
                    if (editingDisabled) return;
                    event.preventDefault();
                    copySelection();
                    break;
                case "v":
                    if (editingDisabled) return;
                    event.preventDefault();
                    pasteSelection();
                    break;
                case "s":
                    event.preventDefault();
                    void flush();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        copySelection,
        editingDisabled,
        flush,
        pasteSelection,
        redoEdit,
        undoEdit,
    ]);

    const selectedNodeId = selectedNodeIds[0] ?? null;
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

        const selectedConfig = isRecord(selectedGraphNode?.config)
            ? selectedGraphNode.config
            : {};
        const selectedProviderId =
            typeof selectedConfig.providerId === "string"
                ? selectedConfig.providerId
                : undefined;
        const selectedModelId =
            typeof selectedConfig.modelId === "string"
                ? selectedConfig.modelId
                : undefined;
        const providerOptions: InspectorFieldOption[] =
            providerLibrary.profiles.map((status) => ({
                value: status.profile.id,
                label: profileOptionLabel(status),
            }));
        const selectedProfile = providerLibrary.profiles.find(
            (status) => status.profile.id === selectedProviderId,
        );
        const modelOptionList: InspectorFieldOption[] =
            selectedProfile?.profile.models.map((model) => ({
                value: model.id,
                label: model.name || model.id,
            })) ?? [];
        const selectedType = selectedGraphNode?.type;
        const isModelNode = selectedType === "core.model";
        const isProviderNode = selectedType === "core.provider";
        const fieldOptions =
            isModelNode || isProviderNode
                ? {
                      providerId: withCurrentOption(
                          providerOptions,
                          selectedProviderId,
                          "缺失的 Provider",
                      ),
                      ...(isModelNode
                          ? {
                                modelId: withCurrentOption(
                                    modelOptionList,
                                    selectedModelId,
                                    "不在目录中的模型",
                                ),
                            }
                          : {}),
                  }
                : undefined;

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
                      ...(fieldOptions === undefined ? {} : { fieldOptions }),
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
        providerLibrary,
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
                !hasProviderErrors &&
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
        hasProviderErrors,
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

    const controller = useMemo<WorkbenchController | null>(() => {
        if (status !== "ready" || graph === null) return null;

        return {
            status: runStatus,
            canUndo,
            canRedo,
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
            undo: undoEdit,
            redo: redoEdit,
            save: async () => {
                await flush();
            },
        };
    }, [
        canRedo,
        canUndo,
        flush,
        graph,
        handleCancel,
        handleRun,
        pause,
        redoEdit,
        resume,
        runStatus,
        status,
        undoEdit,
    ]);

    useEffect(() => {
        onControllerChange(controller);
    }, [controller, onControllerChange]);

    useEffect(() => {
        return () => onControllerChange(null);
    }, [onControllerChange]);

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

    if (documentId === null) {
        return (
            <div className={styles.state}>
                <EmptyState
                    title="还没有打开的工作流"
                    description="从左侧工作流列表选择一条，或新建一条开始编排。"
                    action={
                        <Button
                            variant="primary"
                            disabled={busy}
                            onClick={onCreateDocument}
                        >
                            新建工作流
                        </Button>
                    }
                />
                {error ? (
                    <Alert tone="danger" title="工作流操作失败" className={styles.alert}>
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
                    {loadError ?? "工作流不可用"}
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
        (error !== null && error !== undefined) ||
        invalidEdges.length > 0 ||
        issues.length > 0 ||
        hasProviderErrors ||
        displayError !== null ||
        saveState.status === "conflict" ||
        saveState.status === "error";

    return (
        <div ref={canvasRef} className={styles.canvas}>
            <CanvasView
                key={`${workspace.id}:${documentId ?? "none"}`}
                document={canvas}
                title={graph.title ?? workspace.name}
                selectedNodeIds={selectedNodeIds}
                selectionRequest={selectionRequest}
                onSelectionChange={setSelectedNodeIds}
                onCommand={applyCommand}
                nodeStatuses={nodeStatuses}
                readOnly={editingDisabled}
                onAddNode={openNodeLibrary}
                onCreatePreset={handleCreatePreset}
                onDropNode={handleDropNode}
                dropMimeType={NODE_DRAG_MIME}
                focusNode={focusNode}
                onUpdateNodeConfig={updateNodeConfig}
            />

            {libraryOpen && !editingDisabled ? (
                <NodeLibraryPalette
                    recent={recentNodes}
                    anchor={libraryAnchor ?? undefined}
                    disabled={editingDisabled}
                    onAddType={(type) =>
                        handleAddNode(type, libraryInsert ?? undefined)
                    }
                    onAddPreset={(preset) =>
                        handleAddPreset(preset, libraryInsert ?? undefined)
                    }
                    onClose={() => {
                        setLibraryOpen(false);
                        setLibraryAnchor(null);
                        setLibraryInsert(null);
                    }}
                />
            ) : null}

            <CreatePresetDialog
                open={presetCapture !== null}
                capture={presetCapture}
                onOpenChange={(open) => {
                    if (!open) setPresetCapture(null);
                }}
            />

            {hasBanners ? (
                <div className={styles.banners}>
                    {error !== null && error !== undefined ? (
                        <Alert tone="danger" title="工作流操作失败">
                            <p>{error}</p>
                        </Alert>
                    ) : null}

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

                    {hasProviderErrors ? (
                        <Alert tone="danger" title="无法运行：Provider 配置存在问题">
                            <ul className={styles.issues}>
                                {providerErrors.slice(0, 4).map((problem) => (
                                    <li key={problem.id}>{problem.message}</li>
                                ))}
                                {providerErrors.length > 4 ? (
                                    <li>还有 {providerErrors.length - 4} 项问题…</li>
                                ) : null}
                            </ul>
                            <div className={styles.actions}>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        const first = providerErrors[0];
                                        if (first !== undefined) selectProblem(first);
                                    }}
                                >
                                    定位第一个问题
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
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => onSaveConflictCopy(graph)}
                                >
                                    另存为副本
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

function withCurrentOption(
    options: readonly InspectorFieldOption[],
    value: string | undefined,
    missingLabel: string,
): InspectorFieldOption[] {
    if (value === undefined || value.length === 0) return [...options];
    if (options.some((option) => option.value === value)) return [...options];
    return [{ value, label: `${value}（${missingLabel}）` }, ...options];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
