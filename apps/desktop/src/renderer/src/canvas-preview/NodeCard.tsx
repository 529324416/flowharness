import type { CSSProperties, ReactElement } from "react";
import { Box, GitBranch, LogIn, LogOut, ScrollText, Sparkles } from "lucide-react";
import { StatusDot, type StatusTone } from "../ui";
import { cx } from "../ui/cx";
import styles from "./NodeCard.module.css";

export type NodeCardProps = {
    title: string;
    kind: string;
    status: StatusTone;
    summary?: string;
    selected?: boolean;
    inputs?: readonly number[];
    outputs?: readonly number[];
    style?: CSSProperties;
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

const STATUS_LABEL: Record<StatusTone, string> = {
    idle: "未运行",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    interrupted: "已中断",
    skipped: "已跳过",
};

/** 画布节点的静态视觉样张；Phase 3 由 React 组件按同一结构渲染。 */
export function NodeCard({
    title,
    kind,
    status,
    summary,
    selected = false,
    inputs = [],
    outputs = [],
    style,
    className,
}: NodeCardProps): ReactElement {
    const Icon = iconFor(kind);

    return (
        <div
            className={cx(styles.node, styles[status], selected && styles.selected, className)}
            style={style}
            data-status={status}
        >
            <header className={styles.header}>
                <Icon size={14} className={styles.icon} aria-hidden="true" />
                <span className={styles.title}>{title}</span>
                <StatusDot tone={status} pulse={status === "running"} label={STATUS_LABEL[status]} />
            </header>

            <div className={styles.body}>
                <span className={styles.kind}>{kind}</span>
                {summary ? <span className={styles.summary}>{summary}</span> : null}
            </div>

            {inputs.map((offset) => (
                <span
                    key={`in-${offset}`}
                    className={cx(styles.port, styles.portIn)}
                    style={{ top: offset - 5 }}
                    aria-hidden="true"
                />
            ))}

            {outputs.map((offset) => (
                <span
                    key={`out-${offset}`}
                    className={cx(styles.port, styles.portOut)}
                    style={{ top: offset - 5 }}
                    aria-hidden="true"
                />
            ))}
        </div>
    );
}
