import { useEffect, useState, type ReactElement } from "react";
import {
    Bot,
    BotMessageSquare,
    Box,
    Check,
    ChevronsDown,
    ChevronsUp,
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
    CanvasLockedField,
    CanvasNodeNotice,
    CanvasPort,
    CanvasStatus,
} from "../core/types";
import { InlineNodeConfig, inlineInputPorts } from "./InlineNodeConfig";
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
    /** 输出端口数据；显示在 Body 顶部（优先级高于输入）。 */
    outputs?: readonly CanvasPort[];
    showInputSlots?: boolean;
    /** 端口较多的节点需要最小高度，避免 Handle 挤在 header 里。 */
    minHeight?: number;
    /** Provider / 配置健康提示；显示在标题右侧，不改变节点尺寸。 */
    notice?: CanvasNodeNotice;
    /** 内联字段下拉；目前用于 core.provider 的 providerId。 */
    fieldOptions?: Readonly<Record<string, readonly CanvasFieldOption[]>>;
    /** 被连接固定、不可编辑的字段及其来源值。 */
    lockedFields?: Readonly<Record<string, CanvasLockedField>>;
    /** 已连接输入端口在节点内的显示值；缺省显示端口名。 */
    slotLabels?: Readonly<Record<string, string>>;
    /** 折叠态：只显示已连接端口与有数据的字段。 */
    collapsed?: boolean;
    /** 折叠态需要保留的 config 字段；展开时不使用。 */
    collapsedFields?: readonly string[];
    /** 完成瞬间的冷却动画：边框从过热色渐变回默认色。 */
    cooling?: boolean;
    /** 折叠 / 展开切换；缺省不渲染按钮（例如 Styleguide 静态样张）。 */
    onToggleCollapsed?: (collapsed: boolean) => void;
    /** 已连接端口：徽标由方块切换为圆点。 */
    connectedPorts?: {
        inputs: readonly string[];
        outputs: readonly string[];
    };
};

const ICONS = {
    input: LogIn,
    output: LogOut,
    model: Sparkles,
    modelCall: BotMessageSquare,
    agent: Bot,
    branch: GitBranch,
    log: ScrollText,
    default: Box,
} as const;

function iconFor(kind: string): (typeof ICONS)[keyof typeof ICONS] {
    if (kind.includes("agent")) return ICONS.agent;
    if (kind.includes("model.call")) return ICONS.modelCall;
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
    outputs = [],
    showInputSlots = false,
    minHeight,
    notice,
    fieldOptions,
    lockedFields,
    slotLabels,
    collapsed = false,
    collapsedFields,
    cooling = false,
    onToggleCollapsed,
    connectedPorts,
}: NodeVisualProps): ReactElement {
    const Icon = iconFor(kind);
    const canEditConstant =
        kind === "core.constant" &&
        onUpdateConfig !== undefined &&
        !collapsed;
    const [constantEditing, setConstantEditing] = useState(false);
    const attachedInputs = new Set(inlineInputPorts(kind));
    const dataInputs = inputs.filter((port) => !attachedInputs.has(port.name));
    const connectedInputSet = new Set(connectedPorts?.inputs ?? []);

    useEffect(() => {
        if (readOnly) setConstantEditing(false);
    }, [readOnly]);

    return (
        <article
            className={cx(
                styles.node,
                styles[status],
                selected && styles.selected,
                cooling && styles.cooling,
                className,
            )}
            data-status={status}
            data-cooling={cooling ? "true" : undefined}
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
                {onToggleCollapsed === undefined ? null : (
                    <button
                        type="button"
                        className={cx(
                            styles.headerAction,
                            "nodrag",
                            collapsed && styles.headerActionActive,
                        )}
                        aria-label={collapsed ? "展开节点" : "折叠节点"}
                        aria-pressed={collapsed}
                        title={collapsed ? "展开节点" : "折叠节点（只保留已连接与有数据的字段）"}
                        disabled={readOnly}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => onToggleCollapsed(!collapsed)}
                    >
                        {collapsed ? (
                            <ChevronsDown size={13} aria-hidden="true" />
                        ) : (
                            <ChevronsUp size={13} aria-hidden="true" />
                        )}
                    </button>
                )}
                <StatusDot
                    tone={status as StatusTone}
                    pulse={status === "running"}
                    label={STATUS_LABEL[status]}
                />
            </header>

            <div className={styles.body}>
                {collapsed ? null : <span className={styles.kind}>{kind}</span>}

                {showInputSlots && (outputs.length > 0 || dataInputs.length > 0) ? (
                    <div className={styles.dataSection}>
                        {outputs.map((port) => (
                            <div
                                key={`out:${port.name}`}
                                className={cx(styles.dataRow, styles.dataOutput)}
                                data-port-anchor={`out:${port.name}`}
                            >
                                <span className={styles.dataName}>
                                    {port.name}
                                </span>
                                <span className={styles.dataMeta}>
                                    {port.type}
                                </span>
                            </div>
                        ))}
                        {dataInputs.map((port) => {
                            const connected = connectedInputSet.has(port.name);
                            const label = slotLabels?.[port.name];
                            return (
                                <div
                                    key={`in:${port.name}`}
                                    className={cx(
                                        styles.dataRow,
                                        styles.dataInput,
                                        connected && styles.dataConnected,
                                    )}
                                    data-port-anchor={`in:${port.name}`}
                                    data-input-port={port.name}
                                >
                                    <span className={styles.dataName}>
                                        {port.name}
                                    </span>
                                    <span className={styles.dataMeta}>
                                        {connected
                                            ? (label ?? "已连接")
                                            : port.type}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : null}

                <InlineNodeConfig
                    kind={kind}
                    config={config}
                    summary={summary}
                    readOnly={readOnly}
                    onChange={onUpdateConfig}
                    fieldOptions={fieldOptions}
                    lockedFields={lockedFields}
                    editing={constantEditing && !readOnly && !collapsed}
                    collapsed={collapsed}
                    collapsedFields={collapsedFields}
                />
            </div>
        </article>
    );
}
