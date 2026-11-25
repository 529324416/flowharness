import {
    useEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactElement,
    type ReactNode,
} from "react";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "../../layout-metrics";
import styles from "./SplitSidebar.module.css";

const SPLIT_RATIO_KEY = "fh.sidebar.split";
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;

export type SplitSidebarProps = {
    top: ReactNode;
    bottom: ReactNode;
    width: number;
    onResize: (width: number) => void;
};

function clampWidth(width: number): number {
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function clampRatio(ratio: number): number {
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

function readRatio(): number {
    try {
        const raw = localStorage.getItem(SPLIT_RATIO_KEY);
        if (raw === null) return 0.5;
        const value = Number(raw);
        return Number.isFinite(value) ? clampRatio(value) : 0.5;
    } catch {
        return 0.5;
    }
}

/**
 * 上下两区导航宿主。
 *
 * 上半区通常是工作流、下半区是 Session 树；两区共享侧栏宽度，
 * 中间的横向分隔条可拖动调整高度比例。
 */
export function SplitSidebar({
    top,
    bottom,
    width,
    onResize,
}: SplitSidebarProps): ReactElement {
    const [ratio, setRatio] = useState(readRatio);
    const rootRef = useRef<HTMLDivElement>(null);
    const splitting = useRef(false);
    const widthDrag = useRef<{ x: number; width: number } | null>(null);

    useEffect(() => {
        try {
            localStorage.setItem(SPLIT_RATIO_KEY, String(ratio));
        } catch {
            // 存储不可用时保持内存状态。
        }
    }, [ratio]);

    const handleSplitMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (!splitting.current) return;
        const rect = rootRef.current?.getBoundingClientRect();
        if (rect === undefined || rect.height <= 0) return;
        setRatio(clampRatio((event.clientY - rect.top) / rect.height));
    };

    const handleWidthDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
        widthDrag.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleWidthMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (widthDrag.current === null) return;
        onResize(
            clampWidth(
                widthDrag.current.width + event.clientX - widthDrag.current.x,
            ),
        );
    };

    return (
        <div ref={rootRef} className={styles.root}>
            <div className={styles.section} style={{ flexGrow: ratio }}>
                {top}
            </div>

            <div
                className={styles.divider}
                role="separator"
                aria-orientation="horizontal"
                aria-label="调整工作流与会话分区高度"
                tabIndex={0}
                onPointerDown={(event) => {
                    splitting.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={handleSplitMove}
                onPointerUp={() => {
                    splitting.current = false;
                }}
                onPointerCancel={() => {
                    splitting.current = false;
                }}
                onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setRatio((current) => clampRatio(current - 0.04));
                    } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setRatio((current) => clampRatio(current + 0.04));
                    }
                }}
            />

            <div className={styles.section} style={{ flexGrow: 1 - ratio }}>
                {bottom}
            </div>

            <div
                className={styles.resize}
                role="separator"
                aria-orientation="vertical"
                aria-label="调整导航宽度"
                tabIndex={0}
                onPointerDown={handleWidthDown}
                onPointerMove={handleWidthMove}
                onPointerUp={() => {
                    widthDrag.current = null;
                }}
                onPointerCancel={() => {
                    widthDrag.current = null;
                }}
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
        </div>
    );
}
