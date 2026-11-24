import { useEffect, useState, type ReactElement } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
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

    useEffect(() => {
        void bridge.isWindowMaximized().then((result) => {
            if (result.ok) setMaximized(result.data.maximized);
        });

        return bridge.onEvent((envelope) => {
            if (envelope.topic !== "window") return;
            setMaximized((envelope.payload as WindowStatePayload).maximized);
        });
    }, [bridge]);

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
                {maximized ? (
                    <Copy size={15} aria-hidden="true" />
                ) : (
                    <Square size={15} aria-hidden="true" />
                )}
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
