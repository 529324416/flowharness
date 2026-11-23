import type { HTMLAttributes, ReactElement } from "react";
import { cx } from "./cx";
import styles from "./Badge.module.css";

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
    variant?: BadgeVariant;
};

export function Badge({ variant = "neutral", className, ...rest }: BadgeProps): ReactElement {
    return <span className={cx(styles.badge, styles[variant], className)} {...rest} />;
}
