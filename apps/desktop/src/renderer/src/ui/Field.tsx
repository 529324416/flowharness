import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Field.module.css";

export type FieldProps = {
    label?: string;
    hint?: string;
    error?: string;
    htmlFor?: string;
    required?: boolean;
    children: ReactNode;
    className?: string;
};

/** 表单行：标签 / 控件 / 错误或提示。控件本身负责自己的输入样式。 */
export function Field({
    label,
    hint,
    error,
    htmlFor,
    required = false,
    children,
    className,
}: FieldProps): ReactNode {
    return (
        <div className={cx(styles.field, className)}>
            {label === undefined ? null : (
                <label className={styles.label} htmlFor={htmlFor}>
                    {label}
                    {required ? (
                        <span className={styles.required} aria-hidden="true">
                            *
                        </span>
                    ) : null}
                </label>
            )}
            {children}
            {error !== undefined ? (
                <p className={styles.error}>{error}</p>
            ) : hint !== undefined ? (
                <p className={styles.hint}>{hint}</p>
            ) : null}
        </div>
    );
}
