import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
// Wireclaw 以普通包依赖的方式引入；这里用于启动自检。
import { Graph } from "wireclaw";
import type {
    AppConfig,
    RunEventBatch,
    RunSnapshot,
    WorkspaceSummary,
} from "@flowharness/contracts";
import { TooltipProvider } from "./ui";
import { AppShell } from "./shell/AppShell";
import { TitleBar } from "./shell/TitleBar";
import { RibbonBar } from "./shell/RibbonBar";
import { SessionSidebar } from "./shell/SessionSidebar";
import { StatusBar } from "./shell/StatusBar";
import { createSession, INITIAL_SESSIONS, type SessionSummary } from "./shell/sessions";
import { VIEW_LABEL, type ViewId } from "./shell/views";
import { DesignerView } from "./views/DesignerView";
import { DiagnosticsView } from "./views/DiagnosticsView";
import { HeroView } from "./views/HeroView";
import { StyleguideView } from "./views/StyleguideView";
import { useTheme } from "./theme/ThemeProvider";

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
        if (raw === null) return 260;
        const value = Number(raw);
        if (!Number.isFinite(value)) return 260;
        return Math.min(360, Math.max(200, value));
    } catch {
        return 260;
    }
}

export function App(): ReactElement {
    const { theme, toggleTheme } = useTheme();
    const bridge = window.flowharness;

    const bootReported = useRef(false);
    const dataReported = useRef(false);
    const runReported = useRef(false);

    const [view, setView] = useState<ViewId>(
        bridge.smokeMode ? "diagnostics" : "designer",
    );
    const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
    const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);

    const [sessions, setSessions] = useState<SessionSummary[]>(INITIAL_SESSIONS);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    const [config, setConfig] = useState<AppConfig | null>(null);
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [dataError, setDataError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [runSnapshot, setRunSnapshot] = useState<RunSnapshot | null>(null);

    const activeSession =
        sessions.find((session) => session.id === activeSessionId) ?? null;

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

    const createDemoWorkspace = useCallback(async () => {
        setBusy(true);
        setDataError(null);

        const created = await bridge.createWorkspace({ name: "示例工作区" });
        if (!created.ok) {
            setDataError(created.error.message);
            setBusy(false);
            return;
        }

        const opened = await bridge.openWorkspace(created.data.id);
        if (!opened.ok) {
            setDataError(opened.error.message);
        }

        await loadData();
        setBusy(false);
    }, [bridge, loadData]);

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
                    void bridge.windowClose();
                    break;
                case "k":
                    event.preventDefault();
                    window.dispatchEvent(new Event("fh:command"));
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
    }, [bridge, handleNewSession, handleToggleSidebar]);

    const main =
        view === "designer" ? (
            activeSession ? (
                <DesignerView />
            ) : (
                <HeroView
                    sessions={sessions}
                    onNewSession={handleNewSession}
                    onSelectSession={handleSelectSession}
                />
            )
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
                        activeSessionTitle={activeSession?.title ?? null}
                        theme={theme}
                        sidebarOpen={sidebarOpen}
                        busy={busy}
                        onNewSession={handleNewSession}
                        onCreateWorkspace={() => void createDemoWorkspace()}
                        onSelectView={setView}
                        onToggleSidebar={handleToggleSidebar}
                        onToggleTheme={toggleTheme}
                        onCloseWindow={() => void bridge.windowClose()}
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
                        workspacePath={config?.workspaceRoot}
                        sessionTitle={activeSession?.title ?? null}
                        viewLabel={VIEW_LABEL[view]}
                        zoom="100%"
                    />
                }
            />
        </TooltipProvider>
    );
}
