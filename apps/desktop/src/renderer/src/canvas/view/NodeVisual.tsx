import type { ReactElement } from "react";
import { Box, GitBranch, LogIn, LogOut, ScrollText, Sparkles } from "lucide-react";
import { StatusDot, type StatusTone } from "../../ui";
import { cx } from "../../ui/cx";
import type { CanvasStatus } from "../core/types";
import styles from "./NodeVisual.module.css";

export type NodeVisualProps = {
    id?: string;
    title: string;
    kind: string;
    status: CanvasStatus;
    summary?: string;
    meta?: string;
    selected?: boolean;
    inputs?: number;
    outputs?: number;
    className?: string;
};

const ICONS = {
    input: LogIn,
    output: LogOut,
    model: Sparkles,
    branch: GitBranch,
    log: ScrollText,
    default: Box,
} as const;

function iconFor(kind: string): (typeof ICONS)[keyof typeof ICONS] {
    if (kind.includes("input")) return ICONS.input;
    if (kind.includes("output")) return ICONS.output;
    if (kind.includes("model")) return ICONS.model;
    if (kind.includes("branch") || kind.includes("choice")) return ICONS.branch;
    if (kind.includes("log")) return ICONS.log;
    return ICONS.default;
}

const STATUS_LABEL: Record<CanvasStatus, string> = {
    idle: "未运行",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    skipped: "已跳过",
};

/** 与 React Flow 解耦的节点外观，Styleguide 与真实画布共用。 */
export function NodeVisual({
    id,
    title,
    kind,
    status,
    summary,
    meta,
    selected = false,
    inputs = 0,
    outputs = 0,
    className,
}: NodeVisualProps): ReactElement {
    const Icon = iconFor(kind);
    const portLabel = [
        inputs > 0 ? `IN ${inputs}` : null,
        outputs > 0 ? `OUT ${outputs}` : null,
    ]
        .filter((part): part is string => part !== null)
        .join(" / ");

    return (
        <article
            className={cx(styles.node, styles[status], selected && styles.selected, className)}
            data-status={status}
        >
            <div className={styles.frame}>
                <div className={styles.inner}>
                    <header className={styles.header}>
                        <Icon size={14} className={styles.icon} aria-hidden="true" />
                        <span className={styles.title}>{title}</span>
                        <StatusDot
                            tone={status as StatusTone}
                            pulse={status === "running"}
                            label={STATUS_LABEL[status]}
                        />
                    </header>

                    <div className={styles.body}>
                        <span className={styles.kind}>{kind}</span>
                        {summary ? <span className={styles.summary}>{summary}</span> : null}
                    </div>

                    <footer className={styles.footer}>
                        <span className={styles.meta}>{meta ?? kind.split(".")[1]}</span>
                        <span className={styles.ports}>{portLabel}</span>
                        {id ? <span className={styles.id}>ID {id}</span> : null}
                    </footer>
                </div>
            </div>
        </article>
    );
}
