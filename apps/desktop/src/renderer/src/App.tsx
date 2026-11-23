import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
// Wireclaw 以普通包依赖的方式引入；这里用于自检链路是否打通。
import { Graph } from "wireclaw";
import type { AppConfig, WorkspaceSummary } from "@flowharness/contracts";
import { useTheme } from "./theme/ThemeProvider";

const bootGraph = new Graph([], [], {
    id: "flowharness-renderer-boot",
    title: "FlowHarness renderer boot",
});

type MetaRow = readonly [label: string, value: string];

type DataSnapshot = {
    configOk: boolean;
    workspacesOk: boolean;
    config: AppConfig | null;
    workspaceCount: number;
    error: string | null;
};

function MetaList({ rows }: { rows: ReadonlyArray<MetaRow> }): ReactElement {
    return (
        <dl className="meta-list">
            {rows.map(([label, value]) => (
                <div key={label} className="meta-list__row">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

export function App(): ReactElement {
    const { theme, toggleTheme } = useTheme();
    const bridge = window.flowharness;
    const bootReported = useRef(false);
    const dataReported = useRef(false);

    const [config, setConfig] = useState<AppConfig | null>(null);
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [dataError, setDataError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

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
            workspacesOk: workspacesResult.ok,
            config: configResult.ok ? configResult.data : null,
            workspaceCount: workspacesResult.ok ? workspacesResult.data.length : -1,
            error,
        };
    }, [bridge]);

    // 首次数据层往返完成后上报，smoke 用它确认 config/workspace IPC 真的通了。
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
                    workspacesLoaded: snapshot.workspacesOk,
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

    const runtimeRows: MetaRow[] = [
        ["Electron", bridge.versions.electron],
        ["Node", bridge.versions.node],
        ["Chromium", bridge.versions.chrome],
        ["平台", bridge.platform],
        ["UI", "React 19"],
    ];

    const wireclawRows: MetaRow[] = [
        ["引入方式", 'import { Graph } from "wireclaw"'],
        ["Graph 类", typeof Graph === "function" ? "已加载" : "缺失"],
        ["Graph id", bootGraph.id],
        ["节点 / 边", `${bootGraph.nodes.length} / ${bootGraph.edges.length}`],
    ];

    const dataRows: MetaRow[] = [
        ["工作区根目录", config?.workspaceRoot ?? "加载中…"],
        ["工作区数量", String(workspaces.length)],
        ["主题配置", config?.theme ?? "加载中…"],
    ];

    return (
        <main className="app">
            <header className="app__header">
                <div>
                    <p className="app__eyebrow">Agent Workbench</p>
                    <h1 className="app__title">FlowHarness</h1>
                    <p className="app__subtitle">开发环境自检 · Phase 1</p>
                </div>
                <button
                    type="button"
                    className="theme-toggle"
                    onClick={toggleTheme}
                    aria-label={theme === "dark" ? "切换到亮色主题" : "切换到暗色主题"}
                >
                    <span className="theme-toggle__icon" aria-hidden="true">
                        {theme === "dark" ? "☾" : "☀"}
                    </span>
                    {theme === "dark" ? "暗色" : "亮色"}
                </button>
            </header>

            <section className="grid">
                <article className="card">
                    <h2 className="card__title">运行时</h2>
                    <MetaList rows={runtimeRows} />
                </article>

                <article className="card">
                    <h2 className="card__title">Wireclaw</h2>
                    <MetaList rows={wireclawRows} />
                </article>

                <article className="card">
                    <h2 className="card__title">数据层</h2>
                    <MetaList rows={dataRows} />
                    <div className="card__actions">
                        <button
                            type="button"
                            className="button"
                            onClick={() => void loadData()}
                            disabled={busy}
                        >
                            刷新
                        </button>
                        <button
                            type="button"
                            className="button button--primary"
                            onClick={() => void createDemoWorkspace()}
                            disabled={busy}
                        >
                            {busy ? "处理中…" : "新建示例工作区"}
                        </button>
                    </div>
                    {dataError ? <p className="card__error">{dataError}</p> : null}
                </article>
            </section>

            <footer className="status">
                <span className="status__dot" aria-hidden="true" />
                开发环境就绪：Electron ↔ Wireclaw ↔ React 已联通
            </footer>
        </main>
    );
}
