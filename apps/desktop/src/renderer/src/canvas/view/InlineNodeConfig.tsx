import { useEffect, useRef, useState, type ReactElement } from "react";
import styles from "./InlineNodeConfig.module.css";

export type InlineNodeConfigProps = {
    kind: string;
    config: unknown;
    summary?: string;
    readOnly?: boolean;
    onChange?: (config: unknown) => void;
};

/** 节点内联编辑：高频节点的常用参数直接在节点 Body 上修改。 */
export function InlineNodeConfig({
    kind,
    config,
    summary,
    readOnly = false,
    onChange,
}: InlineNodeConfigProps): ReactElement {
    if (readOnly || onChange === undefined) {
        return <>{summary ? <span className={styles.summary}>{summary}</span> : null}</>;
    }

    if (kind === "core.constant") {
        return <ConstantInline config={config} onChange={onChange} />;
    }

    if (kind === "core.model.call") {
        const mode = isRecord(config) && typeof config.mode === "string"
            ? config.mode
            : "chat";
        const temperature =
            isRecord(config) && typeof config.temperature === "number"
                ? config.temperature
                : undefined;
        return (
            <div className={styles.row}>
                <select
                    className={`${styles.select} nodrag nowheel`}
                    value={mode}
                    aria-label="模型调用模式"
                    onChange={(event) =>
                        onChange({
                            ...(isRecord(config) ? config : {}),
                            mode: event.target.value,
                        })
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
                    aria-label="Temperature"
                    placeholder="temp"
                    onChange={(event) => {
                        const next: Record<string, unknown> = {
                            ...(isRecord(config) ? config : {}),
                        };
                        const parsed = Number(event.target.value);
                        if (event.target.value === "" || !Number.isFinite(parsed)) {
                            delete next.temperature;
                        } else {
                            next.temperature = parsed;
                        }
                        onChange(next);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                />
            </div>
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

/**
 * 常量文本输入。
 *
 * 输入过程中只更新本地 draft，避免每次按键都把外部 config 写回并重建节点；
 * 同时兼容中文 IME composition，失焦 / Enter / 短暂停顿后再提交。
 */
function ConstantInline({
    config,
    onChange,
}: {
    config: unknown;
    onChange: (config: unknown) => void;
}): ReactElement {
    const value = isRecord(config) && isRecord(config.value) ? config.value : {};
    const externalText = typeof value.text === "string" ? value.text : "";

    const [draft, setDraft] = useState(externalText);
    const draftRef = useRef(draft);
    const focusedRef = useRef(false);
    const composingRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (focusedRef.current) return;
        setDraft(externalText);
        draftRef.current = externalText;
    }, [externalText]);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, []);

    const commit = (text: string): void => {
        const nextValue = {
            ...(isRecord(config) && isRecord(config.value) ? config.value : {}),
            type: "text",
            text,
        };
        onChange({
            ...(isRecord(config) ? config : {}),
            value: nextValue,
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

    return (
        <input
            className={`${styles.input} nodrag nowheel`}
            value={draft}
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
                if (event.key === "Enter") {
                    event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                    draftRef.current = externalText;
                    setDraft(externalText);
                    event.currentTarget.blur();
                }
            }}
        />
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
