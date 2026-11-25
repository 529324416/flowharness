import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
} from "react";
// Wireclaw 以普通包依赖的方式引入；这里用于启动自检。
import { Graph, type GraphDocument } from "wireclaw";
import type {
    AppConfig,
    ApprovalRequestPayload,
    HarnessDocumentSummary,
    RunEventBatch,
    RunEventDto,
    RunSnapshot,
    UserInputAnswerDto,
    UserInputRequestPayload,
    WorkbenchInstanceDocument,
    WorkbenchSummary,
    WorkspaceSummary,
} from "@flowharness/contracts";
import {
    Button,
    EmptyState,
    TooltipProvider,
} from "./ui";
import { AppShell } from "./shell/AppShell";
import { WorkbenchMenu } from "./shell/WorkbenchMenu";
import { TitleBar } from "./shell/TitleBar";
import { ProviderSettingsDialog } from "./shell/ProviderSettingsDialog";
import { RibbonBar } from "./shell/RibbonBar";
import {
    ApprovalDialog,
    UserInputDialog,
} from "./shell/InteractionDialogs";
import {
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_MIN_WIDTH,
} from "./layout-metrics";
import { StatusBar } from "./shell/StatusBar";
import { PanelLayer } from "./shell/panels/PanelLayer";
import { useFloatingPanels } from "./shell/panels/useFloatingPanels";
import { VIEW_LABEL, type ViewId } from "./shell/views";
import type { DesignerSaveStatus } from "./views/DesignerView";
import { DiagnosticsView } from "./views/DiagnosticsView";
import { StyleguideView } from "./views/StyleguideView";
import { useTheme } from "./theme/ThemeProvider";
import type { RunControls } from "./run/run-controls";
import type { InspectorModel } from "./inspector/model";
import type { DesignerProblemsModel } from "./designer/core/problems";
import {
    createDocumentId,
    createGraphTemplate,
    isGraphDocument,
} from "./designer/core/document";
import {
    importDocumentTitle,
    parseHarnessJson,
    serializeHarnessJson,
    withDocumentTitle,
} from "./designer/core/harness-json";
import type { DesignerDocumentActions } from "./designer/state/useDesignerDocument";
import {
    pushRecentDocument,
    readRecentDocuments,
    writeRecentDocuments,
} from "./designer/state/recent-documents";
import { WorkbenchHost } from "./workbench/WorkbenchHost";
import { getWorkbench } from "./workbench/registry";
import {
    createWorkbenchId,
    createWorkbenchInstance,
    defaultWorkbenchTitle,
    isWorkbenchInstanceDocument,
    primaryGraphId,
    withPrimaryGraph,
} from "./workbench/instance";
import type {
    WorkbenchController,
    WorkbenchMode,
    WorkbenchNavigationProps,
    WorkbenchShell,
} from "./workbench/types";
import "./workbenches";
import styles from "./App.module.css";

const bootGraph = new Graph([], [], {
    id: "flowharness-renderer-boot",
    title: "FlowHarness renderer boot",
});

const SIDEBAR_OPEN_KEY = "fh.sidebar.open";
const SIDEBAR_WIDTH_KEY = "fh.sidebar.width";

type DataSnapshot = {
    configOk: boolean;
    config: AppConfig | null;
    workspaceCount: number;
    error: string | null;
};

function readSidebarOpen(): boolean {
    try {
        return localStorage.getItem(SIDEBAR_OPEN_KEY) !== "0";
    } catch {
        return true;
    }
}

function readSidebarWidth(): number {
    try {
        const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
        if (raw === null) return SIDEBAR_DEFAULT_WIDTH;
        const value = Number(raw);
        if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH;
        return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
    } catch {
        return SIDEBAR_DEFAULT_WIDTH;
    }
}

