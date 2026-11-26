import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Minus, X } from "lucide-react";
import type { WindowStatePayload } from "@flowharness/contracts";
import { cx } from "../ui/cx";
import styles from "./WindowControls.module.css";

/**
 * 自绘窗口按钮。仅在无边框模式下渲染；
 * overlay 模式使用系统原生按钮（titleBarOverlay），standard 模式使用原生窗口框。
 */
export function WindowControls({
    mode,
    onClose,
}: {
    mode: string;
    /** 关闭前先 flush 当前文档；缺省直接关闭窗口。 */
    onClose?: () => void;
}): ReactElement | null {
    const bridge = window.flowharness;
    const [maximized, setMaximized] = useState(false);

    const sync = useCallback(async (): Promise<void> => {
        const result = await bridge.isWindowMaximized();
        if (result.ok) setMaximized(result.data.maximized);
    }, [bridge]);

    useEffect(() => {
        void sync();
        const unsubscribe = bridge.onEvent((envelope) => {
            if (envelope.topic !== "window") return;
            setMaximized((envelope.payload as WindowStatePayload).maximized);
        });

        // main 在 maximize / unmaximize / resize / focus 时都会广播；
        // 这里再兜底查询一次，覆盖窗口在 renderer 挂载前就已最大化等情况。
        let resizeTimer: number | undefined;
        const onFocus = (): void => {
            void sync();
        };
        const onResize = (): void => {
            if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                void sync();
            }, 100);
        };

        window.addEventListener("focus", onFocus);
        window.addEventListener("resize", onResize);
        document.addEventListener("visibilitychange", onFocus);

        return () => {
            unsubscribe();
            if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("resize", onResize);
            document.removeEventListener("visibilitychange", onFocus);
        };
    }, [bridge, sync]);

    if (mode === "standard" || mode === "overlay") return null;

    const toggleMaximize = async (): Promise<void> => {
        const result = await bridge.windowToggleMaximize();
        if (result.ok) setMaximized(result.data.maximized);
    };

    return (
        <div className={styles.group} data-no-drag>
            <button
                type="button"
                className={styles.button}
                aria-label="最小化"
                title="最小化"
                onClick={() => void bridge.windowMinimize()}
            >
                <Minus size={17} aria-hidden="true" />
            </button>

            <button
                type="button"
                className={styles.button}
                aria-label={maximized ? "还原" : "最大化"}
                title={maximized ? "还原" : "最大化"}
                onClick={() => void toggleMaximize()}
            >
                {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
            </button>

            <button
                type="button"
                className={cx(styles.button, styles.close)}
                aria-label="关闭"
                title="关闭"
                onClick={() => {
                    if (onClose !== undefined) onClose();
                    else void bridge.windowClose();
                }}
            >
                <X size={18} aria-hidden="true" />
            </button>
        </div>
    );
}

/** Windows 风格最大化图标：10×10 描边方框。 */
function MaximizeGlyph(): ReactElement {
    return (
        <svg
            className={styles.glyph}
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden="true"
        >
            <rect
                x="0.5"
                y="0.5"
                width="9"
                height="9"
                fill="none"
                stroke="currentColor"
            />
        </svg>
    );
}

/** Windows 风格还原图标：两层错位方框。 */
function RestoreGlyph(): ReactElement {
    return (
        <svg
            className={styles.glyph}
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden="true"
        >
            <path
                d="M2.5 2.5V0.5H9.5V7.5H7.5"
                fill="none"
                stroke="currentColor"
            />
            <rect
                x="0.5"
                y="2.5"
                width="7"
                height="7"
                fill="none"
                stroke="currentColor"
            />
        </svg>
    );
}
