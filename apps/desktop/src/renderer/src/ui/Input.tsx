import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./Input.module.css";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
    hint?: string;
    error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { label, hint, error, className, id, ...rest },
    ref,
) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const descriptionId = error
        ? `${inputId}-error`
        : hint
          ? `${inputId}-hint`
          : undefined;

    return (
        <div className={styles.field}>
            {label ? (
                <label className={styles.label} htmlFor={inputId}>
                    {label}
                </label>
            ) : null}

            <input
                ref={ref}
                id={inputId}
                className={cx(styles.input, error && styles.invalid, className)}
                aria-invalid={error ? true : undefined}
                aria-describedby={descriptionId}
                {...rest}
            />

            {error ? (
                <p id={`${inputId}-error`} className={styles.error}>
                    {error}
                </p>
            ) : hint ? (
                <p id={`${inputId}-hint`} className={styles.hint}>
                    {hint}
                </p>
            ) : null}
        </div>
    );
});
