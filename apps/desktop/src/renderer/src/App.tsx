import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
// Wireclaw 以普通包依赖的方式引入；这里用于启动自检。
import { Graph, type GraphDocument } from "wireclaw";
import type {
    AppConfig,
    HarnessDocumentSummary,
    RunEventBatch,
    RunEventDto,
    RunSnapshot,
    WorkspaceSummary,
} from "@flowharness/contracts";
import { TooltipProvider } from "./ui";
import { AppShell } from "./shell/AppShell";
import { DocumentMenu } from "./shell/DocumentMenu";
import { TitleBar } from "./shell/TitleBar";
import { RibbonBar } from "./shell/RibbonBar";
import { SessionSidebar } from "./shell/SessionSidebar";
import {
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_MIN_WIDTH,
} from "./layout-metrics";
import { StatusBar } from "./shell/StatusBar";
import { createSession, INITIAL_SESSIONS, type SessionSummary } from "./shell/sessions";
import { PanelLayer } from "./shell/panels/PanelLayer";
import { useFloatingPanels } from "./shell/panels/useFloatingPanels";
import { VIEW_LABEL, type ViewId } from "./shell/views";
import { DesignerView, type DesignerSaveStatus } from "./views/DesignerView";
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

    const [sessions, setSessions] = useState<SessionSummary[]>(INITIAL_SESSIONS);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    const [config, setConfig] = useState<AppConfig | null>(null);
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSummary | null>(
        null,
    );
    const [dataError, setDataError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [runSnapshot, setRunSnapshot] = useState<RunSnapshot | null>(null);
    const [runEvents, setRunEvents] = useState<RunEventDto[]>([]);
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

    const {
        panels,
        isOpen: isPanelOpen,
        toggle: togglePanel,
        close: closePanel,
        focus: focusPanel,
        update: updatePanel,
    } = useFloatingPanels();

    const activeSession =
        sessions.find((session) => session.id === activeSessionId) ?? null;
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
                if (envelope.topic !== "run") return;
                const batch = envelope.payload as RunEventBatch;
                setRunSnapshot(batch.snapshot);
                setRunEvents((current) => [...current, ...batch.events].slice(-300));
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
        async (workspaceId: string): Promise<void> => {
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
                        return;
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
            } finally {
                setDocumentBusy(false);
            }
        },
        [bridge, refreshDocuments, rememberDocument],
    );

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
                }

                const opened = await bridge.openWorkspace(id);
                if (!opened.ok) {
                    setDataError(opened.error.message);
                    return;
                }

                setActiveWorkspace(opened.data);
                setView("designer");
                await openDocumentsForWorkspace(opened.data.id);
            } finally {
                setBusy(false);
            }
        },
        [
            activeWorkspace,
            bridge,
            flushCurrentDocument,
            openDocumentsForWorkspace,
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

    useEffect(() => {
        setRunEvents([]);
        setRunSnapshot(null);
    }, [activeWorkspace?.id]);

    useEffect(() => {
        if (activeWorkspace !== null) return;
        setDocuments([]);
        setRecentDocumentIds([]);
        setActiveDocumentId(null);
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

    const handleNewSession = useCallback(() => {
        const next = createSession(sessions.length + 1);
        setSessions((current) => [next, ...current]);
        setActiveSessionId(next.id);
        setView("designer");
        setSidebarOpen(true);
    }, [sessions.length]);

    const handleSelectSession = useCallback((id: string) => {
        setActiveSessionId(id);
        setView("designer");
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
                    handleNewSession();
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
        bridge,
        flushAndClose,
        handleNewSession,
        handleToggleSidebar,
        panelsEnabled,
        togglePanel,
    ]);

    const main =
        view === "designer" ? (
            <div className={styles.stage}>
                <DesignerView
                    workspace={activeWorkspace}
                    documentId={activeDocumentId}
                    busy={busy || documentBusy}
                    error={dataError ?? documentError}
                    onCreateWorkspace={() => void createDemoWorkspace()}
                    onRunWillStart={handleDesignerRunWillStart}
                    onRunStarted={handleDesignerRunStarted}
                    onRunControlsChange={setDesignerRunControls}
                    onSaveStatusChange={setDesignerSaveStatus}
                    onInspectorChange={setDesignerInspector}
                    onProblemsChange={setDesignerProblems}
                    onDocumentActionsChange={handleDocumentActionsChange}
                    onSaveConflictCopy={(graph) => void handleSaveConflictCopy(graph)}
                />
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
                onRefresh={() => void loadData()}
                onCreateWorkspace={() => void createDemoWorkspace()}
                onRunFinished={handleRunFinished}
            />
        ) : (
            <StyleguideView />
        );

    return (
        <TooltipProvider>
            <AppShell
                titleBar={
                    <TitleBar
                        activeSessionTitle={
                            activeWorkspace?.name ?? activeSession?.title ?? null
                        }
                        theme={theme}
                        sidebarOpen={sidebarOpen}
                        busy={busy}
                        onNewSession={handleNewSession}
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
                        documentMenu={
                            activeWorkspace === null ? undefined : (
                            <DocumentMenu
                                documents={documents}
                                recentDocumentIds={recentDocumentIds}
                                activeDocumentId={activeDocumentId}
                                busy={documentBusy || busy}
                                onSelectDocument={(id) => void handleSelectDocument(id)}
                                onCreateDocument={() => void handleCreateDocument()}
                                onRenameDocument={(id, title) =>
                                    void handleRenameDocument(id, title)
                                }
                                onDuplicateDocument={(id) =>
                                    void handleDuplicateDocument(id)
                                }
                                onDeleteDocument={(id) =>
                                    void handleDeleteDocument(id)
                                }
                                onImportDocument={(text, fileName) =>
                                    void handleImportDocument(text, fileName)
                                }
                                onExportDocument={(options) =>
                                    void handleExportDocument(options)
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
                    />
                }
                sidebar={
                    <SessionSidebar
                        sessions={sessions}
                        activeId={activeSessionId}
                        width={sidebarWidth}
                        onSelect={handleSelectSession}
                        onNew={handleNewSession}
                        onCollapse={() => setSidebarOpen(false)}
                        onResize={setSidebarWidth}
                    />
                }
                sidebarOpen={sidebarOpen}
                sidebarWidth={sidebarWidth}
                main={main}
                statusBar={
                    <StatusBar
                        snapshot={runSnapshot}
                        workspacePath={activeWorkspace?.path ?? config?.workspaceRoot}
                        sessionTitle={
                            activeWorkspace?.name ?? activeSession?.title ?? null
                        }
                        saveStatus={designerSaveStatus}
                        viewLabel={VIEW_LABEL[view]}
                        zoom="100%"
                    />
                }
            />
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
