import type { ReactElement } from "react";
import type { RunSnapshot } from "@flowharness/contracts";
import { StatusDot } from "../ui";
import { RUN_STATUS_LABEL, RUN_STATUS_TONE } from "./labels";
import styles from "./StatusBar.module.css";

export type SaveStatus = "saved" | "saving" | "conflict" | "error";

const SAVE_LABEL: Record<SaveStatus, string> = {
    saved: "已保存",
    saving: "保存中…",
    conflict: "保存冲突",
    error: "保存失败",
};

export type StatusBarProps = {
    snapshot: RunSnapshot | null;
    workspacePath?: string;
    sessionTitle?: string | null;
    viewLabel: string;
    zoom: string;
    saveStatus?: SaveStatus | null;
};

export function StatusBar({
    snapshot,
    workspacePath,
    sessionTitle,
    viewLabel,
    zoom,
    saveStatus,
}: StatusBarProps): ReactElement {
    const status = snapshot?.status ?? "idle";

    return (
        <footer className={styles.bar}>
            <div className={styles.left}>
                <StatusDot tone={RUN_STATUS_TONE[status]} pulse={status === "running"} />
                <span>{RUN_STATUS_LABEL[status]}</span>
                {snapshot ? <span className={styles.runId}>{snapshot.runId}</span> : null}
                {sessionTitle ? (
                    <>
                        <span className={styles.sep} aria-hidden="true" />
                        <span className={styles.session}>{sessionTitle}</span>
                    </>
                ) : null}
            </div>

            <div className={styles.right}>
                {saveStatus ? (
                    <>
                        <span className={styles.save} data-state={saveStatus}>
                            {SAVE_LABEL[saveStatus]}
                        </span>
                        <span className={styles.sep} aria-hidden="true" />
                    </>
                ) : null}
                <span className={styles.path} title={workspacePath}>
                    {workspacePath ?? "未配置工作区"}
                </span>
                <span className={styles.sep} aria-hidden="true" />
                <span>{viewLabel}</span>
                <span className={styles.sep} aria-hidden="true" />
                <span className={styles.zoom}>缩放 {zoom}</span>
            </div>
        </footer>
    );
}
