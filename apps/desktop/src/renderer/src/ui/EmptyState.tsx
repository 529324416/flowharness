import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    compact?: boolean;
    className?: string;
};

export function EmptyState({
    icon,
    title,
    description,
    action,
    compact = false,
    className,
}: EmptyStateProps): ReactElement {
    return (
        <div className={cx(styles.root, compact && styles.compact, className)}>
            {icon ? <div className={styles.icon}>{icon}</div> : null}
            <p className={styles.title}>{title}</p>
            {description ? <p className={styles.description}>{description}</p> : null}
            {action ? <div className={styles.action}>{action}</div> : null}
        </div>
    );
}
