import {
    useRef,
    type PointerEvent as ReactPointerEvent,
    type ReactElement,
    type ReactNode,
} from "react";
import { PanelLeftClose } from "lucide-react";
import { IconButton, Tooltip } from "../../ui";
import { cx } from "../../ui/cx";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "../../layout-metrics";
import styles from "./NavigationPanel.module.css";

export type NavigationPanelProps = {
    title: string;
    badge?: ReactNode;
    actions?: ReactNode;
    footer?: ReactNode;
    width: number;
    onResize: (width: number) => void;
    onCollapse?: () => void;
    /** 作为上下分区的一节渲染：占满分区高度，不重复宽度拖拽与收起按钮。 */
    section?: boolean;
    children: ReactNode;
};

function clampWidth(width: number): number {
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

/** 左栏 Panel 壳：标题 / 动作 / 内容 / 页脚 / 拖宽 / 收起。 */
export function NavigationPanel({
    title,
    badge,
    actions,
    footer,
    width,
    onResize,
    onCollapse,
    section = false,
    children,
}: NavigationPanelProps): ReactElement {
    const drag = useRef<{ x: number; width: number } | null>(null);

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
        drag.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (!drag.current) return;
        onResize(clampWidth(drag.current.width + event.clientX - drag.current.x));
    };

    const handlePointerUp = (): void => {
        drag.current = null;
    };

    return (
        <aside
            className={cx(styles.root, section && styles.sectionRoot)}
            aria-label={title}
        >
            <header className={styles.header}>
                <span className={styles.title}>{title}</span>
                {badge}
                <span className={styles.spacer} />
                {actions}
                {onCollapse !== undefined ? (
                    <Tooltip label="收起导航">
                        <IconButton label="收起导航" size="sm" onClick={onCollapse}>
                            <PanelLeftClose size={19} aria-hidden="true" />
                        </IconButton>
                    </Tooltip>
                ) : null}
            </header>

            <div className={styles.body}>{children}</div>

            {footer ? <footer className={styles.footer}>{footer}</footer> : null}

            {section ? null : (
                <div
                    className={styles.resize}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="调整导航宽度"
                    tabIndex={0}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowLeft") {
                            event.preventDefault();
                            onResize(clampWidth(width - 16));
                        } else if (event.key === "ArrowRight") {
                            event.preventDefault();
                            onResize(clampWidth(width + 16));
                        }
                    }}
                />
            )}
        </aside>
    );
}
