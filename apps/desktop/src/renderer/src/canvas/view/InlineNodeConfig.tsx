import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactElement,
} from "react";
import type { CanvasFieldOption } from "../core/types";
import { Select, Tooltip } from "../../ui";
import {
    CONSTANT_PREVIEW_LIMIT,
    CONSTANT_TOOLTIP_LIMIT,
    truncateText,
} from "./constant-text";
import styles from "./InlineNodeConfig.module.css";

/** 常量编辑模式的 TextArea 高度上限（px）。 */
const CONSTANT_EDIT_MAX_HEIGHT = 180;

export type InlineNodeConfigProps = {
    kind: string;
    config: unknown;
    summary?: string;
    readOnly?: boolean;
    onChange?: (config: unknown) => void;
    /** 运行时注入的字段下拉（目前用于 core.provider 的 providerId）。 */
    fieldOptions?: Readonly<Record<string, readonly CanvasFieldOption[]>>;
    /** 被连接固定、不可编辑的字段及原因。 */
    lockedFields?: Readonly<Record<string, string>>;
    /** core.constant 是否处于正文编辑模式（由节点标题栏按钮切换）。 */
    editing?: boolean;
};

/**
 * 节点内联编辑：高频节点的常用参数直接在节点 Body 上修改。
 *
 * 只读期间（运行 / 冲突）仍然渲染同一套控件并禁用，而不是退化成摘要：
 * 节点高度与端口结构保持不变，运行开始不会让画布布局跳动。
 */
