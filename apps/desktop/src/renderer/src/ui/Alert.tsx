import type { ReactElement, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cx } from "./cx";
import styles from "./Alert.module.css";

export type AlertTone = "info" | "success" | "warning" | "danger";

const ICONS = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: XCircle,
} as const;

export type AlertProps = {
    tone?: AlertTone;
    title?: string;
    children: ReactNode;
    className?: string;
};

export function Alert({ tone = "info", title, children, className }: AlertProps): ReactElement {
    const Icon = ICONS[tone];

    return (
        <div className={cx(styles.alert, styles[tone], className)} role="status">
            <Icon size={20} className={styles.icon} aria-hidden="true" />
            <div className={styles.content}>
                {title ? <p className={styles.title}>{title}</p> : null}
                <div className={styles.body}>{children}</div>
            </div>
        </div>
    );
}
