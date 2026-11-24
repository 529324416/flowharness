import {
    useEffect,
    useRef,
    type PointerEvent as ReactPointerEvent,
    type ReactElement,
    type ReactNode,
} from "react";
import type { FloatingPanelState, PanelId } from "./useFloatingPanels";
import { PanelFrame } from "./PanelFrame";
import styles from "./FloatingPanel.module.css";

const HEADER_HEIGHT = 32;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 140;
const EDGE = 16;

type ResizeDirection = "e" | "s" | "se";

export type FloatingPanelProps = {
    panel: FloatingPanelState;
    containerWidth: number;
    containerHeight: number;
    title: string;
    icon?: ReactNode;
    badge?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    onUpdate: (id: PanelId, patch: Partial<FloatingPanelState>) => void;
    onClose: () => void;
    onFocus: () => void;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

export function FloatingPanel({
    panel,
    containerWidth,
    containerHeight,
    title,
    icon,
    badge,
    footer,
    children,
    onUpdate,
    onClose,
    onFocus,
}: FloatingPanelProps): ReactElement {
    const drag = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        left: number;
        top: number;
    } | null>(null);

    const resize = useRef<{
        pointerId: number;
        direction: ResizeDirection;
        startX: number;
        startY: number;
        left: number;
        top: number;
        width: number;
        height: number;
    } | null>(null);

    const maxWidth = Math.max(MIN_WIDTH, containerWidth - EDGE * 2);
    const maxHeight = Math.max(MIN_HEIGHT, containerHeight - EDGE * 2);
    const width = clamp(panel.width, MIN_WIDTH, maxWidth);
    const height = clamp(panel.height, MIN_HEIGHT, maxHeight);
    const collapsedHeight = HEADER_HEIGHT;

    const defaultLeft =
        panel.id === "run-log" ? EDGE : Math.max(EDGE, containerWidth - width - EDGE);
    const defaultTop =
        panel.id === "run-log"
            ? Math.max(EDGE, containerHeight - height - EDGE)
            : EDGE;

    const left = clamp(panel.x ?? defaultLeft, 0, containerWidth - width);
    const top = clamp(
        panel.y ?? defaultTop,
        0,
        containerHeight - (panel.collapsed ? collapsedHeight : height),
    );

    useEffect(() => {
        if (panel.x === null && panel.y === null) return;
        const nextX = clamp(panel.x ?? left, 0, containerWidth - width);
        const nextY = clamp(
            panel.y ?? top,
            0,
            containerHeight - (panel.collapsed ? collapsedHeight : height),
        );
        if (nextX !== panel.x || nextY !== panel.y) {
            onUpdate(panel.id, { x: nextX, y: nextY });
        }
    }, [
        containerHeight,
        containerWidth,
        collapsedHeight,
        height,
        left,
        onUpdate,
        panel.collapsed,
        panel.id,
        panel.x,
        panel.y,
        top,
        width,
    ]);

    const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
        if ((event.target as HTMLElement).closest("button")) return;
        onFocus();
        drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left,
            top,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleHeaderPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.current.startX;
        const dy = event.clientY - drag.current.startY;
        const maxY = containerHeight - (panel.collapsed ? collapsedHeight : height);
        onUpdate(panel.id, {
            x: clamp(drag.current.left + dx, 0, containerWidth - width),
            y: clamp(drag.current.top + dy, 0, maxY),
        });
    };

    const handleHeaderPointerUp = (): void => {
        drag.current = null;
    };

    const handleResizeDown =
        (direction: ResizeDirection) =>
        (event: ReactPointerEvent<HTMLDivElement>): void => {
            event.stopPropagation();
            onFocus();
            resize.current = {
                pointerId: event.pointerId,
                direction,
                startX: event.clientX,
                startY: event.clientY,
                left,
                top,
                width,
                height,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
        };

    const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
        const state = resize.current;
        if (!state || state.pointerId !== event.pointerId) return;
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;

        const nextWidth =
            state.direction === "s"
                ? state.width
                : clamp(state.width + dx, MIN_WIDTH, containerWidth - state.left);
        const nextHeight =
            state.direction === "e"
                ? state.height
                : clamp(state.height + dy, MIN_HEIGHT, containerHeight - state.top);

        onUpdate(panel.id, { width: nextWidth, height: nextHeight });
    };

    const handleResizeUp = (): void => {
        resize.current = null;
    };

    return (
        <div
            className={styles.floating}
            style={{ left, top, width, height: panel.collapsed ? collapsedHeight : height, zIndex: panel.z }}
            onPointerDown={onFocus}
            role="presentation"
        >
            <PanelFrame
                title={title}
                icon={icon}
                badge={badge}
                footer={footer}
                collapsed={panel.collapsed}
                onClose={onClose}
                onCollapse={() => onUpdate(panel.id, { collapsed: !panel.collapsed })}
                onHeaderPointerDown={handleHeaderPointerDown}
                onHeaderPointerMove={handleHeaderPointerMove}
                onHeaderPointerUp={handleHeaderPointerUp}
                onHeaderPointerCancel={handleHeaderPointerUp}
                onHeaderDoubleClick={() =>
                    onUpdate(panel.id, { collapsed: !panel.collapsed })
                }
            >
                {children}
            </PanelFrame>

            {panel.collapsed ? null : (
                <>
                    <div
                        className={`${styles.handle} ${styles.east}`}
                        role="presentation"
                        onPointerDown={handleResizeDown("e")}
                        onPointerMove={handleResizeMove}
                        onPointerUp={handleResizeUp}
                        onPointerCancel={handleResizeUp}
                    />
                    <div
                        className={`${styles.handle} ${styles.south}`}
                        role="presentation"
                        onPointerDown={handleResizeDown("s")}
                        onPointerMove={handleResizeMove}
                        onPointerUp={handleResizeUp}
                        onPointerCancel={handleResizeUp}
                    />
                    <div
                        className={`${styles.handle} ${styles.southEast}`}
                        role="presentation"
                        onPointerDown={handleResizeDown("se")}
                        onPointerMove={handleResizeMove}
                        onPointerUp={handleResizeUp}
                        onPointerCancel={handleResizeUp}
                    />
                </>
            )}
        </div>
    );
}