export function App(): ReactElement {
    const { theme, toggleTheme } = useTheme();
    const bridge = window.flowharness;

    const bootReported = useRef(false);
    const dataReported = useRef(false);
    const runReported = useRef(false);
    const autoOpenedWorkspace = useRef(false);

    const [view, setView] = useState<ViewId>(
        bridge.smokeMode ? "diagnostics" : "designer",
    );
    const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
    const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
    /** M7.5 会在这里切到 run；M7.1 只有 design 导航。 */
    const workbenchMode: WorkbenchMode = "design";

    const [config, setConfig] = useState<AppConfig | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSummary | null>(
        null,
    );
    const [dataError, setDataError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [runSnapshot, setRunSnapshot] = useState<RunSnapshot | null>(null);
    const [runEvents, setRunEvents] = useState<RunEventDto[]>([]);
    const [approvalRequests, setApprovalRequests] = useState<
        ApprovalRequestPayload[]
    >([]);
    const [inputRequests, setInputRequests] = useState<
        UserInputRequestPayload[]
    >([]);
    const [designerRunControls, setDesignerRunControls] =
        useState<RunControls | null>(null);
    const [designerSaveStatus, setDesignerSaveStatus] =
        useState<DesignerSaveStatus | null>(null);
    const [designerInspector, setDesignerInspector] =
        useState<InspectorModel | null>(null);
    const [designerProblems, setDesignerProblems] =
        useState<DesignerProblemsModel | null>(null);
    const [documents, setDocuments] = useState<HarnessDocumentSummary[]>([]);
    const [recentDocumentIds, setRecentDocumentIds] = useState<string[]>([]);
    const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
    const [documentBusy, setDocumentBusy] = useState(false);
    const [documentError, setDocumentError] = useState<string | null>(null);
    const documentActionsRef = useRef<DesignerDocumentActions | null>(null);
    const [workbenches, setWorkbenches] = useState<WorkbenchSummary[]>([]);
    const [activeWorkbenchId, setActiveWorkbenchId] = useState<string | null>(
        null,
    );
    const [activeWorkbench, setActiveWorkbench] =
        useState<WorkbenchInstanceDocument | null>(null);
    const [workbenchBusy, setWorkbenchBusy] = useState(false);
    const activeWorkbenchRef = useRef<WorkbenchInstanceDocument | null>(null);
    const workbenchRevisionRef = useRef<string | null>(null);
    const workbenchControllerRef = useRef<WorkbenchController | null>(null);
    const workbenchSaveChain = useRef(Promise.resolve());

    const {
        panels,
        isOpen: isPanelOpen,
        toggle: togglePanel,
        close: closePanel,
        focus: focusPanel,
        update: updatePanel,
    } = useFloatingPanels();

    const panelsEnabled = view === "designer" && activeWorkspace !== null;

    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_OPEN_KEY, sidebarOpen ? "1" : "0");
            localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
        } catch {
            // 存储不可用时保持内存状态。
        }
    }, [sidebarOpen, sidebarWidth]);

    useEffect(() => {
        if (bootReported.current) return;
        bootReported.current = true;
        bridge.reportReady({
            renderer: {
                framework: "react",
                wireclawGraphLoaded: typeof Graph === "function",
                wireclawGraphId: bootGraph.id,
            },
            versions: bridge.versions,
        });
    }, [bridge]);

    useEffect(
        () =>
            bridge.onEvent((envelope) => {
                if (envelope.topic === "run") {
                    const batch = envelope.payload as RunEventBatch;
                    setRunSnapshot(batch.snapshot);
                    setRunEvents((current) =>
                        [...current, ...batch.events].slice(-300),
                    );
                    return;
                }

                if (envelope.topic === "approval") {
                    const request = envelope.payload as ApprovalRequestPayload;
                    setApprovalRequests((current) =>
                        current.some(
                            (item) => item.requestId === request.requestId,
                        )
                            ? current
                            : [...current, request],
                    );
                    return;
                }

                if (envelope.topic === "input") {
                    const request = envelope.payload as UserInputRequestPayload;
                    setInputRequests((current) =>
                        current.some(
                            (item) => item.requestId === request.requestId,
                        )
                            ? current
                            : [...current, request],
                    );
                }
            }),
        [bridge],
    );

    const loadData = useCallback(async (): Promise<DataSnapshot> => {
        const [configResult, workspacesResult] = await Promise.all([
            bridge.getConfig(),
            bridge.listWorkspaces(),
        ]);

        let error: string | null = null;

        if (configResult.ok) {
            setConfig(configResult.data);
        } else {
            error = configResult.error.message;
        }

        if (workspacesResult.ok) {
            setWorkspaces(workspacesResult.data);
        } else {
            error = error ?? workspacesResult.error.message;
        }

        setDataError(error);

        return {
            configOk: configResult.ok,
            config: configResult.ok ? configResult.data : null,
            workspaceCount: workspacesResult.ok ? workspacesResult.data.length : -1,
            error,
        };
    }, [bridge]);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const snapshot = await loadData();
            if (cancelled || dataReported.current) return;
            dataReported.current = true;
            bridge.reportReady({
                phase: "data",
                data: {
                    configLoaded: snapshot.configOk,
                    workspaceCount: snapshot.workspaceCount,
                    workspaceRoot: snapshot.config?.workspaceRoot ?? null,
                    error: snapshot.error,
                },
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [bridge, loadData]);

    const handleRunFinished = useCallback(
        (snapshot: RunSnapshot) => {
            if (runReported.current) return;
            runReported.current = true;
            bridge.reportReady({
                phase: "run",
                data: {
                    runId: snapshot.runId,
                    status: snapshot.status,
                    error: snapshot.error ?? null,
                },
            });
        },
        [bridge],
    );

    const rememberDocument = useCallback(
        (workspaceId: string, documentId: string): void => {
            const storage = localStore();
            const next = pushRecentDocument(
                readRecentDocuments(storage, workspaceId),
                documentId,
            );
            writeRecentDocuments(storage, workspaceId, next);
            setRecentDocumentIds([...next]);
        },
        [],
    );

    const refreshDocuments = useCallback(
        async (workspaceId: string): Promise<HarnessDocumentSummary[]> => {
            const result = await bridge.listDocuments(workspaceId);
            if (!result.ok) {
                setDocumentError(result.error.message);
                return [];
            }
            setDocuments(result.data);
            return result.data;
        },
        [bridge],
    );

    const flushCurrentDocument = useCallback(async (): Promise<boolean> => {
        const actions = documentActionsRef.current;
        if (actions === null) return true;

        const state = await actions.flush();
        if (state.status === "conflict" || state.status === "error") {
            setDocumentError(state.error);
            return false;
        }
        return true;
    }, []);

    const openDocumentsForWorkspace = useCallback(
        async (workspaceId: string): Promise<string | null> => {
            setDocumentBusy(true);
            setDocumentError(null);

            try {
                let list = await refreshDocuments(workspaceId);
                if (list.length === 0) {
                    const saved = await bridge.saveDocument({
                        workspaceId,
                        ref: { kind: "harness", id: "main" },
                        baseRevision: null,
                        document: createGraphTemplate("main"),
                    });
                    if (!saved.ok && saved.error.code !== "E_CONFLICT") {
                        setDocumentError(saved.error.message);
                        return null;
                    }
                    list = await refreshDocuments(workspaceId);
                }

                const recent = readRecentDocuments(localStore(), workspaceId);
                setRecentDocumentIds([...recent]);
                const preferred =
                    recent.find((id) => list.some((document) => document.id === id)) ??
                    list[0]?.id ??
                    null;

                setActiveDocumentId(preferred);
                if (preferred !== null) rememberDocument(workspaceId, preferred);
                return preferred;
            } finally {
                setDocumentBusy(false);
            }
        },
        [bridge, refreshDocuments, rememberDocument],
    );

    const refreshWorkbenches = useCallback(
        async (workspaceId: string): Promise<WorkbenchSummary[]> => {
            const result = await bridge.listWorkbenches(workspaceId);
            if (!result.ok) {
                setDocumentError(result.error.message);
                return [];
            }
            setWorkbenches(result.data);
            return result.data;
        },
        [bridge],
    );

    const loadWorkbench = useCallback(
        async (
            workspaceId: string,
            workbenchId: string,
        ): Promise<WorkbenchInstanceDocument | null> => {
            const snapshot = await bridge.readDocument(workspaceId, {
                kind: "workbench",
                id: workbenchId,
            });
            if (!snapshot.ok || snapshot.data === null) {
                setDocumentError(
                    snapshot.ok ? "工作台实例不存在" : snapshot.error.message,
                );
                return null;
            }
            if (!isWorkbenchInstanceDocument(snapshot.data.document)) {
                setDocumentError("工作台实例格式无效");
                return null;
            }

            activeWorkbenchRef.current = snapshot.data.document;
            workbenchRevisionRef.current = snapshot.data.revision;
            setActiveWorkbench(snapshot.data.document);
            setActiveWorkbenchId(workbenchId);
            return snapshot.data.document;
        },
        [bridge],
    );

    const openWorkbenchesForWorkspace = useCallback(
        async (
            workspaceId: string,
            preferredGraphId: string | null,
        ): Promise<void> => {
            setWorkbenchBusy(true);
            setDocumentError(null);

            try {
                let list = await refreshWorkbenches(workspaceId);
                if (list.length === 0) {
                    const id = createWorkbenchId();
                    const instance = createWorkbenchInstance({
                        id,
                        type: "harness-designer",
                        title: defaultWorkbenchTitle("harness-designer"),
                        graphId: preferredGraphId ?? "main",
                    });
                    const saved = await bridge.saveDocument({
                        workspaceId,
                        ref: { kind: "workbench", id },
                        baseRevision: null,
                        document: instance,
                    });
                    if (!saved.ok) {
                        setDocumentError(saved.error.message);
                        return;
                    }
                    list = await refreshWorkbenches(workspaceId);
                }

                const first = list[0];
                if (first === undefined) return;

                const loaded = await loadWorkbench(workspaceId, first.id);
                const documents = await refreshDocuments(workspaceId);
                const primary =
                    loaded === null ? null : primaryGraphId(loaded);
                const validGraph =
                    primary !== null &&
                    documents.some((document) => document.id === primary)
                        ? primary
                        : preferredGraphId ?? documents[0]?.id ?? null;

                if (
                    loaded !== null &&
                    validGraph !== null &&
                    primary !== validGraph
                ) {
                    const next = withPrimaryGraph(loaded, validGraph);
                    activeWorkbenchRef.current = next;
                    setActiveWorkbench(next);
                    const saved = await bridge.saveDocument({
                        workspaceId,
                        ref: { kind: "workbench", id: next.id },
                        baseRevision: workbenchRevisionRef.current,
                        document: next,
                    });
                    if (saved.ok) {
                        workbenchRevisionRef.current = saved.data.revision;
                    }
                }

                if (validGraph !== null) {
                    setActiveDocumentId(validGraph);
                    rememberDocument(workspaceId, validGraph);
                }
            } finally {
                setWorkbenchBusy(false);
            }
        },
        [
            bridge,
            loadWorkbench,
            refreshDocuments,
            refreshWorkbenches,
            rememberDocument,
        ],
    );

    const updateActiveWorkbench = useCallback(
        (mutate: (current: WorkbenchInstanceDocument) => WorkbenchInstanceDocument) => {
            const current = activeWorkbenchRef.current;
            const workspace = activeWorkspace;
            if (current === null || workspace === null) return;

            const next = mutate(current);
            if (next === current) return;

            activeWorkbenchRef.current = next;
            setActiveWorkbench(next);

            workbenchSaveChain.current = workbenchSaveChain.current.then(
                async () => {
                    const saved = await bridge.saveDocument({
                        workspaceId: workspace.id,
                        ref: { kind: "workbench", id: next.id },
                        baseRevision: workbenchRevisionRef.current,
                        document: next,
                    });
                    if (saved.ok) {
                        workbenchRevisionRef.current = saved.data.revision;
                    } else {
                        setDocumentError(saved.error.message);
                    }
                },
            );
        },
        [activeWorkspace, bridge],
    );

    // 工作台导航选中文档后，统一在工作台壳层维护 primaryGraph 绑定。
    useEffect(() => {
        if (activeWorkbench?.type !== "harness-designer") return;
        if (activeDocumentId === null) return;
        if (primaryGraphId(activeWorkbench) === activeDocumentId) return;
        updateActiveWorkbench((current) =>
            withPrimaryGraph(current, activeDocumentId),
        );
    }, [activeDocumentId, activeWorkbench, updateActiveWorkbench]);

    const handleSelectWorkbench = useCallback(
        async (workbenchId: string): Promise<void> => {
            const workspace = activeWorkspace;
            if (
                workspace === null ||
                workbenchId === activeWorkbenchId
            ) {
                return;
            }
            if (!(await flushCurrentDocument())) return;

            const loaded = await loadWorkbench(workspace.id, workbenchId);
            if (loaded === null) return;

            const graphId = primaryGraphId(loaded);
            if (graphId !== null) {
                setActiveDocumentId(graphId);
                rememberDocument(workspace.id, graphId);
            }
        },
        [
            activeWorkbenchId,
            activeWorkspace,
            flushCurrentDocument,
            loadWorkbench,
            rememberDocument,
        ],
    );

    const handleCreateWorkbench = useCallback(
        async (type: string): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null) return;

            setWorkbenchBusy(true);
            setDocumentError(null);
            try {
                if (!(await flushCurrentDocument())) return;

                const id = createWorkbenchId();
                const instance = createWorkbenchInstance({
                    id,
                    type,
                    title: defaultWorkbenchTitle(type),
                    graphId: activeDocumentId ?? documents[0]?.id ?? "main",
                });
                const saved = await bridge.saveDocument({
                    workspaceId: workspace.id,
                    ref: { kind: "workbench", id },
                    baseRevision: null,
                    document: instance,
                });
                if (!saved.ok) {
                    setDocumentError(saved.error.message);
                    return;
                }

                await refreshWorkbenches(workspace.id);
                await loadWorkbench(workspace.id, id);
                const graphId = primaryGraphId(instance);
                if (graphId !== null) {
                    setActiveDocumentId(graphId);
                    rememberDocument(workspace.id, graphId);
                }
            } finally {
                setWorkbenchBusy(false);
            }
        },
        [
            activeDocumentId,
            activeWorkspace,
            bridge,
            documents,
            flushCurrentDocument,
            loadWorkbench,
            refreshWorkbenches,
            rememberDocument,
        ],
    );

    useEffect(() => {
        activeWorkbenchRef.current = activeWorkbench;
    }, [activeWorkbench]);

    const openWorkspaceById = useCallback(
        async (id: string): Promise<void> => {
            setBusy(true);
            setDataError(null);

            try {
                if (activeWorkspace && activeWorkspace.id !== id) {
                    if (!(await flushCurrentDocument())) return;
                    await bridge.closeWorkspace(activeWorkspace.id);
                    setActiveWorkspace(null);
                    setDocuments([]);
                    setActiveDocumentId(null);
                    setWorkbenches([]);
                    setActiveWorkbenchId(null);
                    setActiveWorkbench(null);
                    activeWorkbenchRef.current = null;
                    workbenchRevisionRef.current = null;
                }

                const opened = await bridge.openWorkspace(id);
                if (!opened.ok) {
                    setDataError(opened.error.message);
                    return;
                }

                setActiveWorkspace(opened.data);
                setView("designer");
                const preferredGraph = await openDocumentsForWorkspace(opened.data.id);
                await openWorkbenchesForWorkspace(opened.data.id, preferredGraph);
            } finally {
                setBusy(false);
            }
        },
        [
            activeWorkspace,
            bridge,
            flushCurrentDocument,
            openDocumentsForWorkspace,
            openWorkbenchesForWorkspace,
        ],
    );

    const handleSelectDocument = useCallback(
        async (id: string): Promise<void> => {
            if (activeWorkspace === null || id === activeDocumentId) return;
            if (!(await flushCurrentDocument())) return;

            setActiveDocumentId(id);
            rememberDocument(activeWorkspace.id, id);
            setDocumentError(null);
        },
        [activeDocumentId, activeWorkspace, flushCurrentDocument, rememberDocument],
    );

    const handleCreateDocument = useCallback(async (): Promise<void> => {
        const workspace = activeWorkspace;
        if (workspace === null) return;

        setDocumentBusy(true);
        setDocumentError(null);
        try {
            if (!(await flushCurrentDocument())) return;

            const id = createDocumentId();
            const saved = await bridge.saveDocument({
                workspaceId: workspace.id,
                ref: { kind: "harness", id },
                baseRevision: null,
                document: createGraphTemplate(id),
            });
            if (!saved.ok) {
                setDocumentError(saved.error.message);
                return;
            }

            await refreshDocuments(workspace.id);
            setActiveDocumentId(id);
            rememberDocument(workspace.id, id);
        } finally {
            setDocumentBusy(false);
        }
    }, [
        activeWorkspace,
        bridge,
        flushCurrentDocument,
        refreshDocuments,
        rememberDocument,
    ]);

    const handleRenameDocument = useCallback(
        async (id: string, title: string): Promise<void> => {
            const workspace = activeWorkspace;
            const trimmed = title.trim();
            if (workspace === null || trimmed.length === 0) return;

            setDocumentBusy(true);
            setDocumentError(null);
            try {
                if (id === activeDocumentId && !(await flushCurrentDocument())) {
                    return;
                }

                const snapshot = await bridge.readDocument(workspace.id, {
                    kind: "harness",
                    id,
                });
                if (!snapshot.ok || snapshot.data === null) {
                    setDocumentError(
                        snapshot.ok ? "文档不存在" : snapshot.error.message,
                    );
                    return;
                }

                const document = withDocumentTitle(snapshot.data.document, trimmed);
                if (document === null) {
                    setDocumentError("文档格式不支持重命名");
                    return;
                }

                const saved = await bridge.saveDocument({
                    workspaceId: workspace.id,
                    ref: { kind: "harness", id },
                    baseRevision: snapshot.data.revision,
                    document,
                });
                if (!saved.ok) {
                    setDocumentError(saved.error.message);
                    return;
                }

                await refreshDocuments(workspace.id);
                if (id === activeDocumentId) {
                    documentActionsRef.current?.reload();
                }
            } finally {
                setDocumentBusy(false);
            }
        },
        [
            activeDocumentId,
            activeWorkspace,
            bridge,
            flushCurrentDocument,
            refreshDocuments,
        ],
    );

    const handleDuplicateDocument = useCallback(
        async (id: string): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null) return;

            setDocumentBusy(true);
            setDocumentError(null);
            try {
                if (id === activeDocumentId && !(await flushCurrentDocument())) {
                    return;
                }

                const snapshot = await bridge.readDocument(workspace.id, {
                    kind: "harness",
                    id,
                });
                if (!snapshot.ok || snapshot.data === null) {
                    setDocumentError(
                        snapshot.ok ? "文档不存在" : snapshot.error.message,
                    );
                    return;
                }
                if (!isGraphDocument(snapshot.data.document)) {
                    setDocumentError("文档不是有效的 GraphDocument");
                    return;
                }

                const source = snapshot.data.document;
                const nextId = createDocumentId();
                const copy = structuredClone(source);
                copy.id = nextId;
                copy.title = `${source.title ?? id} 副本`;

                const saved = await bridge.saveDocument({
                    workspaceId: workspace.id,
                    ref: { kind: "harness", id: nextId },
                    baseRevision: null,
                    document: copy,
                });
                if (!saved.ok) {
                    setDocumentError(saved.error.message);
                    return;
                }

                await refreshDocuments(workspace.id);
                setActiveDocumentId(nextId);
                rememberDocument(workspace.id, nextId);
            } finally {
                setDocumentBusy(false);
            }
        },
        [
            activeDocumentId,
            activeWorkspace,
            bridge,
            flushCurrentDocument,
            refreshDocuments,
            rememberDocument,
        ],
    );

    const handleSaveConflictCopy = useCallback(
        async (graph: GraphDocument): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null) return;

            setDocumentBusy(true);
            setDocumentError(null);
            try {
                const id = createDocumentId();
                const copy = structuredClone(graph);
                copy.id = id;
                copy.title = `${graph.title ?? id}（冲突副本）`;

                const saved = await bridge.saveDocument({
                    workspaceId: workspace.id,
                    ref: { kind: "harness", id },
                    baseRevision: null,
                    document: copy,
                });
                if (!saved.ok) {
                    setDocumentError(saved.error.message);
                    return;
                }

                await refreshDocuments(workspace.id);
                setActiveDocumentId(id);
                rememberDocument(workspace.id, id);
            } finally {
                setDocumentBusy(false);
            }
        },
        [activeWorkspace, bridge, refreshDocuments, rememberDocument],
    );

    const handleDeleteDocument = useCallback(
        async (id: string): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null) return;

            setDocumentBusy(true);
            setDocumentError(null);
            try {
                if (id === activeDocumentId && !(await flushCurrentDocument())) {
                    return;
                }

                const result = await bridge.deleteDocument(workspace.id, {
                    kind: "harness",
                    id,
                });
                if (!result.ok) {
                    setDocumentError(result.error.message);
                    return;
                }

                const list = await refreshDocuments(workspace.id);
                if (list.length === 0) {
                    await openDocumentsForWorkspace(workspace.id);
                    return;
                }

                if (id === activeDocumentId) {
                    const recent = readRecentDocuments(localStore(), workspace.id);
                    const next =
                        list.find((document) => recent.includes(document.id))?.id ??
                        list[0]?.id ??
                        null;
                    setActiveDocumentId(next);
                    if (next !== null) rememberDocument(workspace.id, next);
                }
            } finally {
                setDocumentBusy(false);
            }
        },
        [
            activeDocumentId,
            activeWorkspace,
            bridge,
            flushCurrentDocument,
            openDocumentsForWorkspace,
            refreshDocuments,
            rememberDocument,
        ],
    );

    const handleImportDocument = useCallback(
        async (text: string, fileName: string): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null) return;

            setDocumentBusy(true);
            setDocumentError(null);
            try {
                if (!(await flushCurrentDocument())) return;

                const parsed = parseHarnessJson(text);
                if (parsed === null) {
                    setDocumentError("JSON 不是有效的 GraphDocument");
                    return;
                }

                const id = createDocumentId();
                const document = structuredClone(parsed);
                document.id = id;
                document.title = importDocumentTitle(
                    fileName,
                    typeof parsed.title === "string" ? parsed.title : undefined,
                );

                const saved = await bridge.saveDocument({
                    workspaceId: workspace.id,
                    ref: { kind: "harness", id },
                    baseRevision: null,
                    document,
                });
                if (!saved.ok) {
                    setDocumentError(saved.error.message);
                    return;
                }

                await refreshDocuments(workspace.id);
                setActiveDocumentId(id);
                rememberDocument(workspace.id, id);
            } finally {
                setDocumentBusy(false);
            }
        },
        [
            activeWorkspace,
            bridge,
            flushCurrentDocument,
            refreshDocuments,
            rememberDocument,
        ],
    );

    const handleExportDocument = useCallback(
        async ({ stripUi }: { stripUi: boolean }): Promise<void> => {
            const workspace = activeWorkspace;
            const id = activeDocumentId;
            if (workspace === null || id === null) return;

            setDocumentError(null);
            try {
                if (!(await flushCurrentDocument())) return;

                const snapshot = await bridge.readDocument(workspace.id, {
                    kind: "harness",
                    id,
                });
                if (!snapshot.ok || snapshot.data === null) {
                    setDocumentError(
                        snapshot.ok ? "文档不存在" : snapshot.error.message,
                    );
                    return;
                }

                const text = serializeHarnessJson(snapshot.data.document, {
                    stripUi,
                });
                if (text === null) {
                    setDocumentError("文档不是有效的 GraphDocument");
                    return;
                }

                const title =
                    isRecord(snapshot.data.document) &&
                    typeof snapshot.data.document.title === "string"
                        ? snapshot.data.document.title
                        : id;
                const result = await bridge.exportHarness({
                    text,
                    defaultFileName: `${safeFileName(title)}.json`,
                });
                if (!result.ok) {
                    setDocumentError(result.error.message);
                }
            } catch (error) {
                setDocumentError(
                    error instanceof Error ? error.message : String(error),
                );
            }
        },
        [activeDocumentId, activeWorkspace, bridge, flushCurrentDocument],
    );

    const handleDocumentActionsChange = useCallback(
        (actions: DesignerDocumentActions | null): void => {
            documentActionsRef.current = actions;
        },
        [],
    );

    const flushAndClose = useCallback(async (): Promise<void> => {
        if (!(await flushCurrentDocument())) return;
        await bridge.windowClose();
    }, [bridge, flushCurrentDocument]);

    const createDemoWorkspace = useCallback(async () => {
        setBusy(true);
        setDataError(null);

        const created = await bridge.createWorkspace({ name: "示例工作区" });
        if (!created.ok) {
            setDataError(created.error.message);
            setBusy(false);
            return;
        }

        autoOpenedWorkspace.current = true;
        await openWorkspaceById(created.data.id);
        await loadData();
        setBusy(false);
    }, [bridge, loadData, openWorkspaceById]);

    const handleDesignerRunWillStart = useCallback(() => {
        setRunEvents([]);
        setRunSnapshot(null);
    }, []);

    const handleDesignerRunStarted = useCallback((snapshot: RunSnapshot) => {
        setRunSnapshot((current) => {
            // 事件可能先于 start 响应到达；已有同 run 的终态时不要回退成 running。
            if (
                current !== null &&
                current.runId === snapshot.runId &&
                current.status !== "running"
            ) {
                return current;
            }
            return snapshot;
        });
    }, []);

    const handleRenameWorkbench = useCallback(
        async (workbenchId: string, title: string): Promise<void> => {
            const workspace = activeWorkspace;
            const trimmed = title.trim();
            if (workspace === null || trimmed.length === 0) return;

            setWorkbenchBusy(true);
            setDocumentError(null);
            try {
                let current = activeWorkbenchRef.current;
                let revision = workbenchRevisionRef.current;

                if (current === null || current.id !== workbenchId) {
                    const snapshot = await bridge.readDocument(workspace.id, {
                        kind: "workbench",
                        id: workbenchId,
                    });
                    if (!snapshot.ok || snapshot.data === null) {
                        setDocumentError(
                            snapshot.ok
                                ? "工作台不存在"
                                : snapshot.error.message,
                        );
                        return;
                    }
                    if (!isWorkbenchInstanceDocument(snapshot.data.document)) {
                        setDocumentError("工作台实例格式无效");
                        return;
                    }
                    current = snapshot.data.document;
                    revision = snapshot.data.revision;
                }

                const next: WorkbenchInstanceDocument = {
                    ...current,
                    title: trimmed,
                    updatedAt: new Date().toISOString(),
                };
                const saved = await bridge.saveDocument({
                    workspaceId: workspace.id,
                    ref: { kind: "workbench", id: workbenchId },
                    baseRevision: revision,
                    document: next,
                });
                if (!saved.ok) {
                    setDocumentError(saved.error.message);
                    return;
                }

                if (workbenchId === activeWorkbenchId) {
                    activeWorkbenchRef.current = next;
                    workbenchRevisionRef.current = saved.data.revision;
                    setActiveWorkbench(next);
                }
                await refreshWorkbenches(workspace.id);
            } finally {
                setWorkbenchBusy(false);
            }
        },
        [
            activeWorkbenchId,
            activeWorkspace,
            bridge,
            refreshWorkbenches,
        ],
    );

    const handleDeleteWorkbench = useCallback(
        async (workbenchId: string): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null) return;

            setWorkbenchBusy(true);
            setDocumentError(null);
            try {
                if (
                    workbenchId === activeWorkbenchId &&
                    !(await flushCurrentDocument())
                ) {
                    return;
                }

                const deleted = await bridge.deleteDocument(workspace.id, {
                    kind: "workbench",
                    id: workbenchId,
                });
                if (!deleted.ok) {
                    setDocumentError(deleted.error.message);
                    return;
                }

                if (workbenchId === activeWorkbenchId) {
                    setActiveWorkbench(null);
                    setActiveWorkbenchId(null);
                    activeWorkbenchRef.current = null;
                    workbenchRevisionRef.current = null;
                    await openWorkbenchesForWorkspace(
                        workspace.id,
                        activeDocumentId,
                    );
                    return;
                }

                await refreshWorkbenches(workspace.id);
            } finally {
                setWorkbenchBusy(false);
            }
        },
        [
            activeDocumentId,
            activeWorkbenchId,
            activeWorkspace,
            bridge,
            flushCurrentDocument,
            openWorkbenchesForWorkspace,
            refreshWorkbenches,
        ],
    );

    const workbenchShell = useMemo<WorkbenchShell>(
        () => ({
            onRunWillStart: handleDesignerRunWillStart,
            onRunStarted: handleDesignerRunStarted,
            onRunControlsChange: setDesignerRunControls,
            onSaveStatusChange: setDesignerSaveStatus,
            onInspectorChange: setDesignerInspector,
            onProblemsChange: setDesignerProblems,
            onDocumentActionsChange: handleDocumentActionsChange,
            onControllerChange: (controller: WorkbenchController | null) => {
                workbenchControllerRef.current = controller;
            },
            onSaveConflictCopy: (graph: GraphDocument) =>
                void handleSaveConflictCopy(graph),
        }),
        [
            handleDesignerRunStarted,
            handleDesignerRunWillStart,
            handleDocumentActionsChange,
            handleSaveConflictCopy,
        ],
    );

    useEffect(() => {
        setRunEvents([]);
        setRunSnapshot(null);
    }, [activeWorkspace?.id]);

    useEffect(() => {
        if (activeWorkspace !== null) return;
        setDocuments([]);
        setRecentDocumentIds([]);
        setActiveDocumentId(null);
        setWorkbenches([]);
        setActiveWorkbenchId(null);
        setActiveWorkbench(null);
        activeWorkbenchRef.current = null;
        workbenchRevisionRef.current = null;
        documentActionsRef.current = null;
    }, [activeWorkspace]);

    useEffect(() => {
        if (bridge.smokeMode) return;
        if (autoOpenedWorkspace.current) return;
        if (workspaces.length === 0) return;

        autoOpenedWorkspace.current = true;
        void openWorkspaceById(workspaces[0]!.id);
    }, [bridge.smokeMode, workspaces, openWorkspaceById]);

    const handleToggleSidebar = useCallback(() => {
        setSidebarOpen((value) => !value);
    }, []);

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
                case "n":
                    event.preventDefault();
                    void handleCreateDocument();
                    break;
                case "b":
                    event.preventDefault();
                    handleToggleSidebar();
                    break;
                case "w":
                    event.preventDefault();
                    void flushAndClose();
                    break;
                case "k":
                    event.preventDefault();
                    window.dispatchEvent(new Event("fh:command"));
                    break;
                case "j":
                    event.preventDefault();
                    if (panelsEnabled) togglePanel("run-log");
                    break;
                case "1":
                    event.preventDefault();
                    setView("designer");
                    break;
                case "2":
                    event.preventDefault();
                    setView("diagnostics");
                    break;
                case "3":
                    event.preventDefault();
                    setView("styleguide");
                    break;
                default:
                    break;
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        flushAndClose,
        handleCreateDocument,
        handleToggleSidebar,
        panelsEnabled,
        togglePanel,
    ]);

    const decideApproval = useCallback(
        async (
            request: ApprovalRequestPayload,
            decision: "approve" | "deny",
        ): Promise<void> => {
            setApprovalRequests((current) =>
                current.filter((item) => item.requestId !== request.requestId),
            );
            await bridge.respondApproval({
                requestId: request.requestId,
                decision,
            });
        },
        [bridge],
    );

    const answerUserInput = useCallback(
        async (
            request: UserInputRequestPayload,
            answers: UserInputAnswerDto[],
            cancelled = false,
        ): Promise<void> => {
            setInputRequests((current) =>
                current.filter((item) => item.requestId !== request.requestId),
            );
            await bridge.respondUserInput({
                requestId: request.requestId,
                answers,
                ...(cancelled ? { cancelled: true } : {}),
            });
        },
        [bridge],
    );

    const main =
        view === "designer" ? (
            <div className={styles.stage}>
                {activeWorkspace === null ? (
                    <EmptyState
                        title="还没有工作区"
                        description="创建一个工作区，开始编排第一个 Harness 工作流。"
                        action={
                            <Button
                                variant="primary"
                                aria-label="新建工作区"
                                disabled={busy}
                                onClick={() => void createDemoWorkspace()}
                            >
                                新建工作区
                            </Button>
                        }
                    />
                ) : activeWorkbench === null ? (
                    <EmptyState
                        title="正在打开工作台…"
                        description={activeWorkspace.name}
                    />
                ) : (
                    <WorkbenchHost
                        key={activeWorkbench.id}
                        instance={activeWorkbench}
                        workspace={activeWorkspace}
                        documents={documents}
                        activeDocumentId={activeDocumentId}
                        busy={busy || documentBusy || workbenchBusy}
                        error={dataError ?? documentError}
                        shell={workbenchShell}
                        onUpdateInstance={updateActiveWorkbench}
                        panelLayer={
                            activeWorkbench.type === "harness-designer" ? (
                                <PanelLayer
                                    panels={panels}
                                    events={runEvents}
                                    snapshot={runSnapshot}
                                    inspector={designerInspector}
                                    problems={designerProblems?.problems ?? []}
                                    onSelectProblem={designerProblems?.select}
                                    onClose={closePanel}
                                    onFocus={focusPanel}
                                    onUpdate={updatePanel}
                                />
                            ) : undefined
                        }
                    />
                )}
            </div>
        ) : view === "diagnostics" ? (
            <DiagnosticsView
                config={config}
                workspaces={workspaces}
                dataError={dataError}
                busy={busy}
                autoStartRun={bridge.smokeMode}
                wireclaw={{
                    loaded: typeof Graph === "function",
                    graphId: bootGraph.id,
                }}
                workspaceId={activeWorkspace?.id}
                onRefresh={() => void loadData()}
                onCreateWorkspace={() => void createDemoWorkspace()}
                onRunFinished={handleRunFinished}
            />
        ) : (
            <StyleguideView />
        );

    const activeWorkbenchDefinition =
        activeWorkbench === null ? undefined : getWorkbench(activeWorkbench.type);
    const Navigation = activeWorkbenchDefinition?.navigation?.[workbenchMode];
    const navigationProps: WorkbenchNavigationProps | null =
        activeWorkbench !== null && activeWorkspace !== null
            ? {
                  instance: activeWorkbench,
                  workspace: activeWorkspace,
                  mode: workbenchMode,
                  documents,
                  recentDocumentIds,
                  activeDocumentId,
                  busy: busy || documentBusy,
                  width: sidebarWidth,
                  onResize: setSidebarWidth,
                  onCollapse: () => setSidebarOpen(false),
                  onSelectDocument: (id) => void handleSelectDocument(id),
                  onCreateDocument: () => void handleCreateDocument(),
                  onRenameDocument: (id, title) =>
                      void handleRenameDocument(id, title),
                  onDuplicateDocument: (id) => void handleDuplicateDocument(id),
                  onDeleteDocument: (id) => void handleDeleteDocument(id),
                  onImportDocument: (text, fileName) =>
                      void handleImportDocument(text, fileName),
                  onExportDocument: (options) =>
                      void handleExportDocument(options),
              }
            : null;
    const navigationContent =
        Navigation !== undefined && navigationProps !== null ? (
            <Navigation {...navigationProps} />
        ) : null;
    const navigationOpen = sidebarOpen && navigationContent !== null;

    return (
        <TooltipProvider>
            <AppShell
                titleBar={
                    <TitleBar
                        activeTitle={activeWorkspace?.name ?? null}
                        theme={theme}
                        sidebarOpen={sidebarOpen}
                        busy={busy}
                        onCreateDocument={() => void handleCreateDocument()}
                        onCreateWorkspace={() => void createDemoWorkspace()}
                        onSelectView={setView}
                        onToggleSidebar={handleToggleSidebar}
                        onToggleTheme={toggleTheme}
                        onCloseWindow={() => void flushAndClose()}
                        panelsEnabled={panelsEnabled}
                        runLogOpen={isPanelOpen("run-log")}
                        inspectorOpen={isPanelOpen("inspector")}
                        onToggleRunLog={() => togglePanel("run-log")}
                        onToggleInspector={() => togglePanel("inspector")}
                        runControls={designerRunControls}
                        workbenchMenu={
                            activeWorkspace === null ? undefined : (
                                <WorkbenchMenu
                                    workbenches={workbenches}
                                    activeWorkbenchId={activeWorkbenchId}
                                    busy={workbenchBusy || documentBusy || busy}
                                    onSelectWorkbench={(id) =>
                                        void handleSelectWorkbench(id)
                                    }
                                    onCreateWorkbench={(type) =>
                                        void handleCreateWorkbench(type)
                                    }
                                    onRenameWorkbench={(id, title) =>
                                        void handleRenameWorkbench(id, title)
                                    }
                                    onDeleteWorkbench={(id) =>
                                        void handleDeleteWorkbench(id)
                                    }
                                />
                            )
                        }
                    />
                }
                ribbon={
                    <RibbonBar
                        view={view}
                        sidebarOpen={sidebarOpen}
                        onToggleSidebar={handleToggleSidebar}
                        onSelectView={setView}
                        onToggleTheme={toggleTheme}
                        onOpenSettings={() => setSettingsOpen(true)}
                    />
                }
                sidebar={navigationContent}
                sidebarOpen={navigationOpen}
                sidebarWidth={sidebarWidth}
                main={main}
                statusBar={
                    <StatusBar
                        snapshot={runSnapshot}
                        workspacePath={activeWorkspace?.path ?? config?.workspaceRoot}
                        workspaceTitle={activeWorkspace?.name ?? null}
                        saveStatus={designerSaveStatus}
                        viewLabel={VIEW_LABEL[view]}
                        zoom="100%"
                    />
                }
            />

            <ProviderSettingsDialog
                open={settingsOpen}
                providers={config?.providers ?? []}
                onOpenChange={setSettingsOpen}
                onSaved={setConfig}
            />

            {approvalRequests[0] === undefined ? null : (
                <ApprovalDialog
                    key={approvalRequests[0].requestId}
                    request={approvalRequests[0]}
                    onDecide={(decision) =>
                        void decideApproval(approvalRequests[0]!, decision)
                    }
                />
            )}

            {inputRequests[0] === undefined ? null : (
                <UserInputDialog
                    key={inputRequests[0].requestId}
                    request={inputRequests[0]}
                    onSubmit={(answers, cancelled) =>
                        void answerUserInput(
                            inputRequests[0]!,
                            answers,
                            cancelled,
                        )
                    }
                />
            )}
        </TooltipProvider>
    );
}

function localStore(): Storage | undefined {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeFileName(value: string): string {
    const name = value.replace(/[\\/:*?"<>|]/g, "_").trim();
    return name.length === 0 ? "harness" : name;
}
