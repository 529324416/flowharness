import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
} from "react";
// Wireclaw 以普通包依赖的方式引入；这里用于启动自检与 RunResult 校验。
import {
    Graph,
    RunResultSerializer,
    type GraphDocument,
    type RunResult,
} from "wireclaw";
import type {
    AppConfig,
    ApprovalRequestPayload,
    HarnessDocumentSummary,
    RunEventBatch,
    RunEventDto,
    RunSnapshot,
    SessionSummary as StoredSessionSummary,
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
import { ProviderLibraryDialog } from "./providers/ProviderLibraryDialog";
import { ProviderLibraryProvider } from "./providers/ProviderLibraryProvider";
import { RibbonBar } from "./shell/RibbonBar";
import {
    ApprovalDialog,
    UserInputDialog,
} from "./shell/InteractionDialogs";
import {
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_MIN_WIDTH,
    type PanelLayoutState,
} from "./layout-metrics";
import { StatusBar } from "./shell/StatusBar";
import { PanelLayer } from "./shell/panels/PanelLayer";
import { useFloatingPanels } from "./shell/panels/useFloatingPanels";
import { SplitSidebar } from "./shell/navigation/SplitSidebar";
import { fromStoredSession } from "./shell/sessions";
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
import { getWorkbenchTemplate } from "./workbench/templates";
import { sameRunSnapshot } from "./run/run-snapshot";
import {
    openNodeLibrary,
    openPresetManager,
} from "./presets/bus";
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

/**
 * 自动创建的运行会话标题：工作流名 + 本地时间，便于在 Session 树里区分。
 */
function runSessionTitle(title: string | undefined): string {
    const base = title?.trim() ?? "";
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes(),
    ).padStart(2, "0")}`;
    return base.length > 0 ? `运行 · ${base} · ${time}` : `运行 · ${time}`;
}

const RUN_STATUS_LABEL: Record<RunResult["status"], string> = {
    running: "运行中",
    paused: "已暂停",
    completed: "完成",
    failed: "失败",
    cancelled: "已取消",
};

/** 运行结束时追加到会话的输出摘要；没有输出且成功时返回 null。 */
function formatRunSummary(result: RunResult): string | null {
    const lines: string[] = [];
    const outputs = result.outputs as Record<string, unknown>;

    for (const [port, value] of Object.entries(outputs)) {
        const text = harnessValueText(value);
        if (text !== null) lines.push(`- ${port}: ${text}`);
    }

    if (
        lines.length === 0 &&
        result.status === "completed" &&
        result.error === undefined
    ) {
        return null;
    }

    const parts = [
        `运行${RUN_STATUS_LABEL[result.status]} · ${result.graphId} · ${result.runId}`,
    ];
    if (lines.length > 0) parts.push("输出", ...lines);
    if (result.error !== undefined) parts.push("错误", result.error);
    return parts.join("\n");
}

function harnessValueText(value: unknown): string | null {
    if (typeof value === "string") return value;
    if (typeof value !== "object" || value === null) return null;

    const record = value as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
        return record.text;
    }
    if (record.type === "attachment" && typeof record.contentHash === "string") {
        return `[附件 ${record.contentHash.slice(0, 12)}]`;
    }
    if (record.type === "attachments" && Array.isArray(record.attachments)) {
        return `[${String(record.attachments.length)} 个附件]`;
    }
    if (record.type === "json") {
        try {
            return JSON.stringify(record.value ?? null);
        } catch {
            return null;
        }
    }

    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

const SIDEBAR_OPEN_KEY = "fh.sidebar.open";
const SIDEBAR_WIDTH_KEY = "fh.sidebar.width";

type DataSnapshot = {
    configOk: boolean;
    config: AppConfig | null;
    workspaceCount: number;
    error: string | null;
};

/**
 * 删除当前工作流后的回退顺序：
 * 上一条渲染过的图 → 当前工作台仍绑定的图 → 列表第一条。
 */
function pickFallbackDocumentId(
    documents: readonly HarnessDocumentSummary[],
    history: readonly string[],
    boundGraphId: string | null,
): string | null {
    const available = new Set(documents.map((document) => document.id));
    const fromHistory = history.find((id) => available.has(id));
    if (fromHistory !== undefined) return fromHistory;
    if (boundGraphId !== null && available.has(boundGraphId)) return boundGraphId;
    return documents[0]?.id ?? null;
}

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
    const [workbenchMode, setWorkbenchMode] = useState<WorkbenchMode>("design");
    const [activeSession, setActiveSession] =
        useState<StoredSessionSummary | null>(null);

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
    const [runResult, setRunResult] = useState<RunResult | null>(null);
    /** 运行结果是否自动存入草稿目录；false 时只保留临时草稿。 */
    const [storeRunDraft, setStoreRunDraft] = useState(false);
    const [savingRunDraft, setSavingRunDraft] = useState(false);
    const [sessionHistoryRevision, setSessionHistoryRevision] = useState(0);
    const [sessionRevision, setSessionRevision] = useState(0);
    const fetchedRunResultId = useRef<string | null>(null);
    /** 本次运行自动创建的会话；entries / 输出摘要都写入它。 */
    const runSessionIdRef = useRef<string | null>(null);
    const seenRunEntryIds = useRef<Set<string>>(new Set());
    const summaryWrittenRunId = useRef<string | null>(null);
    const runEntriesSyncChain = useRef<Promise<void>>(Promise.resolve());
    /** 运行日志事件按 100ms 节流写入 React state，避免每个 token 批次重渲染壳层。 */
    const pendingRunEventsRef = useRef<RunEventDto[]>([]);
    const runEventsFlushTimerRef = useRef<number | null>(null);
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
    /** 工作流切换历史（最近的在前），删除当前图后回退使用。 */
    const documentHistoryRef = useRef<string[]>([]);
    const previousDocumentIdRef = useRef<string | null>(null);

    useEffect(() => {
        const previous = previousDocumentIdRef.current;
        if (previous !== null && previous !== activeDocumentId) {
            documentHistoryRef.current = [
                previous,
                ...documentHistoryRef.current.filter((id) => id !== previous),
            ].slice(0, 20);
        }
        previousDocumentIdRef.current = activeDocumentId;
    }, [activeDocumentId]);

    const {
        panels,
        isOpen: isPanelOpen,
        toggle: togglePanel,
        open: openPanel,
        close: closePanel,
        focus: focusPanel,
        update: updatePanel,
        applyLayout: applyPanelLayout,
    } = useFloatingPanels();

    const panelsEnabled = view === "designer" && activeWorkspace !== null;
    const nodeLibraryEnabled =
        panelsEnabled && activeWorkbench?.type === "harness-designer";

    // 切换工作台时恢复实例保存的 design / run 阶段与选中的会话。
    useEffect(() => {
        const workbench = activeWorkbenchRef.current;
        setWorkbenchMode(workbench?.mode === "run" ? "run" : "design");

        const sessionId = workbench?.sessionId ?? null;
        if (sessionId === null || activeWorkspace === null) {
            setActiveSession(null);
            return;
        }

        let cancelled = false;
        void (async () => {
            const result = await bridge.openSession({
                workspaceId: activeWorkspace.id,
                sessionId,
            });
            if (!cancelled) setActiveSession(result.ok ? result.data : null);
        })();

        return () => {
            cancelled = true;
        };
    }, [activeWorkbench?.id, activeWorkspace?.id, bridge]);

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

    useEffect(() => {
        const flushPendingEvents = (): void => {
            if (runEventsFlushTimerRef.current !== null) {
                window.clearTimeout(runEventsFlushTimerRef.current);
                runEventsFlushTimerRef.current = null;
            }
            const pending = pendingRunEventsRef.current.splice(0);
            if (pending.length === 0) return;
            setRunEvents((current) => [...current, ...pending].slice(-300));
        };

        const unsubscribe = bridge.onEvent((envelope) => {
            if (envelope.topic === "run") {
                const batch = envelope.payload as RunEventBatch;
                setRunSnapshot((current) =>
                    sameRunSnapshot(current, batch.snapshot)
                        ? current
                        : batch.snapshot,
                );
                pendingRunEventsRef.current.push(...batch.events);

                if (batch.events.some((event) => event.type === "run:end")) {
                    flushPendingEvents();
                } else if (runEventsFlushTimerRef.current === null) {
                    runEventsFlushTimerRef.current = window.setTimeout(
                        flushPendingEvents,
                        100,
                    );
                }
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
        });

        return () => {
            unsubscribe();
            if (runEventsFlushTimerRef.current !== null) {
                window.clearTimeout(runEventsFlushTimerRef.current);
                runEventsFlushTimerRef.current = null;
            }
        };
    }, [bridge]);

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

    /**
     * 独立运行页已移除：旧的 `flow-runner` 实例在打开工作区时转成 Harness 设计器，
     * 保留 graph 绑定与标题，运行直接复用设计器画布。
     */
    const migrateLegacyWorkbenches = useCallback(
        async (
            workspaceId: string,
            list: readonly WorkbenchSummary[],
        ): Promise<boolean> => {
            let changed = false;

            for (const summary of list) {
                if (summary.type !== "flow-runner") continue;

                const snapshot = await bridge.readDocument(workspaceId, {
                    kind: "workbench",
                    id: summary.id,
                });
                if (!snapshot.ok || snapshot.data === null) continue;
                if (!isWorkbenchInstanceDocument(snapshot.data.document)) continue;

                const current = snapshot.data.document;
                const next: WorkbenchInstanceDocument = {
                    ...current,
                    type: "harness-designer",
                    title:
                        current.title.trim().length === 0 || current.title === "运行页"
                            ? defaultWorkbenchTitle("harness-designer")
                            : current.title,
                    mode: "design",
                    runId: null,
                    updatedAt: new Date().toISOString(),
                };
                const saved = await bridge.saveDocument({
                    workspaceId,
                    ref: { kind: "workbench", id: summary.id },
                    baseRevision: snapshot.data.revision,
                    document: next,
                });
                if (!saved.ok) {
                    setDocumentError(saved.error.message);
                    continue;
                }
                changed = true;
            }

            return changed;
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
                if (await migrateLegacyWorkbenches(workspaceId, list)) {
                    list = await refreshWorkbenches(workspaceId);
                }
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

                // 打开工作区时优先回到 Harness Designer；没有时再使用最近的工作台。
                const first =
                    list.find((workbench) => workbench.type === "harness-designer") ??
                    list[0];
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
            migrateLegacyWorkbenches,
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

    // 持久化当前阶段与选中的会话，供下次打开工作台时恢复。
    useEffect(() => {
        const current = activeWorkbenchRef.current;
        if (current === null) return;
        const sessionId = activeSession?.id ?? null;
        if (current.mode === workbenchMode && current.sessionId === sessionId) return;

        updateActiveWorkbench((value) => ({
            ...value,
            mode: workbenchMode,
            sessionId,
        }));
    }, [activeSession?.id, updateActiveWorkbench, workbenchMode]);

    // 最近一次 run 一并写入实例，切回运行模式时可恢复运行上下文。
    useEffect(() => {
        const current = activeWorkbenchRef.current;
        if (current === null) return;
        const runId = runSnapshot?.runId ?? null;
        if (current.runId === runId) return;

        updateActiveWorkbench((value) => ({ ...value, runId }));
    }, [runSnapshot?.runId, updateActiveWorkbench]);

    const handleWorkbenchModeChange = useCallback(
        async (mode: WorkbenchMode): Promise<void> => {
            setWorkbenchMode(mode);
        },
        [],
    );

    // 工作台导航选中文档后，统一在工作台壳层维护 primaryGraph 绑定。
    useEffect(() => {
        if (activeWorkbench?.type !== "harness-designer") return;
        if (activeDocumentId === null) return;
        // 文档可能刚被删除或外部移除；不要在实例里留下悬空绑定。
        if (!documents.some((document) => document.id === activeDocumentId)) return;
        if (primaryGraphId(activeWorkbench) === activeDocumentId) return;
        updateActiveWorkbench((current) =>
            withPrimaryGraph(current, activeDocumentId),
        );
    }, [activeDocumentId, activeWorkbench, documents, updateActiveWorkbench]);

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
        async (templateId: string): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null) return;

            const template = getWorkbenchTemplate(templateId);
            if (template === undefined) {
                setDocumentError(`未知工作台模板：${templateId}`);
                return;
            }

            setWorkbenchBusy(true);
            setDocumentError(null);
            try {
                if (!(await flushCurrentDocument())) return;

                let graphId = activeDocumentId ?? documents[0]?.id ?? "main";
                if (template.createGraph !== undefined) {
                    const newGraphId = createDocumentId();
                    const graph = template.createGraph(newGraphId);
                    const savedGraph = await bridge.saveDocument({
                        workspaceId: workspace.id,
                        ref: { kind: "harness", id: newGraphId },
                        baseRevision: null,
                        document: graph,
                    });
                    if (!savedGraph.ok) {
                        setDocumentError(savedGraph.error.message);
                        return;
                    }
                    await refreshDocuments(workspace.id);
                    graphId = newGraphId;
                }

                const id = createWorkbenchId();
                const instance = createWorkbenchInstance({
                    id,
                    type: template.type,
                    title:
                        template.instanceTitle ??
                        defaultWorkbenchTitle(template.type),
                    graphId,
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
                const primary = primaryGraphId(instance);
                if (primary !== null) {
                    setActiveDocumentId(primary);
                    rememberDocument(workspace.id, primary);
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
            refreshDocuments,
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
                        snapshot.ok ? "工作流不存在" : snapshot.error.message,
                    );
                    return;
                }

                const document = withDocumentTitle(snapshot.data.document, trimmed);
                if (document === null) {
                    setDocumentError("工作流格式不支持重命名");
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

    const handleDuplicateDocuments = useCallback(
        async (ids: readonly string[]): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null || ids.length === 0) return;

            setDocumentBusy(true);
            setDocumentError(null);
            try {
                if (
                    ids.includes(activeDocumentId ?? "") &&
                    !(await flushCurrentDocument())
                ) {
                    return;
                }

                const created: string[] = [];
                for (const id of ids) {
                    const snapshot = await bridge.readDocument(workspace.id, {
                        kind: "harness",
                        id,
                    });
                    if (!snapshot.ok || snapshot.data === null) {
                        setDocumentError(
                            snapshot.ok
                                ? "工作流不存在"
                                : snapshot.error.message,
                        );
                        return;
                    }
                    if (!isGraphDocument(snapshot.data.document)) {
                        setDocumentError("工作流不是有效的 GraphDocument");
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
                    created.push(nextId);
                }

                await refreshDocuments(workspace.id);
                // 单选复制保持原有行为：切换到副本；批量复制不改变当前文档。
                const first = created[0];
                if (created.length === 1 && first !== undefined) {
                    setActiveDocumentId(first);
                    rememberDocument(workspace.id, first);
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
            rememberDocument,
        ],
    );

    const handleDuplicateDocument = useCallback(
        (id: string): void => {
            void handleDuplicateDocuments([id]);
        },
        [handleDuplicateDocuments],
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

    const handleDeleteDocuments = useCallback(
        async (ids: readonly string[]): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null || ids.length === 0) return;

            setDocumentBusy(true);
            setDocumentError(null);
            try {
                if (
                    ids.includes(activeDocumentId ?? "") &&
                    !(await flushCurrentDocument())
                ) {
                    return;
                }
                // 主进程会解除工作台对这张图的引用；先让挂起的实例保存落盘，
                // 避免旧快照稍后覆盖解除结果。
                await workbenchSaveChain.current;

                for (const id of ids) {
                    const result = await bridge.deleteDocument(workspace.id, {
                        kind: "harness",
                        id,
                    });
                    if (!result.ok) {
                        setDocumentError(result.error.message);
                        return;
                    }
                }

                const list = await refreshDocuments(workspace.id);
                await refreshWorkbenches(workspace.id);
                const reloaded =
                    activeWorkbenchId === null
                        ? null
                        : await loadWorkbench(workspace.id, activeWorkbenchId);

                documentHistoryRef.current = documentHistoryRef.current.filter(
                    (candidate) => !ids.includes(candidate),
                );

                if (!ids.includes(activeDocumentId ?? "")) return;

                const next = pickFallbackDocumentId(
                    list,
                    documentHistoryRef.current,
                    reloaded === null ? null : primaryGraphId(reloaded),
                );
                // 没有剩余工作流时保持 null，设计器显示空态而不是自动新建。
                setActiveDocumentId(next);
                if (next !== null) rememberDocument(workspace.id, next);
            } finally {
                setDocumentBusy(false);
            }
        },
        [
            activeDocumentId,
            activeWorkbenchId,
            activeWorkspace,
            bridge,
            flushCurrentDocument,
            loadWorkbench,
            refreshDocuments,
            refreshWorkbenches,
            rememberDocument,
        ],
    );

    const handleDeleteDocument = useCallback(
        (id: string): void => {
            void handleDeleteDocuments([id]);
        },
        [handleDeleteDocuments],
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
        async (
            { stripUi }: { stripUi: boolean },
            documentId?: string,
        ): Promise<void> => {
            const workspace = activeWorkspace;
            const id = documentId ?? activeDocumentId;
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
                        snapshot.ok ? "工作流不存在" : snapshot.error.message,
                    );
                    return;
                }

                const text = serializeHarnessJson(snapshot.data.document, {
                    stripUi,
                });
                if (text === null) {
                    setDocumentError("工作流不是有效的 GraphDocument");
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

    const handleImportWorkspace = useCallback(async (): Promise<void> => {
        if (busy) return;
        setBusy(true);
        setDataError(null);
        try {
            const imported = await bridge.importWorkspaceArchive();
            if (!imported.ok) {
                setDataError(imported.error.message);
                return;
            }
            if (imported.data === null) return;

            autoOpenedWorkspace.current = true;
            await loadData();
            await openWorkspaceById(imported.data.id);
        } finally {
            setBusy(false);
        }
    }, [bridge, busy, loadData, openWorkspaceById]);

    const handleExportWorkspace = useCallback(async (): Promise<void> => {
        const workspace = activeWorkspace;
        if (workspace === null || busy) return;

        setBusy(true);
        setDataError(null);
        try {
            const exported = await bridge.exportWorkspaceArchive({
                workspaceId: workspace.id,
                defaultName: workspace.name,
            });
            if (!exported.ok) {
                setDataError(exported.error.message);
            }
        } finally {
            setBusy(false);
        }
    }, [activeWorkspace, bridge, busy]);

    const handleDesignerRunWillStart = useCallback(async (): Promise<void> => {
        setRunEvents([]);
        setRunSnapshot(null);
        setRunResult(null);
        fetchedRunResultId.current = null;
        seenRunEntryIds.current = new Set();
        summaryWrittenRunId.current = null;
        runSessionIdRef.current = null;
        runEntriesSyncChain.current = Promise.resolve();
        pendingRunEventsRef.current = [];
        if (runEventsFlushTimerRef.current !== null) {
            window.clearTimeout(runEventsFlushTimerRef.current);
            runEventsFlushTimerRef.current = null;
        }

        const workspace = activeWorkspace;
        if (workspace === null) return;

        const tree = await bridge.listSessionTree({ workspaceId: workspace.id });
        const folderId = tree.ok ? tree.data.draftFolderId : null;
        const title = runSessionTitle(
            documents.find((document) => document.id === activeDocumentId)?.title,
        );
        const created = await bridge.createSession(
            storeRunDraft
                ? {
                      workspaceId: workspace.id,
                      folderId,
                      title,
                      discardTemporary: true,
                  }
                : {
                      workspaceId: workspace.id,
                      title,
                      temporary: true,
                      discardTemporary: true,
                  },
        );
        if (!created.ok) {
            setDataError(created.error.message);
            return;
        }

        runSessionIdRef.current = created.data.id;
        setActiveSession(created.data);
        setSessionRevision((current) => current + 1);
        setSessionHistoryRevision((current) => current + 1);
        openPanel("session-history");
    }, [
        activeDocumentId,
        activeWorkspace,
        bridge,
        documents,
        openPanel,
        storeRunDraft,
    ]);

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

    const runFinished =
        runSnapshot !== null &&
        (runSnapshot.status === "completed" ||
            runSnapshot.status === "failed" ||
            runSnapshot.status === "cancelled");

    // 运行结束后从 main 拉取 wireclaw RunResult；按 runId 去重，避免事件批次重复请求。
    useEffect(() => {
        if (!runFinished || runSnapshot === null || activeWorkspace === null) return;
        if (fetchedRunResultId.current === runSnapshot.runId) return;

        fetchedRunResultId.current = runSnapshot.runId;
        const runId = runSnapshot.runId;
        const workspaceId = activeWorkspace.id;
        let cancelled = false;

        void (async () => {
            const loaded = await bridge.getRunResult({ runId, workspaceId });
            if (cancelled) return;

            if (!loaded.ok || loaded.data === null) {
                setRunResult(null);
                return;
            }

            try {
                setRunResult(RunResultSerializer.deserialize(loaded.data));
            } catch {
                setRunResult(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [activeWorkspace, bridge, runFinished, runSnapshot?.runId]);

    /**
     * 把运行中已采集的 RunResult entries 增量写入自动会话。
     * 串行排队，避免轮询与结束同步并发导致重复消息。
     */
    const syncRunEntries = useCallback(
        (runId: string): Promise<void> => {
            const workspace = activeWorkspace;
            const sessionId = runSessionIdRef.current;
            if (workspace === null || sessionId === null) return Promise.resolve();

            const next = runEntriesSyncChain.current.then(async () => {
                const response = await bridge.getRunEntries({ runId });
                if (!response.ok) return;

                const entries = Array.isArray(response.data) ? response.data : [];
                const fresh = entries.filter((entry) => {
                    if (typeof entry !== "object" || entry === null) return false;
                    const id = (entry as { id?: unknown }).id;
                    return (
                        typeof id === "string" &&
                        id.length > 0 &&
                        !seenRunEntryIds.current.has(id)
                    );
                });
                if (fresh.length === 0) return;

                const appended = await bridge.appendRunEntries({
                    workspaceId: workspace.id,
                    sessionId,
                    entries: fresh,
                });
                if (!appended.ok) return;

                for (const entry of fresh) {
                    seenRunEntryIds.current.add((entry as { id: string }).id);
                }
                setActiveSession(appended.data);
                setSessionHistoryRevision((current) => current + 1);
                setSessionRevision((current) => current + 1);
            });

            runEntriesSyncChain.current = next.catch(() => undefined);
            return next;
        },
        [activeWorkspace, bridge],
    );

    // 运行中轮询已采集的 entries，模型调用 / Agent 条目按完成顺序出现。
    useEffect(() => {
        if (runSnapshot?.status !== "running") return;
        const runId = runSnapshot.runId;
        const timer = setInterval(() => {
            void syncRunEntries(runId);
        }, 450);
        return () => clearInterval(timer);
    }, [runSnapshot?.runId, runSnapshot?.status, syncRunEntries]);

    // 结束后补最后一批 entries，并把输出摘要写入会话。
    useEffect(() => {
        if (!runFinished || runSnapshot === null) return;
        void syncRunEntries(runSnapshot.runId);
    }, [runFinished, runSnapshot?.runId, syncRunEntries]);

    useEffect(() => {
        if (!runFinished || runSnapshot === null || runResult === null) return;
        const runId = runSnapshot.runId;
        if (summaryWrittenRunId.current === runId) return;
        summaryWrittenRunId.current = runId;

        void (async () => {
            await syncRunEntries(runId);

            const summary = formatRunSummary(runResult);
            const sessionId = runSessionIdRef.current;
            const workspace = activeWorkspace;
            if (summary === null || sessionId === null || workspace === null) return;

            const appended = await bridge.appendSessionMessage({
                workspaceId: workspace.id,
                sessionId,
                role: "system",
                content: summary,
            });
            if (!appended.ok) {
                setDataError(appended.error.message);
                return;
            }

            setActiveSession(appended.data);
            setSessionHistoryRevision((current) => current + 1);
            setSessionRevision((current) => current + 1);
        })();
    }, [
        activeWorkspace,
        bridge,
        runFinished,
        runResult,
        runSnapshot,
        syncRunEntries,
    ]);

    const handleSaveRunDraft = useCallback(
        async (sessionId: string): Promise<void> => {
            const workspace = activeWorkspace;
            if (workspace === null || savingRunDraft) return;

            setSavingRunDraft(true);
            setDataError(null);
            try {
                const saved = await bridge.commitTemporarySession({
                    workspaceId: workspace.id,
                    sessionId,
                });
                if (!saved.ok) {
                    setDataError(saved.error.message);
                    return;
                }
                setActiveSession(saved.data);
                setSessionRevision((current) => current + 1);
                setSessionHistoryRevision((current) => current + 1);
            } finally {
                setSavingRunDraft(false);
            }
        },
        [activeWorkspace, bridge, savingRunDraft],
    );

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
            panels,
            onApplyPanelLayout: (layout: readonly PanelLayoutState[] | null) =>
                applyPanelLayout(layout),
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
            onModeChange: (mode) => void handleWorkbenchModeChange(mode),
            onSaveConflictCopy: (graph: GraphDocument) =>
                void handleSaveConflictCopy(graph),
        }),
        [
            applyPanelLayout,
            handleDesignerRunStarted,
            handleDesignerRunWillStart,
            handleDocumentActionsChange,
            handleSaveConflictCopy,
            handleWorkbenchModeChange,
            panels,
        ],
    );

    useEffect(() => {
        setRunEvents([]);
        setRunSnapshot(null);
        setRunResult(null);
        fetchedRunResultId.current = null;
        runSessionIdRef.current = null;
        seenRunEntryIds.current = new Set();
        summaryWrittenRunId.current = null;
        runEntriesSyncChain.current = Promise.resolve();
        pendingRunEventsRef.current = [];
        if (runEventsFlushTimerRef.current !== null) {
            window.clearTimeout(runEventsFlushTimerRef.current);
            runEventsFlushTimerRef.current = null;
        }
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

            if (event.shiftKey) {
                const shifted = event.key.toLowerCase();
                if (shifted === "n" || shifted === "m") {
                    if (!nodeLibraryEnabled) return;
                    event.preventDefault();
                    if (shifted === "n") openNodeLibrary();
                    else openPresetManager();
                    return;
                }
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
        nodeLibraryEnabled,
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
                        mode={workbenchMode}
                        busy={busy || documentBusy || workbenchBusy}
                        error={dataError ?? documentError}
                        shell={workbenchShell}
                        onUpdateInstance={updateActiveWorkbench}
                        onCreateDocument={() => void handleCreateDocument()}
                        panelLayer={
                            activeWorkbench.type === "harness-designer" ? (
                                <PanelLayer
                                    panels={panels}
                                    events={runEvents}
                                    snapshot={runSnapshot}
                                    inspector={designerInspector}
                                    problems={designerProblems?.problems ?? []}
                                    sessionHistory={
                                        activeSession !== null &&
                                        activeWorkspace !== null
                                            ? {
                                                  workspace: activeWorkspace,
                                                  session: fromStoredSession(
                                                      activeSession,
                                                  ),
                                                  revision: sessionHistoryRevision,
                                                  temporary:
                                                      activeSession.temporary ===
                                                      true,
                                                  savingDraft: savingRunDraft,
                                                  onSaveDraft: (sessionId) =>
                                                      void handleSaveRunDraft(
                                                          sessionId,
                                                      ),
                                              }
                                            : null
                                    }
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
    const split = activeWorkbenchDefinition?.splitNavigation;
    const SplitTop =
        split === undefined
            ? undefined
            : activeWorkbenchDefinition?.navigation?.[split.top];
    const SplitBottom =
        split === undefined
            ? undefined
            : activeWorkbenchDefinition?.navigation?.[split.bottom];
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
                  onModeChange: (mode) => void handleWorkbenchModeChange(mode),
                  activeSessionId: activeSession?.id ?? null,
                  temporarySession:
                      activeSession?.temporary === true ? activeSession : null,
                  sessionRevision,
                  onOpenSession: (session) => {
                      setActiveSession(session);
                      openPanel("session-history");
                  },
                  onSessionsDeleted: (sessionIds) => {
                      if (
                          activeSession !== null &&
                          sessionIds.includes(activeSession.id)
                      ) {
                          setActiveSession(null);
                      }
                  },
                  onSelectDocument: (id) => void handleSelectDocument(id),
                  onCreateDocument: () => void handleCreateDocument(),
                  onRenameDocument: (id, title) =>
                      void handleRenameDocument(id, title),
                  onDuplicateDocument: (id) => void handleDuplicateDocument(id),
                  onDeleteDocument: (id) => void handleDeleteDocument(id),
                  onDuplicateDocuments: (ids) =>
                      void handleDuplicateDocuments(ids),
                  onDeleteDocuments: (ids) => void handleDeleteDocuments(ids),
                  onImportDocument: (text, fileName) =>
                      void handleImportDocument(text, fileName),
                  onExportDocument: (options, documentId) =>
                      void handleExportDocument(options, documentId),
              }
            : null;
    const navigationContent =
        navigationProps === null
            ? null
            : SplitTop !== undefined && SplitBottom !== undefined
              ? (
                    <SplitSidebar
                        width={sidebarWidth}
                        onResize={setSidebarWidth}
                        top={<SplitTop {...navigationProps} navSection="top" />}
                        bottom={
                            <SplitBottom
                                {...navigationProps}
                                navSection="bottom"
                            />
                        }
                    />
                )
              : Navigation !== undefined
                ? <Navigation {...navigationProps} />
                : null;
    const navigationOpen = sidebarOpen && navigationContent !== null;

    return (
        <TooltipProvider>
            <ProviderLibraryProvider>
                <AppShell
                titleBar={
                    <TitleBar
                        activeTitle={activeWorkspace?.name ?? null}
                        theme={theme}
                        sidebarOpen={sidebarOpen}
                        busy={busy}
                        onCreateDocument={() => void handleCreateDocument()}
                        onCreateWorkspace={() => void createDemoWorkspace()}
                        onImportWorkspace={() => void handleImportWorkspace()}
                        onExportWorkspace={() => void handleExportWorkspace()}
                        canExportWorkspace={activeWorkspace !== null}
                        onSelectView={setView}
                        onToggleSidebar={handleToggleSidebar}
                        onToggleTheme={toggleTheme}
                        onCloseWindow={() => void flushAndClose()}
                        panelsEnabled={panelsEnabled}
                        nodeLibraryEnabled={nodeLibraryEnabled}
                        runLogOpen={isPanelOpen("run-log")}
                        inspectorOpen={isPanelOpen("inspector")}
                        onToggleRunLog={() => togglePanel("run-log")}
                        onToggleInspector={() => togglePanel("inspector")}
                        runControls={designerRunControls}
                        storeRunDraft={storeRunDraft}
                        onToggleStoreRunDraft={() =>
                            setStoreRunDraft((current) => !current)
                        }
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

            <ProviderLibraryDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
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
            </ProviderLibraryProvider>
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
