import { useEffect, useState, type ChangeEvent, type FocusEvent } from "react";
import { cx } from "./cx";
import styles from "./NumberField.module.css";

export type NumberFieldProps = {
    id?: string;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    min?: number;
    max?: number;
    step?: number | "any";
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    "aria-label"?: string;
};

/**
 * 数字输入。
 *
 * 本地保留草稿，失焦时提交：避免输入 `-` / `1.` 等中间态被立刻改写成数字。
 */
export function NumberField({
    id,
    value,
    onChange,
    min,
    max,
    step = 1,
    placeholder,
    disabled = false,
    className,
    "aria-label": ariaLabel,
}: NumberFieldProps) {
    const [draft, setDraft] = useState(toText(value));

    useEffect(() => {
        setDraft(toText(value));
    }, [value]);

    const commit = (event: FocusEvent<HTMLInputElement>): void => {
        const parsed = parseNumber(event.target.value);
        setDraft(parsed === undefined ? "" : String(parsed));
        onChange(parsed);
    };

    const change = (event: ChangeEvent<HTMLInputElement>): void => {
        setDraft(event.target.value);
    };

    return (
        <input
            id={id}
            type="number"
            className={cx(styles.input, className)}
            value={draft}
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={change}
            onBlur={commit}
        />
    );
}

function toText(value: number | undefined): string {
    return value === undefined ? "" : String(value);
}

function parseNumber(text: string): number | undefined {
    const trimmed = text.trim();
    if (trimmed.length === 0) return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
}