export function InlineNodeConfig({
    kind,
    config,
    summary,
    readOnly = false,
    onChange,
    fieldOptions,
    lockedFields,
    editing = false,
}: InlineNodeConfigProps): ReactElement {
    if (onChange === undefined) {
        return <>{summary ? <span className={styles.summary}>{summary}</span> : null}</>;
    }

    if (kind === "core.constant") {
        return (
            <ConstantInline
                config={config}
                readOnly={readOnly}
                editing={editing}
                onChange={onChange}
            />
        );
    }

    if (kind === "core.provider") {
        const providerId =
            isRecord(config) && typeof config.providerId === "string"
                ? config.providerId
                : "";
        const options = [
            { value: "", label: "未选择 Provider" },
            ...(fieldOptions?.providerId ?? []),
        ];
        return (
            <div className={styles.row}>
                <Select
                    className={`${styles.providerSelect} nodrag nowheel`}
                    value={providerId}
                    options={options}
                    disabled={readOnly}
                    aria-label="Provider"
                    placeholder="未选择 Provider"
                    onChange={(next) => {
                        const configNext: Record<string, unknown> = {
                            ...(isRecord(config) ? config : {}),
                        };
                        if (next === "") {
                            delete configNext.providerId;
                        } else {
                            configNext.providerId = next;
                        }
                        onChange(configNext);
                    }}
                />
            </div>
        );
    }

    if (kind === "core.model") {
        const providerId =
            isRecord(config) && typeof config.providerId === "string"
                ? config.providerId
                : "";
        const modelId =
            isRecord(config) && typeof config.modelId === "string"
                ? config.modelId
                : "";
        const providerLocked = lockedFields?.providerId !== undefined;
        return (
            <div className={styles.stack}>
                <Select
                    className={`${styles.providerSelect} nodrag nowheel`}
                    value={providerId}
                    options={[
                        { value: "", label: "未选择 Provider" },
                        ...(fieldOptions?.providerId ?? []),
                    ]}
                    disabled={readOnly || providerLocked}
                    aria-label="Model Provider"
                    placeholder="未选择 Provider"
                    onChange={(next) => {
                        const configNext: Record<string, unknown> = {
                            ...(isRecord(config) ? config : {}),
                        };
                        if (next === "") delete configNext.providerId;
                        else configNext.providerId = next;
                        onChange(configNext);
                    }}
                />
                <Select
                    className={`${styles.providerSelect} nodrag nowheel`}
                    value={modelId}
                    options={[
                        { value: "", label: "未选择模型" },
                        ...(fieldOptions?.modelId ?? []),
                    ]}
                    disabled={readOnly}
                    aria-label="Model ID"
                    placeholder="未选择模型"
                    onChange={(next) => {
                        const configNext: Record<string, unknown> = {
                            ...(isRecord(config) ? config : {}),
                        };
                        if (next === "") delete configNext.modelId;
                        else configNext.modelId = next;
                        onChange(configNext);
                    }}
                />
            </div>
        );
    }

    if (kind === "core.model.call") {
        const mode = isRecord(config) && typeof config.mode === "string"
            ? config.mode
            : "chat";
        const temperature =
            isRecord(config) && typeof config.temperature === "number"
                ? config.temperature
                : undefined;
        const system =
            isRecord(config) && typeof config.system === "string"
                ? config.system
                : "";
        const think = isRecord(config) && config.think === true;
        const thinkingLv = isRecord(config) ? config.thinkingLv : undefined;
        const modality =
            isRecord(config) && typeof config.modality === "string"
                ? config.modality
                : "image";
        const parameters = isRecord(config) ? config.parameters : undefined;
        return (
            <div className={styles.stack}>
                <div className={styles.row}>
                    <select
                        className={`${styles.select} nodrag nowheel`}
                        value={mode}
                        disabled={readOnly}
                        aria-label="模型调用模式"
                        onChange={(event) =>
                            onChange(writeConfig(config, { mode: event.target.value }))
                        }
                        onKeyDown={(event) => event.stopPropagation()}
                    >
                        <option value="chat">chat</option>
                        <option value="generate">generate</option>
                    </select>
                    <input
                        className={`${styles.number} nodrag nowheel`}
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature ?? ""}
                        disabled={readOnly}
                        aria-label="Temperature"
                        placeholder="temp"
                        onChange={(event) => {
                            const parsed = Number(event.target.value);
                            onChange(
                                writeConfig(config, {
                                    temperature:
                                        event.target.value === "" ||
                                        !Number.isFinite(parsed)
                                            ? undefined
                                            : parsed,
                                }),
                            );
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                    />
                </div>
                <TextareaInline
                    value={system}
                    ariaLabel="System Prompt"
                    placeholder="System Prompt"
                    disabled={readOnly}
                    onChange={(next) =>
                        onChange(writeConfig(config, { system: next }))
                    }
                />
                <div className={styles.row}>
                    <CheckInline
                        label="思考"
                        checked={think}
                        disabled={readOnly}
                        onChange={(checked) => onChange(writeConfig(config, { think: checked }))}
                    />
                    <input
                        className={`${styles.input} nodrag nowheel`}
                        value={formatThinkingLevel(thinkingLv)}
                        disabled={readOnly}
                        aria-label="思考强度"
                        placeholder="think lv"
                        onChange={(event) =>
                            onChange(
                                writeConfig(config, {
                                    thinkingLv: parseThinkingLevel(event.target.value),
                                }),
                            )
                        }
                        onKeyDown={(event) => event.stopPropagation()}
                    />
                </div>
                <select
                    className={`${styles.select} nodrag nowheel`}
                    value={modality}
                    disabled={readOnly}
                    aria-label="生成模态"
                    onChange={(event) =>
                        onChange(writeConfig(config, { modality: event.target.value }))
                    }
                    onKeyDown={(event) => event.stopPropagation()}
                >
                    <option value="image">image</option>
                    <option value="audio">audio</option>
                    <option value="video">video</option>
                </select>
                <JsonInline
                    value={parameters}
                    ariaLabel="生成参数"
                    placeholder="{ } 生成参数"
                    rows={2}
                    disabled={readOnly}
                    onChange={(next) => onChange(writeConfig(config, { parameters: next }))}
                />
            </div>
        );
    }

    if (kind === "core.value") {
        const name = isRecord(config) && typeof config.name === "string"
            ? config.name
            : "value";
        const required = isRecord(config) ? config.required !== false : true;
        return (
            <div className={styles.row}>
                <input
                    className={`${styles.input} nodrag nowheel`}
                    value={name}
                    disabled={readOnly}
                    aria-label="参数名"
                    placeholder="参数名"
                    onChange={(event) =>
                        onChange({
                            ...(isRecord(config) ? config : {}),
                            name: event.target.value,
                        })
                    }
                    onKeyDown={(event) => event.stopPropagation()}
                />
                <label className={styles.check}>
                    <input
                        type="checkbox"
                        className="nodrag"
                        checked={required}
                        disabled={readOnly}
                        aria-label="必填"
                        onChange={(event) =>
                            onChange({
                                ...(isRecord(config) ? config : {}),
                                required: event.target.checked,
                            })
                        }
                    />
                    必填
                </label>
            </div>
        );
    }

    if (kind === "core.agent.run") {
        const permission =
            isRecord(config) && typeof config.permission === "string"
                ? config.permission
                : "readonly";
        const maxSteps =
            isRecord(config) && typeof config.maxSteps === "number"
                ? config.maxSteps
                : 8;
        const system =
            isRecord(config) && typeof config.system === "string"
                ? config.system
                : "";
        const think = isRecord(config) && config.think === true;
        const thinkingLv = isRecord(config) ? config.thinkingLv : undefined;
        const temperature =
            isRecord(config) && typeof config.temperature === "number"
                ? config.temperature
                : undefined;
        const hostTools = isRecord(config) ? config.hostTools : undefined;
        return (
            <div className={styles.stack}>
                <div className={styles.row}>
                    <select
                        className={`${styles.select} nodrag nowheel`}
                        value={permission}
                        disabled={readOnly}
                        aria-label="Agent 权限"
                        onChange={(event) =>
                            onChange(
                                writeConfig(config, {
                                    permission: event.target.value,
                                }),
                            )
                        }
                        onKeyDown={(event) => event.stopPropagation()}
                    >
                        <option value="readonly">readonly</option>
                        <option value="approval">approval</option>
                        <option value="full">full</option>
                    </select>
                    <input
                        className={`${styles.number} nodrag nowheel`}
                        type="number"
                        min={1}
                        step={1}
                        value={maxSteps}
                        disabled={readOnly}
                        aria-label="最大步数"
                        onChange={(event) => {
                            const parsed = Number(event.target.value);
                            if (!Number.isFinite(parsed) || parsed < 1) return;
                            onChange(
                                writeConfig(config, {
                                    maxSteps: Math.floor(parsed),
                                }),
                            );
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                    />
                </div>
                <TextareaInline
                    value={system}
                    ariaLabel="System Prompt"
                    placeholder="System Prompt"
                    disabled={readOnly}
                    onChange={(next) =>
                        onChange(writeConfig(config, { system: next }))
                    }
                />
                <div className={styles.row}>
                    <CheckInline
                        label="思考"
                        checked={think}
                        disabled={readOnly}
                        onChange={(checked) =>
                            onChange(writeConfig(config, { think: checked }))
                        }
                    />
                    <input
                        className={`${styles.input} nodrag nowheel`}
                        value={formatThinkingLevel(thinkingLv)}
                        disabled={readOnly}
                        aria-label="思考强度"
                        placeholder="think lv"
                        onChange={(event) =>
                            onChange(
                                writeConfig(config, {
                                    thinkingLv: parseThinkingLevel(event.target.value),
                                }),
                            )
                        }
                        onKeyDown={(event) => event.stopPropagation()}
                    />
                </div>
                <input
                    className={`${styles.number} nodrag nowheel`}
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature ?? ""}
                    disabled={readOnly}
                    aria-label="Temperature"
                    placeholder="temp"
                    onChange={(event) => {
                        const parsed = Number(event.target.value);
                        onChange(
                            writeConfig(config, {
                                temperature:
                                    event.target.value === "" ||
                                    !Number.isFinite(parsed)
                                        ? undefined
                                        : parsed,
                            }),
                        );
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                />
                <JsonInline
                    value={hostTools}
                    ariaLabel="宿主工具"
                    placeholder="{ } host tools"
                    rows={2}
                    disabled={readOnly}
                    onChange={(next) => onChange(writeConfig(config, { hostTools: next }))}
                />
            </div>
        );
    }

    if (kind === "core.loop") {
        const maxIterations =
            isRecord(config) && typeof config.maxIterations === "number"
                ? config.maxIterations
                : 3;
        const retryOnError =
            isRecord(config) && config.retryOnError === true;
        const graph = isRecord(config) ? config.graph : undefined;
        return (
            <div className={styles.stack}>
                <div className={styles.row}>
                    <input
                        className={`${styles.number} nodrag nowheel`}
                        type="number"
                        min={1}
                        step={1}
                        value={maxIterations}
                        disabled={readOnly}
                        aria-label="最大迭代"
                        onChange={(event) => {
                            const parsed = Number(event.target.value);
                            if (!Number.isFinite(parsed) || parsed < 1) return;
                            onChange(
                                writeConfig(config, {
                                    maxIterations: Math.floor(parsed),
                                }),
                            );
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                    />
                    <CheckInline
                        label="失败重试"
                        checked={retryOnError}
                        disabled={readOnly}
                        onChange={(checked) =>
                            onChange(
                                writeConfig(config, { retryOnError: checked }),
                            )
                        }
                    />
                </div>
                <JsonInline
                    value={graph}
                    ariaLabel="内嵌图"
                    placeholder="{ } graph"
                    rows={3}
                    disabled={readOnly}
                    onChange={(next) => onChange(writeConfig(config, { graph: next }))}
                />
            </div>
        );
    }

    if (kind === "core.foreach") {
        const resultPort =
            isRecord(config) && typeof config.resultPort === "string"
                ? config.resultPort
                : "text";
        const graph = isRecord(config) ? config.graph : undefined;
        return (
            <div className={styles.stack}>
                <input
                    className={`${styles.input} nodrag nowheel`}
                    value={resultPort}
                    disabled={readOnly}
                    aria-label="结果端口"
                    placeholder="text"
                    onChange={(event) =>
                        onChange(
                            writeConfig(config, {
                                resultPort: event.target.value,
                            }),
                        )
                    }
                    onKeyDown={(event) => event.stopPropagation()}
                />
                <JsonInline
                    value={graph}
                    ariaLabel="内嵌图"
                    placeholder="{ } graph"
                    rows={3}
                    disabled={readOnly}
                    onChange={(next) => onChange(writeConfig(config, { graph: next }))}
                />
            </div>
        );
    }

    if (kind === "core.subgraph") {
        const graph = isRecord(config) ? config.graph : undefined;
        return (
            <JsonInline
                value={graph}
                ariaLabel="内嵌图"
                placeholder="{ } graph"
                rows={3}
                disabled={readOnly}
                onChange={(next) => onChange(writeConfig(config, { graph: next }))}
            />
        );
    }

    if (kind === "core.toolset") {
        const include = isRecord(config) ? config.include : undefined;
        const exclude = isRecord(config) ? config.exclude : undefined;
        const hostTools = isRecord(config) ? config.hostTools : undefined;
        return (
            <div className={styles.stack}>
                <ListInline
                    value={include}
                    ariaLabel="包含工具"
                    placeholder="include tools"
                    disabled={readOnly}
                    onChange={(next) => onChange(writeConfig(config, { include: next }))}
                />
                <ListInline
                    value={exclude}
                    ariaLabel="排除工具"
                    placeholder="exclude tools"
                    disabled={readOnly}
                    onChange={(next) => onChange(writeConfig(config, { exclude: next }))}
                />
                <JsonInline
                    value={hostTools}
                    ariaLabel="宿主工具"
                    placeholder="{ } host tools"
                    rows={2}
                    disabled={readOnly}
                    onChange={(next) => onChange(writeConfig(config, { hostTools: next }))}
                />
            </div>
        );
    }

    if (kind === "core.eventTrigger") {
        const event =
            isRecord(config) && typeof config.event === "string"
                ? config.event
                : "";
        return (
            <input
                className={`${styles.input} nodrag nowheel`}
                value={event}
                disabled={readOnly}
                aria-label="事件名"
                placeholder="event"
                onChange={(event_) =>
                    onChange(
                        writeConfig(config, {
                            event:
                                event_.target.value === ""
                                    ? undefined
                                    : event_.target.value,
                        }),
                    )
                }
                onKeyDown={(event_) => event_.stopPropagation()}
            />
        );
    }

    if (kind === "core.log") {
        const level = isRecord(config) && typeof config.level === "string"
            ? config.level
            : "info";
        return (
            <select
                className={`${styles.select} nodrag nowheel`}
                value={level}
                disabled={readOnly}
                aria-label="日志级别"
                onChange={(event) =>
                    onChange({
                        ...(isRecord(config) ? config : {}),
                        level: event.target.value,
                    })
                }
                onKeyDown={(event) => event.stopPropagation()}
            >
                {["debug", "info", "warn", "error"].map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        );
    }

    return <>{summary ? <span className={styles.summary}>{summary}</span> : null}</>;
}

/** 多行短文本（System Prompt 等）：失焦提交，避免逐键写回整张图。 */
function TextareaInline({
    value,
    ariaLabel,
    placeholder,
    rows = 2,
    disabled,
    onChange,
}: {
    value: string;
    ariaLabel: string;
    placeholder?: string;
    rows?: number;
    disabled: boolean;
    onChange: (value: string | undefined) => void;
}): ReactElement {
    const [draft, setDraft] = useState(value);
    const focusedRef = useRef(false);

    useEffect(() => {
        if (focusedRef.current) return;
        setDraft(value);
    }, [value]);

    return (
        <textarea
            className={`${styles.smallTextarea} nodrag nowheel`}
            rows={rows}
            value={draft}
            disabled={disabled}
            spellCheck={false}
            aria-label={ariaLabel}
            placeholder={placeholder}
            onFocus={() => {
                focusedRef.current = true;
            }}
            onBlur={() => {
                focusedRef.current = false;
                if (draft !== value) {
                    onChange(draft === "" ? undefined : draft);
                }
            }}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
        />
    );
}

/**
 * 紧凑 JSON 字段：失焦时解析，失败只提示不写回。
 * 用于 Generated parameters / hostTools / 内嵌 graph 等对象型 config。
 */
function JsonInline({
    value,
    ariaLabel,
    placeholder,
    rows = 2,
    disabled,
    onChange,
}: {
    value: unknown;
    ariaLabel: string;
    placeholder?: string;
    rows?: number;
    disabled: boolean;
    onChange: (value: unknown) => void;
}): ReactElement {
    const external = value === undefined ? "" : JSON.stringify(value, null, 2);
    const [draft, setDraft] = useState(external);
    const [error, setError] = useState<string | null>(null);
    const focusedRef = useRef(false);

    useEffect(() => {
        if (focusedRef.current) return;
        setDraft(external);
        setError(null);
    }, [external]);

    const commit = (): void => {
        if (draft.trim() === "") {
            setError(null);
            onChange(undefined);
            return;
        }
        try {
            const parsed: unknown = JSON.parse(draft);
            setError(null);
            onChange(parsed);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "JSON 解析失败");
        }
    };

    return (
        <div className={styles.field}>
            <textarea
                className={`${styles.smallTextarea} ${styles.jsonTextarea} nodrag nowheel`}
                rows={rows}
                value={draft}
                disabled={disabled}
                spellCheck={false}
                aria-label={ariaLabel}
                placeholder={placeholder}
                onFocus={() => {
                    focusedRef.current = true;
                }}
                onBlur={() => {
                    focusedRef.current = false;
                    commit();
                }}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
            />
            {error === null ? null : (
                <span className={styles.inlineError}>{error}</span>
            )}
        </div>
    );
}

/** 字符串数组：逗号分隔，失焦提交。 */
function ListInline({
    value,
    ariaLabel,
    placeholder,
    disabled,
    onChange,
}: {
    value: unknown;
    ariaLabel: string;
    placeholder?: string;
    disabled: boolean;
    onChange: (value: string[]) => void;
}): ReactElement {
    const external = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string").join(", ")
        : "";
    const [draft, setDraft] = useState(external);
    const focusedRef = useRef(false);

    useEffect(() => {
        if (focusedRef.current) return;
        setDraft(external);
    }, [external]);

    return (
        <input
            className={`${styles.input} nodrag nowheel`}
            value={draft}
            disabled={disabled}
            aria-label={ariaLabel}
            placeholder={placeholder}
            onFocus={() => {
                focusedRef.current = true;
            }}
            onBlur={() => {
                focusedRef.current = false;
                onChange(
                    draft
                        .split(",")
                        .map((item) => item.trim())
                        .filter((item) => item.length > 0),
                );
            }}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
        />
    );
}

function CheckInline({
    label,
    checked,
    disabled,
    onChange,
}: {
    label: string;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}): ReactElement {
    return (
        <label className={styles.check}>
            <input
                type="checkbox"
                className="nodrag"
                checked={checked}
                disabled={disabled}
                aria-label={label}
                onChange={(event) => onChange(event.target.checked)}
            />
            {label}
        </label>
    );
}

function writeConfig(
    config: unknown,
    patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const next: Record<string, unknown> = {
        ...(isRecord(config) ? config : {}),
    };
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete next[key];
        else next[key] = value;
    }
    return next;
}

function formatThinkingLevel(value: unknown): string {
    return typeof value === "string" || typeof value === "number"
        ? String(value)
        : "";
}

function parseThinkingLevel(value: string): string | number | undefined {
    const text = value.trim();
    if (text.length === 0) return undefined;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    return text;
}

/**
 * 常量文本：非编辑态是截断的 p 标签，编辑态是自增高 TextArea。
 *
 * 输入过程中只更新本地 draft，避免每次按键都把外部 config 写回并重建节点；
 * 同时兼容中文 IME composition，失焦 / 短暂停顿后再提交。
 */
function ConstantInline({
    config,
    readOnly,
    editing,
    onChange,
}: {
    config: unknown;
    readOnly: boolean;
    editing: boolean;
    onChange: (config: unknown) => void;
}): ReactElement {
    const value = isRecord(config) && isRecord(config.value) ? config.value : {};
    const externalText = typeof value.text === "string" ? value.text : "";
    const valueType = value.type === "json" ? "json" : "text";
    const externalJson =
        value.type === "json"
            ? JSON.stringify(value.value ?? null, null, 2)
            : "";

    const [draft, setDraft] = useState(externalText);
    const draftRef = useRef(draft);
    const focusedRef = useRef(false);
    const composingRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (editing) return;
        focusedRef.current = false;
        setDraft(externalText);
        draftRef.current = externalText;
    }, [editing, externalText]);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, []);

    // TextArea 高度跟随内容增长，但不超过节点允许的极限值。
    useLayoutEffect(() => {
        if (!editing) return;
        const element = textareaRef.current;
        if (element === null) return;
        element.style.height = "auto";
        element.style.height = `${Math.min(
            element.scrollHeight,
            CONSTANT_EDIT_MAX_HEIGHT,
        )}px`;
    }, [draft, editing]);

    const commit = (text: string): void => {
        onChange({
            ...(isRecord(config) ? config : {}),
            value: { type: "text", text },
        });
    };

    const commitJson = (next: unknown): void => {
        onChange({
            ...(isRecord(config) ? config : {}),
            value: {
                type: "json",
                value: next === undefined ? null : next,
            },
        });
    };

    const scheduleCommit = (text: string): void => {
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            if (composingRef.current || !focusedRef.current) return;
            if (text === externalText) return;
            commit(text);
        }, 450);
    };

    if (!editing) {
        const displayText = valueType === "json" ? externalJson : externalText;
        if (displayText.length === 0) {
            return <p className={styles.constantEmpty}>空文本</p>;
        }

        const preview = truncateText(displayText, CONSTANT_PREVIEW_LIMIT);
        const tooltip = truncateText(displayText, CONSTANT_TOOLTIP_LIMIT);
        const previewText = preview.truncated ? `${preview.text}…` : preview.text;
        const tooltipText = tooltip.truncated ? `${tooltip.text}…` : tooltip.text;

        return (
            <Tooltip label={tooltipText}>
                <p className={styles.constantPreview} tabIndex={0}>
                    {previewText}
                </p>
            </Tooltip>
        );
    }

    const typeSelect = (
        <select
            className={`${styles.select} nodrag nowheel`}
            value={valueType}
            disabled={readOnly}
            aria-label="常量类型"
            onChange={(event) => {
                if (event.target.value === "json") {
                    commitJson(value.type === "json" ? value.value : null);
                } else {
                    commit(typeof value.text === "string" ? value.text : "");
                }
            }}
            onKeyDown={(event) => event.stopPropagation()}
        >
            <option value="text">text</option>
            <option value="json">json</option>
        </select>
    );

    if (valueType === "json") {
        return (
            <div className={styles.stack}>
                {typeSelect}
                <JsonInline
                    value={value.value}
                    ariaLabel="常量 JSON"
                    placeholder="{ } json"
                    rows={3}
                    disabled={readOnly}
                    onChange={commitJson}
                />
            </div>
        );
    }

    return (
        <div className={styles.stack}>
            {typeSelect}
            <textarea
                ref={textareaRef}
                className={`${styles.textarea} nodrag nowheel`}
                value={draft}
                rows={1}
                disabled={readOnly}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                aria-label="常量文本"
                placeholder="常量文本"
                onFocus={() => {
                    focusedRef.current = true;
                }}
                onBlur={() => {
                    focusedRef.current = false;
                    if (timerRef.current !== null) {
                        clearTimeout(timerRef.current);
                        timerRef.current = null;
                    }
                    if (draftRef.current !== externalText) commit(draftRef.current);
                }}
                onChange={(event) => {
                    const text = event.target.value;
                    draftRef.current = text;
                    setDraft(text);
                    if (!composingRef.current) scheduleCommit(text);
                }}
                onCompositionStart={() => {
                    composingRef.current = true;
                    if (timerRef.current !== null) {
                        clearTimeout(timerRef.current);
                        timerRef.current = null;
                    }
                }}
                onCompositionEnd={(event) => {
                    composingRef.current = false;
                    const text = event.currentTarget.value;
                    draftRef.current = text;
                    setDraft(text);
                    scheduleCommit(text);
                }}
                onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                        draftRef.current = externalText;
                        setDraft(externalText);
                        event.currentTarget.blur();
                    }
                    if (
                        event.key === "Enter" &&
                        (event.ctrlKey || event.metaKey)
                    ) {
                        event.currentTarget.blur();
                    }
                }}
            />
        </div>
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
