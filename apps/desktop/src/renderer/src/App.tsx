import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
// Wireclaw 以普通包依赖的方式引入；这里用于启动自检。
import { Graph } from "wireclaw";
import type {
    AppConfig,
    RunEventBatch,
    RunEventDto,
    RunSnapshot,
    WorkspaceSummary,
} from "@flowharness/contracts";
import { TooltipProvider } from "./ui";
import { AppShell } from "./shell/AppShell";
import { TopBar } from "./shell/TopBar";
import { LeftRail } from "./shell/LeftRail";
import { Inspector } from "./shell/Inspector";
import { BottomPanel } from "./shell/BottomPanel";
import { StatusBar } from "./shell/StatusBar";
import { VIEW_LABEL, type ViewId } from "./shell/views";
import { DesignerView } from "./views/DesignerView";
import { DiagnosticsView } from "./views/DiagnosticsView";
import { StyleguideView } from "./views/StyleguideView";
import { useTheme } from "./theme/ThemeProvider";

const bootGraph = new Graph([], [], {
    id: "flowharness-renderer-boot",
    title: "FlowHarness renderer boot",
});

type DataSnapshot = {
    configOk: boolean;
    config: AppConfig | null;
    workspaceCount: number;
    error: string | null;
};

export function App(): ReactElement {
    const { theme, toggleTheme } = useTheme();
    const bridge = window.flowharness;

    const bootReported = useRef(false);
    const dataReported = useRef(false);
    const runReported = useRef(false);

    const [view, setView] = useState<ViewId>(
        bridge.smokeMode ? "diagnostics" : "designer",
    );
    const [inspectorOpen, setInspectorOpen] = useState(true);
    const [panelOpen, setPanelOpen] = useState(true);

    const [config, setConfig] = useState<AppConfig | null>(null);
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [dataError, setDataError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [runEvents, setRunEvents] = useState<RunEventDto[]>([]);
    const [runSnapshot, setRunSnapshot] = useState<RunSnapshot | null>(null);

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

    const main =
        view === "designer" ? (
            <DesignerView />
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
                topBar={
                    <TopBar
                        workspaceName={
                            config?.recentWorkspaces[0]?.name ?? "未打开工作区"
                        }
                        runStatus={runSnapshot?.status ?? "idle"}
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        inspectorOpen={inspectorOpen}
                        onToggleInspector={() => setInspectorOpen((value) => !value)}
                        panelOpen={panelOpen}
                        onTogglePanel={() => setPanelOpen((value) => !value)}
                        onCreateWorkspace={() => void createDemoWorkspace()}
                        busy={busy}
                    />
                }
                rail={<LeftRail view={view} onChange={setView} />}
                main={main}
                inspector={inspectorOpen ? <Inspector view={view} /> : null}
                bottomPanel={
                    panelOpen ? (
                        <BottomPanel
                            events={runEvents}
                            snapshot={runSnapshot}
                            onCollapse={() => setPanelOpen(false)}
                        />
                    ) : null
                }
                statusBar={
                    <StatusBar
                        snapshot={runSnapshot}
                        workspacePath={config?.workspaceRoot}
                        viewLabel={VIEW_LABEL[view]}
                        zoom="100%"
                    />
                }
            />
        </TooltipProvider>
    );
}
