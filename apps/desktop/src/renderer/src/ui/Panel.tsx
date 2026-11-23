import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Panel.module.css";

export type PanelProps = {
    title?: string;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
    /** 去掉 body 内边距（用于列表/画布类内容）。 */
    flush?: boolean;
};

export function Panel({
    title,
    actions,
    children,
    className,
    bodyClassName,
    flush = false,
}: PanelProps): ReactElement {
    return (
        <section className={cx(styles.panel, className)}>
            {title || actions ? (
                <header className={styles.header}>
                    {title ? <h2 className={styles.title}>{title}</h2> : <span />}
                    {actions ? <div className={styles.actions}>{actions}</div> : null}
                </header>
            ) : null}

            <div className={cx(styles.body, flush && styles.flush, bodyClassName)}>
                {children}
            </div>
        </section>
    );
}
