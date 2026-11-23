import type { ReactElement } from "react";
import type { AppConfig, RunSnapshot, WorkspaceSummary } from "@flowharness/contracts";
import { RunSelfTest } from "../run/RunSelfTest";
import { MetaList } from "../components/MetaList";
import { Alert, Button, Panel } from "../ui";
import styles from "./DiagnosticsView.module.css";

export type DiagnosticsViewProps = {
    config: AppConfig | null;
    workspaces: readonly WorkspaceSummary[];
    dataError: string | null;
    busy: boolean;
    autoStartRun: boolean;
    wireclaw: { loaded: boolean; graphId: string };
    onRefresh: () => void;
    onCreateWorkspace: () => void;
    onRunFinished: (snapshot: RunSnapshot) => void;
};

export function DiagnosticsView({
    config,
    workspaces,
    dataError,
    busy,
    autoStartRun,
    wireclaw,
    onRefresh,
    onCreateWorkspace,
    onRunFinished,
}: DiagnosticsViewProps): ReactElement {
    const bridge = window.flowharness;

    return (
        <div className={styles.root}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>诊断</h1>
                    <p className={styles.subtitle}>运行时、Wireclaw 与数据层的自检</p>
                </div>
                <Button size="sm" onClick={onRefresh} disabled={busy}>
                    刷新
                </Button>
            </header>

            <div className={styles.grid}>
                <Panel title="运行时">
                    <MetaList
                        rows={[
                            ["Electron", bridge.versions.electron],
                            ["Node", bridge.versions.node],
                            ["Chromium", bridge.versions.chrome],
                            ["平台", bridge.platform],
                            ["UI", "React 19"],
                        ]}
                    />
                </Panel>

                <Panel title="Wireclaw">
                    <MetaList
                        rows={[
                            ["引入方式", 'import { Graph } from "wireclaw"'],
                            ["Graph 类", wireclaw.loaded ? "已加载" : "缺失"],
                            ["Graph id", wireclaw.graphId],
                            ["引擎", "wireclaw@0.1.1"],
                        ]}
                    />
                </Panel>

                <Panel
                    title="数据层"
                    actions={
                        <Button size="sm" variant="ghost" onClick={onRefresh} disabled={busy}>
                            刷新
                        </Button>
                    }
                >
                    <MetaList
                        rows={[
                            ["工作区根目录", config?.workspaceRoot ?? "加载中…"],
                            ["工作区数量", String(workspaces.length)],
                            ["主题配置", config?.theme ?? "加载中…"],
                        ]}
                    />
                    <div className={styles.actions}>
                        <Button
                            size="sm"
                            variant="primary"
                            onClick={onCreateWorkspace}
                            disabled={busy}
                        >
                            {busy ? "处理中…" : "新建示例工作区"}
                        </Button>
                    </div>
                    {dataError ? (
                        <Alert tone="danger" className={styles.alert}>
                            {dataError}
                        </Alert>
                    ) : null}
                </Panel>

                <RunSelfTest autoStart={autoStartRun} onFinished={onRunFinished} />
            </div>
        </div>
    );
}
