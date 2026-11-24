import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { IconButton } from "../../ui";
import { cx } from "../../ui/cx";
import { PANEL_HEADER_HEIGHT } from "../../layout-metrics";
import styles from "./PanelFrame.module.css";

export type PanelFrameProps = {
    title: string;
    icon?: ReactNode;
    badge?: ReactNode;
    footer?: ReactNode;
    collapsed: boolean;
    children: ReactNode;
    onClose: () => void;
    onCollapse: () => void;
    onHeaderPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
    onHeaderPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void;
    onHeaderPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
    onHeaderPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void;
    onHeaderDoubleClick?: () => void;
    className?: string;
};

/** 内部 Panel 的三段式外框：Header / Body / 可选 Footer。 */
export function PanelFrame({
    title,
    icon,
    badge,
    footer,
    collapsed,
    children,
    onClose,
    onCollapse,
    onHeaderPointerDown,
    onHeaderPointerMove,
    onHeaderPointerUp,
    onHeaderPointerCancel,
    onHeaderDoubleClick,
    className,
}: PanelFrameProps): ReactElement {
    return (
        <section
            className={cx(styles.frame, className)}
            aria-label={title}
            data-collapsed={collapsed ? "true" : undefined}
            style={collapsed ? { height: PANEL_HEADER_HEIGHT } : undefined}
        >
            <header
                className={styles.header}
                style={{ height: PANEL_HEADER_HEIGHT }}
                onPointerDown={onHeaderPointerDown}
                onPointerMove={onHeaderPointerMove}
                onPointerUp={onHeaderPointerUp}
                onPointerCancel={onHeaderPointerCancel}
                onDoubleClick={(event) => {
                    if ((event.target as HTMLElement).closest("button")) return;
                    onHeaderDoubleClick?.();
                }}
            >
                <span className={styles.dragHandle} aria-hidden="true">
                    {icon}
                </span>
                <span className={styles.title}>{title}</span>
                {badge}
                <span className={styles.spacer} />
                <IconButton
                    label={collapsed ? "展开面板" : "折叠面板"}
                    size="sm"
                    onClick={onCollapse}
                >
                    {collapsed ? (
                        <ChevronDown size={17} aria-hidden="true" />
                    ) : (
                        <ChevronUp size={17} aria-hidden="true" />
                    )}
                </IconButton>
                <IconButton label={`关闭${title}`} size="sm" onClick={onClose}>
                    <X size={17} aria-hidden="true" />
                </IconButton>
            </header>

            {collapsed ? null : (
                <>
                    <div className={styles.body}>{children}</div>
                    {footer ? <footer className={styles.footer}>{footer}</footer> : null}
                </>
            )}
        </section>
    );
}
