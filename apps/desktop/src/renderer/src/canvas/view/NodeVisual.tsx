import { useEffect, useState, type ReactElement } from "react";
import {
    Box,
    Check,
    GitBranch,
    LogIn,
    LogOut,
    Pencil,
    ScrollText,
    Sparkles,
    TriangleAlert,
} from "lucide-react";
import { StatusDot, type StatusTone } from "../../ui";
import { cx } from "../../ui/cx";
import type {
    CanvasFieldOption,
    CanvasNodeNotice,
    CanvasPort,
    CanvasStatus,
} from "../core/types";
import { InlineNodeConfig } from "./InlineNodeConfig";
import styles from "./NodeVisual.module.css";

export type NodeVisualProps = {
    title: string;
    kind: string;
    status: CanvasStatus;
    summary?: string;
    selected?: boolean;
    className?: string;
    /** 节点内联编辑使用；Styleguide 等静态样张不传。 */
    config?: unknown;
    readOnly?: boolean;
    onUpdateConfig?: (config: unknown) => void;
    /** 输入端口槽；提供后可在节点 Body 内直接作为连线落点。 */
    inputs?: readonly CanvasPort[];
    showInputSlots?: boolean;
    /** 端口较多的节点需要最小高度，避免 Handle 挤在 header 里。 */
    minHeight?: number;
    /** Provider / 配置健康提示；显示在标题右侧，不改变节点尺寸。 */
    notice?: CanvasNodeNotice;
    /** 内联字段下拉；目前用于 core.provider 的 providerId。 */
    fieldOptions?: Readonly<Record<string, readonly CanvasFieldOption[]>>;
    /** 被连接固定、不可编辑的字段及原因。 */
    lockedFields?: Readonly<Record<string, string>>;
    /** 已连接输入端口在节点内的显示值；缺省显示端口名。 */
    slotLabels?: Readonly<Record<string, string>>;
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

/**
 * 节点外观：HeaderBar + Body 双层，无 Footer、无半透明。
 * 与 React Flow 解耦，Styleguide 与真实画布共用。
 */
export function NodeVisual({
    title,
    kind,
    status,
    summary,
    selected = false,
    className,
    config,
    readOnly = false,
    onUpdateConfig,
    inputs = [],
    showInputSlots = false,
    minHeight,
    notice,
    fieldOptions,
    lockedFields,
    slotLabels,
}: NodeVisualProps): ReactElement {
    const Icon = iconFor(kind);
    const canEditConstant = kind === "core.constant" && onUpdateConfig !== undefined;
    const [constantEditing, setConstantEditing] = useState(false);

    useEffect(() => {
        if (readOnly) setConstantEditing(false);
    }, [readOnly]);

    return (
        <article
            className={cx(styles.node, styles[status], selected && styles.selected, className)}
            data-status={status}
            style={minHeight === undefined ? undefined : { minHeight }}
        >
            <header className={styles.header}>
                <Icon size={15} className={styles.icon} aria-hidden="true" />
                <span className={styles.title}>{title}</span>
                {notice === undefined ? null : (
                    <span
                        className={cx(
                            styles.notice,
                            notice.severity === "danger"
                                ? styles.noticeDanger
                                : styles.noticeWarning,
                        )}
                        title={notice.message}
                        aria-label={notice.message}
                    >
                        <TriangleAlert size={13} aria-hidden="true" />
                    </span>
                )}
                {canEditConstant ? (
                    <button
                        type="button"
                        className={cx(
                            styles.headerAction,
                            "nodrag",
                            constantEditing && styles.headerActionActive,
                        )}
                        aria-label={constantEditing ? "退出常量编辑" : "编辑常量文本"}
                        aria-pressed={constantEditing}
                        title={constantEditing ? "退出编辑" : "编辑常量文本"}
                        disabled={readOnly}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => setConstantEditing((current) => !current)}
                    >
                        {constantEditing ? (
                            <Check size={12} aria-hidden="true" />
                        ) : (
                            <Pencil size={12} aria-hidden="true" />
                        )}
                    </button>
                ) : null}
                <StatusDot
                    tone={status as StatusTone}
                    pulse={status === "running"}
                    label={STATUS_LABEL[status]}
                />
            </header>

            <div className={styles.body}>
                <span className={styles.kind}>{kind}</span>
                <InlineNodeConfig
                    kind={kind}
                    config={config}
                    summary={summary}
                    readOnly={readOnly}
                    onChange={onUpdateConfig}
                    fieldOptions={fieldOptions}
                    lockedFields={lockedFields}
                    editing={constantEditing && !readOnly}
                />

                {showInputSlots && inputs.length > 0 ? (
                    <div className={styles.slots}>
                        {inputs.map((port) => {
                            const label = slotLabels?.[port.name];
                            return (
                                <div
                                    key={port.name}
                                    className={cx(
                                        styles.slot,
                                        label !== undefined && styles.slotConnected,
                                        readOnly && styles.slotReadOnly,
                                    )}
                                    data-input-port={port.name}
                                    title={
                                        readOnly
                                            ? `输入端口 ${port.name}`
                                            : `拖拽连线到输入端口 ${port.name}`
                                    }
                                >
                                    <span className={styles.slotDot} aria-hidden="true" />
                                    <span className={styles.slotName}>
                                        {label ?? port.name}
                                    </span>
                                    <span className={styles.slotType}>{port.type}</span>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </article>
    );
}
