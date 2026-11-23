import type { ReactElement } from "react";
import { cx } from "./cx";
import styles from "./StatusDot.module.css";

export type StatusTone = "idle" | "running" | "paused" | "completed" | "failed" | "cancelled" | "interrupted" | "skipped";

export type StatusDotProps = {
    tone: StatusTone;
    pulse?: boolean;
    label?: string;
    className?: string;
};

export function StatusDot({ tone, pulse = false, label, className }: StatusDotProps): ReactElement {
    return (
        <span
            className={cx(styles.dot, styles[tone], pulse && styles.pulse, className)}
            role={label ? "img" : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        />
    );
}
