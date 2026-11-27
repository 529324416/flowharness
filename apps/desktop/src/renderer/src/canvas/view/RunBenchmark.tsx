import { useEffect, useState, type ReactElement } from "react";
import styles from "./RunBenchmark.module.css";

export type RunBenchmarkProps = {
    /** 节点开始执行的 `at`（ms）；由运行事件投影注入。 */
    startedAt: number;
    /** 已接收的 stream 片段数，近似 token 增量。 */
    tokens: number;
    /** 最近的输出文本；只用于持续滚动的提示。 */
    tail: string;
};

/**
 * 运行中节点的暗淡 benchmark（无边框）。
 *
 * 顶部标题栏显示 token 数与毫秒计时（每 100ms 增量刷新），底部最多 80px
 * 展示最近的输出片段；它只是「节点正在运行」的提示，不参与交互。
 */
export function RunBenchmark({
    startedAt,
    tokens,
    tail,
}: RunBenchmarkProps): ReactElement {
    const [elapsed, setElapsed] = useState(() => elapsedSince(startedAt));

    useEffect(() => {
        setElapsed(elapsedSince(startedAt));
        const timer = window.setInterval(
            () => setElapsed(elapsedSince(startedAt)),
            100,
        );
        return () => window.clearInterval(timer);
    }, [startedAt]);

    return (
        <div
            className={styles.benchmark}
            data-run-benchmark="true"
            aria-hidden="true"
        >
            <div className={styles.head}>
                <span>tok {tokens}</span>
                <span>{elapsed}ms</span>
            </div>
            <div className={styles.tail}>
                <span>{tail.length === 0 ? "…" : tail}</span>
            </div>
        </div>
    );
}

function elapsedSince(startedAt: number): number {
    return Math.max(0, Date.now() - startedAt);
}
