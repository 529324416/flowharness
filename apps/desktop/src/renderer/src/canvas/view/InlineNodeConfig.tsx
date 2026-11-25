import type { ReactElement } from "react";
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
        const value = isRecord(config) && isRecord(config.value) ? config.value : {};
        const text = typeof value.text === "string" ? value.text : "";
        return (
            <input
                className={`${styles.input} nodrag nowheel`}
                value={text}
                aria-label="常量文本"
                placeholder="常量文本"
                onChange={(event) =>
                    onChange({
                        ...(isRecord(config) ? config : {}),
                        value: { ...value, type: "text", text: event.target.value },
                    })
                }
                onKeyDown={(event) => event.stopPropagation()}
            />
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
