import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type {
    ProviderLibraryView,
    RunSnapshot,
    WorkspaceSummary,
} from "@flowharness/contracts";
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
import type {
    CanvasCommand,
    CanvasEdgeStatus,
    CanvasLockedField,
    CanvasNodeNotice,
} from "../canvas/core/types";
import { edgeKeyFromPorts } from "../canvas/core/edge-key";
import { CanvasView } from "../canvas/view/CanvasView";
import {
    DEFAULT_PANEL_LAYOUT,
    type PanelLayoutState,
} from "../layout-metrics";
import { toCanvasDocument, type CanvasPresentation } from "../designer/core/adapter";
import {
    collectProviderProblems,
    findIncompatibleModels,
    resolveModelProvider,
    resolveNodeModelBinding,
} from "../designer/core/provider-problems";
import { collectProviderCatalogRequests } from "../designer/core/provider-catalog";
import { findInvalidEdges } from "../designer/core/edges";
import {
    copyNodes,
    pasteNodes,
    type NodeClipboard,
} from "../designer/core/commands";
import {
    readPanelLayout,
    samePanelLayout,
    withPanelLayout,
} from "../designer/core/panel-layout";
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
import type {
    InspectorFieldOption,
    InspectorModel,
    InspectorNodeModel,
} from "../inspector/model";
import type { RunControls } from "../run/run-controls";
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
    /** 浮动面板当前布局；由 Shell 的 useFloatingPanels 提供。 */
    panels: readonly PanelLayoutState[];
    /** 应用当前图保存的浮动面板布局；null 表示默认布局。 */
    onApplyPanelLayout: (layout: readonly PanelLayoutState[] | null) => void;
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
    panels,
    onApplyPanelLayout,
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
        updateGraphUi,
        replaceDocument,
        flush,
    } = useDesignerDocument(workspace?.id ?? null, documentId);
    const canvasRef = useRef<HTMLDivElement>(null);
    const clipboardRef = useRef<NodeClipboard | null>(null);
    const panelHydratedDocumentRef = useRef<string | null>(null);
    const panelBaselineRef = useRef<readonly PanelLayoutState[] | null>(null);
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
    const {
        view: providerLibrary,
        refresh: refreshProviderLibrary,
    } = useProviderLibrary();
    /** 连接 / 切换 Provider 后清空不兼容模型，并向用户说明原因。 */
    const [modelResetNotice, setModelResetNotice] = useState<string[] | null>(
        null,
    );
    /** 空模型目录的实机刷新状态；key 是 Provider profile id。 */
    const [catalogRefreshes, setCatalogRefreshes] = useState<
        Record<string, { status: "loading" | "error"; error?: string }>
    >({});
    const attemptedCatalogRefreshRef = useRef<Set<string>>(new Set());

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

    const providerOptions = useMemo<InspectorFieldOption[]>(
        () =>
            providerLibrary.profiles.map((status) => ({
                value: status.profile.id,
                label: profileOptionLabel(status),
            })),
        [providerLibrary],
    );

    /** 节点内联下拉只显示短标签，避免 220px 节点被适配器名撑满。 */
    const inlineProviderOptions = useMemo<InspectorFieldOption[]>(
        () =>
            providerLibrary.profiles.map((status) => ({
                value: status.profile.id,
                label: status.profile.label,
            })),
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
        nodeMetrics,
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
        setModelResetNotice(null);
        setCatalogRefreshes({});
        attemptedCatalogRefreshRef.current = new Set();
        panelHydratedDocumentRef.current = null;
        panelBaselineRef.current = null;
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

    /**
     * 阻断运行的 Provider 错误。
     *
     * 「Model 节点未选择模型」是用户主动清空后的待补全状态：只在节点标题
     * 保留红色叹号（providerNotices 仍按 error 投影），不弹横幅、不阻断运行。
     */
    const providerErrors = useMemo(
        () =>
            providerProblems.filter(
                (problem) =>
                    problem.severity === "error" &&
                    !problem.id.endsWith(":missing-model"),
            ),
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

    // 模型目录为空且未检测过时，在后台实机刷新一次；成功后 main 持久化并广播。
    useEffect(() => {
        if (graph === null) return;
        const requests = collectProviderCatalogRequests(graph, providerLibrary);

        for (const request of requests) {
            if (attemptedCatalogRefreshRef.current.has(request.profileId)) {
                continue;
            }
            attemptedCatalogRefreshRef.current.add(request.profileId);
            setCatalogRefreshes((current) => ({
                ...current,
                [request.profileId]: { status: "loading" },
            }));

            void (async () => {
                const result = await window.flowharness.refreshProviderModels({
                    profileId: request.profileId,
                });
                if (!result.ok) {
                    setCatalogRefreshes((current) => ({
                        ...current,
                        [request.profileId]: {
                            status: "error",
                            error: result.error.message,
                        },
                    }));
                    return;
                }
                if (result.data.error !== undefined) {
                    setCatalogRefreshes((current) => ({
                        ...current,
                        [request.profileId]: {
                            status: "error",
                            error: result.data.error,
                        },
                    }));
                    return;
                }

                setCatalogRefreshes((current) => {
                    const next = { ...current };
                    delete next[request.profileId];
                    return next;
                });
                await refreshProviderLibrary();
            })();
        }
    }, [graph, providerLibrary, refreshProviderLibrary]);

    const providerFieldOptions = useMemo<
        Record<string, Record<string, InspectorFieldOption[]>>
    >(() => {
        const map: Record<string, Record<string, InspectorFieldOption[]>> = {};
        if (graph === null) return map;

        for (const node of graph.nodes) {
            const config = isRecord(node.config) ? node.config : {};

            if (node.type === "core.provider") {
                const providerId =
                    typeof config.providerId === "string" &&
                    config.providerId.length > 0
                        ? config.providerId
                        : undefined;
                map[node.id] = {
                    providerId: withCurrentOption(
                        inlineProviderOptions,
                        providerId,
                        "缺失的 Provider",
                    ),
                };
                continue;
            }

            if (
                node.type !== "core.model" &&
                node.type !== "core.model.call" &&
                node.type !== "core.agent.run"
            ) {
                continue;
            }

            const configProviderId =
                typeof config.providerId === "string" &&
                config.providerId.length > 0
                    ? config.providerId
                    : undefined;
            const configModelId =
                typeof config.modelId === "string" && config.modelId.length > 0
                    ? config.modelId
                    : undefined;
            let effectiveProviderId = configProviderId;
            let effectiveModelId = configModelId;

            if (node.type === "core.model") {
                const binding = resolveModelProvider(graph, node);
                if (binding.connected && binding.sourceIsProvider) {
                    effectiveProviderId = binding.providerId;
                }
            } else {
                const binding = resolveNodeModelBinding(graph, node);
                if (binding.connected) {
                    effectiveProviderId = binding.providerId;
                    effectiveModelId = binding.modelId;
                }
            }

            const profile = providerLibrary.profiles.find(
                (status) => status.profile.id === effectiveProviderId,
            );
            const modelOptions: InspectorFieldOption[] =
                profile?.profile.models.map((model) => ({
                    value: model.id,
                    label: model.name || model.id,
                })) ?? [];

            map[node.id] = {
                providerId: withCurrentOption(
                    inlineProviderOptions,
                    effectiveProviderId,
                    "缺失的 Provider",
                ),
                modelId: [
                    { value: "", label: "未选择模型" },
                    ...withCurrentOption(
                        modelOptions,
                        effectiveModelId,
                        "不在目录中的模型",
                    ),
                ],
            };
        }

        return map;
    }, [graph, inlineProviderOptions, providerLibrary]);

    /**
     * 所有被上游连接固定的字段（Model 的 provider、Model Call / Agent 的模型
     * 与各数据输入）。连接存在时字段在节点内改为只读展示，不再提供本地编辑。
     */
    const nodeFieldLocks = useMemo<
        Record<string, Record<string, CanvasLockedField>>
    >(() => {
        const map: Record<string, Record<string, CanvasLockedField>> = {};
        if (graph === null) return map;
        const byId = new Map(graph.nodes.map((node) => [node.id, node]));

        for (const edge of graph.edges) {
            const target = byId.get(edge.to.nodeId);
            const source = byId.get(edge.from.nodeId);
            if (target === undefined || source === undefined) continue;

            const fields = lockedFieldNames(target.type, edge.to.port);
            if (fields.length === 0) continue;

            const bucket = map[target.id] ?? (map[target.id] = {});
            for (const field of fields) {
                bucket[field] = {
                    value: describeLockedFieldValue(
                        graph,
                        source,
                        field,
                        providerLibrary,
                    ),
                    reason: "由上游节点连接固定",
                };
            }
        }

        return map;
    }, [graph, providerLibrary]);

    const providerSlotLabels = useMemo<Record<string, Record<string, string>>>(
        () => {
            const labels: Record<string, Record<string, string>> = {};
            if (graph === null) return labels;

            for (const node of graph.nodes) {
                if (node.type !== "core.model") continue;
                const binding = resolveModelProvider(graph, node);
                if (!binding.connected || !binding.sourceIsProvider) continue;
                const status = providerLibrary.profiles.find(
                    (item) => item.profile.id === binding.providerId,
                );
                labels[node.id] = {
                    provider:
                        status?.profile.label ?? binding.providerId ?? "已连接",
                };
            }

            return labels;
        },
        [graph, providerLibrary],
    );

    const canvas = useMemo(
        () =>
            graph === null
                ? null
                : toCanvasDocument(graph, {
                      edgeStatuses,
                      notices: providerNotices,
                      presentation: providerPresentation,
                      fieldOptions: providerFieldOptions,
                      lockedFields: nodeFieldLocks,
                      slotLabels: providerSlotLabels,
                      nodeMetrics,
                  }),
        [
            edgeStatuses,
            graph,
            nodeFieldLocks,
            nodeMetrics,
            providerFieldOptions,
            providerNotices,
            providerPresentation,
            providerSlotLabels,
        ],
    );

    /**
     * 展示用问题列表（运行日志 / 问题行）。
     *
     * 「未选择模型」只在节点标题显示红色叹号（providerNotices 仍按 error 投影），
     * 不进入问题列表、不弹横幅、不阻断运行（ADR-037 修订）。
     */
    const problems = useMemo(
        () =>
            [...baseProblems, ...providerProblems].filter(
                (problem) => !problem.id.endsWith(":missing-model"),
            ),
        [baseProblems, providerProblems],
    );

    // 每张图拥有自己的浮动面板布局：打开文档时恢复，拖动 / 缩放后写回 ui.panels。
    useEffect(() => {
        if (
            graph === null ||
            documentId === null ||
            graph.id !== documentId
        ) {
            return;
        }

        const key = `${workspace?.id ?? ""}:${documentId}`;
        if (panelHydratedDocumentRef.current === key) return;
        panelHydratedDocumentRef.current = key;

        const saved = readPanelLayout(graph.ui);
        // 旧图没有保存布局时，先记录默认布局；只有用户真正改动后才写回。
        panelBaselineRef.current = saved ?? DEFAULT_PANEL_LAYOUT;
        onApplyPanelLayout(saved);
    }, [documentId, graph, onApplyPanelLayout, workspace?.id]);

    useEffect(() => {
        if (
            graph === null ||
            documentId === null ||
            graph.id !== documentId
        ) {
            return;
        }

        const key = `${workspace?.id ?? ""}:${documentId}`;
        if (panelHydratedDocumentRef.current !== key) return;

        const stored = readPanelLayout(graph.ui);
        if (stored === null) {
            if (samePanelLayout(panelBaselineRef.current, panels)) return;
        } else if (samePanelLayout(stored, panels)) {
            return;
        }

        // 拖动过程中会连续更新，等停稳后再写回文档，避免每个 pointermove 都保存。
        const timer = window.setTimeout(() => {
            updateGraphUi((current) => ({
                ...current,
                ui: withPanelLayout(current.ui, panels),
            }));
        }, 400);

        return () => window.clearTimeout(timer);
    }, [documentId, graph, panels, updateGraphUi, workspace?.id]);

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

    const notifyModelResets = useCallback(
        (resets: readonly { modelId: string; providerLabel: string }[]): void => {
            if (resets.length === 0) return;
            setModelResetNotice(
                resets.map(
                    (reset) =>
                        `模型 “${reset.modelId}” 不在 Provider “${reset.providerLabel}” 的模型目录中，已清空，请重新选择模型。`,
                ),
            );
        },
        [],
    );

    /**
     * Provider 输入连接后，立即固定连接值并清空不兼容的模型。
     * 连接优先于 config.providerId，因此需要把来源 Provider 的目录作为约束。
     */
    const handleCanvasCommand = useCallback(
        (command: CanvasCommand): void => {
            applyCommand(command);

            if (
                command.type !== "connect" ||
                command.to.port !== "provider" ||
                graph === null
            ) {
                return;
            }

            const target = graph.nodes.find(
                (node) => node.id === command.to.nodeId,
            );
            const source = graph.nodes.find(
                (node) => node.id === command.from.nodeId,
            );
            if (target?.type !== "core.model" || source?.type !== "core.provider") {
                return;
            }

            const sourceConfig = isRecord(source.config) ? source.config : {};
            const targetConfig = isRecord(target.config) ? target.config : {};
            const providerId = readStringField(sourceConfig, "providerId");
            const modelId = readStringField(targetConfig, "modelId");
            const resets = findIncompatibleModels(providerLibrary, [
                { nodeId: target.id, providerId, modelId },
            ]);
            const nextConfig: Record<string, unknown> = { ...targetConfig };
            if (providerId !== undefined) {
                nextConfig.providerId = providerId;
            }
            if (resets.length > 0) {
                delete nextConfig.modelId;
            }

            const changed =
                resets.length > 0 ||
                (providerId !== undefined &&
                    targetConfig.providerId !== providerId);
            if (!changed) return;

            updateNodeConfig(target.id, nextConfig);
            notifyModelResets(resets);
        },
        [
            applyCommand,
            graph,
            notifyModelResets,
            providerLibrary,
            updateNodeConfig,
        ],
    );

    /**
     * 节点内联 / 检查器统一的 config 写入：
     * - 连接中 Model 的 providerId 不可被改写；
     * - 连接中 Model 选择不兼容模型时清空并提示；
     * - Provider 节点切换 Provider 后，级联清理下游不兼容模型。
     */
    const handleNodeConfigChange = useCallback(
        (nodeId: string, config: unknown): void => {
            if (graph === null) {
                updateNodeConfig(nodeId, config);
                return;
            }

            const node = graph.nodes.find((candidate) => candidate.id === nodeId);
            if (node === undefined) {
                updateNodeConfig(nodeId, config);
                return;
            }

            let nextConfig = config;

            if (node.type === "core.model") {
                const binding = resolveModelProvider(graph, node);
                const configBefore = isRecord(node.config) ? node.config : {};
                if (binding.connected && binding.sourceIsProvider) {
                    nextConfig = lockModelProviderId(node.config, nextConfig);
                    const next = isRecord(nextConfig) ? nextConfig : {};
                    const modelId = readStringField(next, "modelId");
                    const resets = findIncompatibleModels(providerLibrary, [
                        {
                            nodeId,
                            providerId: binding.providerId,
                            modelId,
                        },
                    ]);
                    if (resets.length > 0) {
                        nextConfig = withoutModelId(next);
                        notifyModelResets(resets);
                    }
                } else {
                    // 未连接时切换 config.providerId 也要按新目录校验旧模型。
                    const previousProviderId = readStringField(
                        configBefore,
                        "providerId",
                    );
                    const next = isRecord(nextConfig) ? nextConfig : {};
                    const nextProviderId = readStringField(next, "providerId");
                    if (nextProviderId !== previousProviderId) {
                        const modelId = readStringField(next, "modelId");
                        const resets = findIncompatibleModels(providerLibrary, [
                            {
                                nodeId,
                                providerId: nextProviderId,
                                modelId,
                            },
                        ]);
                        if (resets.length > 0) {
                            nextConfig = withoutModelId(next);
                            notifyModelResets(resets);
                        }
                    }
                }
            }

            if (node.type === "core.model.call" || node.type === "core.agent.run") {
                const binding = resolveNodeModelBinding(graph, node);
                const configBefore = isRecord(node.config) ? node.config : {};
                if (binding.connected) {
                    // 模型由上游 Model 节点决定：保留本地回退值，不让表单改写。
                    nextConfig = lockModelBindingIds(node.config, nextConfig);
                } else {
                    const previousProviderId = readStringField(
                        configBefore,
                        "providerId",
                    );
                    const next = isRecord(nextConfig) ? nextConfig : {};
                    const nextProviderId = readStringField(next, "providerId");
                    if (nextProviderId !== previousProviderId) {
                        const modelId = readStringField(next, "modelId");
                        const resets = findIncompatibleModels(providerLibrary, [
                            {
                                nodeId,
                                providerId: nextProviderId,
                                modelId,
                            },
                        ]);
                        if (resets.length > 0) {
                            nextConfig = withoutModelId(next);
                            notifyModelResets(resets);
                        }
                    }
                }
            }

            updateNodeConfig(nodeId, nextConfig);

            if (node.type !== "core.provider") return;

            const providerConfig = isRecord(nextConfig) ? nextConfig : {};
            const providerId = readStringField(providerConfig, "providerId");
            if (providerId === undefined) return;

            const targets = new Map<string, Record<string, unknown>>();
            const candidates: {
                nodeId: string;
                providerId: string;
                modelId?: string;
            }[] = [];

            for (const edge of graph.edges) {
                if (edge.from.nodeId !== nodeId || edge.from.port !== "provider") {
                    continue;
                }
                const target = graph.nodes.find(
                    (candidate) => candidate.id === edge.to.nodeId,
                );
                if (target?.type !== "core.model") continue;

                const targetConfig = isRecord(target.config)
                    ? target.config
                    : {};
                targets.set(target.id, targetConfig);
                candidates.push({
                    nodeId: target.id,
                    providerId,
                    modelId: readStringField(targetConfig, "modelId"),
                });
            }

            const resets = findIncompatibleModels(providerLibrary, candidates);
            const resetIds = new Set(resets.map((reset) => reset.nodeId));

            // 连接来源是权威值：同步 config.providerId，作为断开连接后的回退。
            for (const [targetId, targetConfig] of targets) {
                const changedProvider = targetConfig.providerId !== providerId;
                const resetModel = resetIds.has(targetId);
                if (!changedProvider && !resetModel) continue;

                const nextConfig: Record<string, unknown> = {
                    ...targetConfig,
                    providerId,
                };
                if (resetModel) delete nextConfig.modelId;
                updateNodeConfig(targetId, nextConfig);
            }

            notifyModelResets(resets);
        },
        [
            graph,
            notifyModelResets,
            providerLibrary,
            updateNodeConfig,
        ],
    );

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
        const configProviderId =
            typeof selectedConfig.providerId === "string"
                ? selectedConfig.providerId
                : undefined;
        const selectedModelId =
            typeof selectedConfig.modelId === "string"
                ? selectedConfig.modelId
                : undefined;
        const selectedType = selectedGraphNode?.type;
        const isModelNode = selectedType === "core.model";
        const isProviderNode = selectedType === "core.provider";
        const isBindingNode =
            isModelNode ||
            selectedType === "core.model.call" ||
            selectedType === "core.agent.run";
        const modelBinding =
            isModelNode && graph !== null && selectedGraphNode !== null
                ? resolveModelProvider(graph, selectedGraphNode)
                : undefined;
        const nodeBinding =
            isBindingNode && !isModelNode && graph !== null
                && selectedGraphNode !== null
                ? resolveNodeModelBinding(graph, selectedGraphNode)
                : undefined;
        const modelProviderLocked = isModelNode
            ? modelBinding?.connected === true && modelBinding.sourceIsProvider
            : nodeBinding?.connected === true;
        const selectedProviderId = modelProviderLocked
            ? isModelNode
                ? modelBinding?.providerId
                : nodeBinding?.providerId
            : configProviderId;
        const selectedBindingModelId = modelProviderLocked
            ? isModelNode
                ? selectedModelId
                : nodeBinding?.modelId
            : selectedModelId;
        const selectedProfile = providerLibrary.profiles.find(
            (status) => status.profile.id === selectedProviderId,
        );
        const modelOptionList: InspectorFieldOption[] =
            selectedProfile?.profile.models.map((model) => ({
                value: model.id,
                label: model.name || model.id,
            })) ?? [];
        const modelCatalogEmpty =
            selectedProfile !== undefined &&
            selectedProfile.profile.models.length === 0;
        const fieldOptions:
            | InspectorNodeModel["fieldOptions"]
            | undefined = isBindingNode
            ? {
                  providerId: withCurrentOption(
                      providerOptions,
                      selectedProviderId,
                      "缺失的 Provider",
                  ),
                  modelId: [
                      { value: "", label: "未选择模型" },
                      ...withCurrentOption(
                          modelOptionList,
                          selectedBindingModelId,
                          "不在目录中的模型",
                      ),
                  ],
              }
            : isProviderNode
              ? {
                    providerId: withCurrentOption(
                        providerOptions,
                        selectedProviderId,
                        "缺失的 Provider",
                    ),
                }
              : undefined;
        const fieldValues:
            | InspectorNodeModel["fieldValues"]
            | undefined = modelProviderLocked
            ? {
                  ...(selectedProviderId === undefined ||
                  selectedProviderId.length === 0
                      ? {}
                      : { providerId: selectedProviderId }),
                  ...(!isModelNode &&
                  selectedBindingModelId !== undefined &&
                  selectedBindingModelId.length > 0
                      ? { modelId: selectedBindingModelId }
                      : {}),
              }
            : undefined;
        const catalogRefresh = selectedProviderId
            ? catalogRefreshes[selectedProviderId]
            : undefined;
        const fieldHints =
            isBindingNode && modelCatalogEmpty
                ? {
                      modelId:
                          catalogRefresh?.status === "loading"
                              ? "正在刷新该 Provider 的模型目录…"
                              : catalogRefresh?.status === "error"
                                ? `模型目录刷新失败：${catalogRefresh.error ?? "未知错误"}。可在设置页手动刷新。`
                                : "该 Provider 的模型目录为空，请先在设置页刷新模型。",
                  }
                : undefined;
        const fieldLocks: InspectorNodeModel["fieldLocks"] | undefined =
            selectedGraphNode === null
                ? undefined
                : lockReasons(nodeFieldLocks[selectedGraphNode.id]);

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
                      config:
                          modelProviderLocked &&
                          selectedProviderId !== undefined
                              ? {
                                    ...selectedConfig,
                                    providerId: selectedProviderId,
                                }
                              : selectedGraphNode.config,
                      ...(selectedCanvasNode.data.error === undefined
                          ? {}
                          : { error: selectedCanvasNode.data.error }),
                      ...(fieldOptions === undefined ? {} : { fieldOptions }),
                      ...(fieldValues === undefined ? {} : { fieldValues }),
                      ...(fieldHints === undefined ? {} : { fieldHints }),
                      ...(fieldLocks === undefined ? {} : { fieldLocks }),
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
            onUpdateConfig: handleNodeConfigChange,
        };
    }, [
        canvas,
        catalogRefreshes,
        editingDisabled,
        graph,
        handleNodeConfigChange,
        nodeFieldLocks,
        nodeStatuses,
        providerOptions,
        providerLibrary,
        selectedCanvasNode,
        selectedGraphNode,
        status,
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
        modelResetNotice !== null ||
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
                onCommand={handleCanvasCommand}
                nodeStatuses={nodeStatuses}
                readOnly={editingDisabled}
                onAddNode={openNodeLibrary}
                onCreatePreset={handleCreatePreset}
                onDropNode={handleDropNode}
                dropMimeType={NODE_DRAG_MIME}
                focusNode={focusNode}
                onUpdateNodeConfig={handleNodeConfigChange}
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

                    {modelResetNotice !== null ? (
                        <Alert tone="warning" title="模型已清空">
                            <ul className={styles.issues}>
                                {modelResetNotice.map((message) => (
                                    <li key={message}>{message}</li>
                                ))}
                            </ul>
                            <div className={styles.actions}>
                                <Button
                                    size="sm"
                                    onClick={() => setModelResetNotice(null)}
                                >
                                    知道了
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

/** 输入端口连接后，需要锁定的 config 字段。 */
function lockedFieldNames(nodeType: string, port: string): readonly string[] {
    if (nodeType === "core.model") {
        return port === "provider" ? ["providerId"] : [];
    }
    if (nodeType === "core.replace") {
        return port === "raw_text" ? ["rawText"] : [port];
    }
    if (nodeType !== "core.model.call" && nodeType !== "core.agent.run") {
        return [];
    }
    if (port === "model") return ["providerId", "modelId"];
    return [port];
}

/** 锁定行按字段展示更精确的值：providerId 显示 Profile，modelId 显示模型 id。 */
function describeLockedFieldValue(
    graph: GraphDocument,
    source: GraphDocument["nodes"][number],
    field: string,
    providerLibrary: ProviderLibraryView,
): string {
    if (source.type === "core.model" && (field === "providerId" || field === "modelId")) {
        const config = isRecord(source.config) ? source.config : {};
        if (field === "modelId") {
            return typeof config.modelId === "string" && config.modelId.length > 0
                ? config.modelId
                : "Model";
        }
        const providerId = resolveModelProvider(graph, source).providerId;
        return (
            providerLibrary.profiles.find(
                (item) => item.profile.id === providerId,
            )?.profile.label ??
            providerId ??
            "Provider"
        );
    }

    return describeUpstreamValue(source, providerLibrary);
}

/** 上游节点在锁定行里展示的可读值。 */
function describeUpstreamValue(
    source: GraphDocument["nodes"][number],
    providerLibrary: ProviderLibraryView,
): string {
    const config = isRecord(source.config) ? source.config : {};

    if (source.type === "core.provider") {
        const providerId =
            typeof config.providerId === "string" ? config.providerId : undefined;
        return (
            providerLibrary.profiles.find(
                (item) => item.profile.id === providerId,
            )?.profile.label ??
            providerId ??
            "Provider"
        );
    }

    if (source.type === "core.model") {
        const providerId =
            typeof config.providerId === "string" ? config.providerId : undefined;
        const modelId =
            typeof config.modelId === "string" ? config.modelId : undefined;
        const model = modelId ?? "Model";
        return providerId === undefined ? model : `${providerId} · ${model}`;
    }

    if (source.type === "core.constant") {
        const value = isRecord(config.value) ? config.value : {};
        if (value.type === "json") {
            return truncateLabel(JSON.stringify(value.value ?? null));
        }
        if (typeof value.text === "string") return truncateLabel(value.text);
        return "Constant";
    }

    if (source.type === "core.value") {
        const name = typeof config.name === "string" ? config.name : "value";
        return `参数 ${name}`;
    }

    // Merge / Branch / Loop 等没有可直接展示的本地值：显示节点标题而不是
    // 原始 type id（core.merge），真实值由运行期决定。
    const title = findNodeCatalogEntry(source.type)?.title ?? source.type;
    return `${title} 输出`;
}

function truncateLabel(text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    if (compact.length === 0) return "（空）";
    return compact.length > 40 ? `${compact.slice(0, 40)}…` : compact;
}

/** 画布锁字段 → 检查器需要的「字段 → 原因」映射。 */
function lockReasons(
    locks: Readonly<Record<string, CanvasLockedField>> | undefined,
): Record<string, string> | undefined {
    if (locks === undefined) return undefined;
    const entries = Object.entries(locks);
    if (entries.length === 0) return undefined;
    return Object.fromEntries(
        entries.map(([field, lock]) => [field, lock.reason]),
    );
}

/** 连接固定时保留原 providerId，阻止表单 / JSON 改写连接来源。 */
function lockModelProviderId(
    currentConfig: unknown,
    nextConfig: unknown,
): Record<string, unknown> {
    const current = isRecord(currentConfig) ? currentConfig : {};
    const next = isRecord(nextConfig) ? { ...nextConfig } : {};

    if (current.providerId === undefined) {
        delete next.providerId;
    } else {
        next.providerId = current.providerId;
    }

    return next;
}

/** 连接固定时保留原 providerId / modelId（Model Call / Agent 的本地回退值）。 */
function lockModelBindingIds(
    currentConfig: unknown,
    nextConfig: unknown,
): Record<string, unknown> {
    const current = isRecord(currentConfig) ? currentConfig : {};
    const next = isRecord(nextConfig) ? { ...nextConfig } : {};

    for (const key of ["providerId", "modelId"] as const) {
        if (current[key] === undefined) delete next[key];
        else next[key] = current[key];
    }

    return next;
}

/** 只移除 modelId，保留 config 的其余字段。 */
function withoutModelId(config: unknown): Record<string, unknown> {
    const next = isRecord(config) ? { ...config } : {};
    delete next.modelId;
    return next;
}

function readStringField(
    value: Record<string, unknown>,
    key: string,
): string | undefined {
    const candidate = value[key];
    return typeof candidate === "string" && candidate.length > 0
        ? candidate
        : undefined;
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
