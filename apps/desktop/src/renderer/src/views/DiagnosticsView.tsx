import { useCallback, useEffect, useState, type ReactElement } from "react";
import type {
    AppConfig,
    RunSnapshot,
    RunStatus,
    WorkspaceSummary,
} from "@flowharness/contracts";
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
    workspaceId?: string | undefined;
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
    workspaceId,
    onRefresh,
    onCreateWorkspace,
    onRunFinished,
}: DiagnosticsViewProps): ReactElement {
    const bridge = window.flowharness;
    const [runs, setRuns] = useState<RunSnapshot[]>([]);
    const [recoveryBusy, setRecoveryBusy] = useState<string | null>(null);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);

    const loadRuns = useCallback(async (): Promise<void> => {
        if (workspaceId === undefined) {
            setRuns([]);
            return;
        }
        const result = await bridge.listRuns(workspaceId);
        if (result.ok) {
            setRuns(
                result.data.filter(
                    (run) => run.status === "paused" || run.status === "interrupted",
                ),
            );
        } else {
            setRecoveryError(result.error.message);
        }
    }, [bridge, workspaceId]);

    useEffect(() => {
        void loadRuns();
    }, [loadRuns]);

    const resume = async (run: RunSnapshot): Promise<void> => {
        if (workspaceId === undefined) return;
        setRecoveryBusy(run.runId);
        setRecoveryError(null);
        try {
            const result = await bridge.resumeInterrupted({
                workspaceId,
                runId: run.runId,
            });
            if (!result.ok) {
                setRecoveryError(result.error.message);
                return;
            }
            onRunFinished(result.data);
            await loadRuns();
        } finally {
            setRecoveryBusy(null);
        }
    };

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

                <Panel title="运行恢复">
                    {recoveryError === null ? null : (
                        <Alert tone="danger" className={styles.alert}>
                            {recoveryError}
                        </Alert>
                    )}
                    {runs.length === 0 ? (
                        <p className={styles.muted}>
                            {workspaceId === undefined
                                ? "打开工作区后可恢复暂停或中断的 run"
                                : "没有可恢复的 run"}
                        </p>
                    ) : (
                        <ul className={styles.recoveryList}>
                            {runs.map((run) => (
                                <li key={run.runId} className={styles.recoveryItem}>
                                    <span className={styles.recoveryId}>{run.runId}</span>
                                    <span className={styles.muted}>
                                        {statusLabel(run.status)}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={recoveryBusy !== null}
                                        onClick={() => void resume(run)}
                                    >
                                        {recoveryBusy === run.runId
                                            ? "恢复中…"
                                            : "恢复"}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <RunSelfTest autoStart={autoStartRun} onFinished={onRunFinished} />
            </div>
        </div>
    );
}

function statusLabel(status: RunStatus): string {
    switch (status) {
        case "paused":
            return "已暂停";
        case "interrupted":
            return "已中断";
        default:
            return status;
    }
}
