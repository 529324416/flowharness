import {
    Fragment,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactElement,
} from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { cx } from "../../ui/cx";
import type { FlowNode } from "./flow-types";
import { NodeVisual } from "./NodeVisual";
import { PortTypeIcon } from "./PortTypeIcon";
import { RunBenchmark } from "./RunBenchmark";
import styles from "./SciFiNode.module.css";

/** 完成节点从「过热」边框冷却回默认色所需时间（与 CSS 动画一致）。 */
const COOLING_MS = 1500;

function sameAnchors(
    a: Readonly<Record<string, number>>,
    b: Readonly<Record<string, number>>,
): boolean {
    const keys = Object.keys(b);
    if (Object.keys(a).length !== keys.length) return false;
    return keys.every((key) => a[key] === b[key]);
}

/**
 * 元素相对节点根部的布局 top。
 *
 * 用 offsetTop 链而不是 getBoundingClientRect：布局坐标是未缩放的整数，
 * 不会随视口平移 / 缩放产生亚像素取整差异，拖动时端口徽标不会跳变。
 */
function layoutTop(element: HTMLElement, root: HTMLElement): number {
    let top = 0;
    let current: HTMLElement | null = element;
    while (current !== null && current !== root) {
        top += current.offsetTop;
        current = current.offsetParent as HTMLElement | null;
    }
    return top;
}

/**
 * 画布节点：NodeVisual 负责内容，端口徽标由 react-flow Handle 承担。
 *
 * 徽标不再沿节点边缘均匀分布，而是与数据行（`data-port-anchor`）的
 * 上边缘对齐；未连接是「方块 + 类型图标」，已连接收成圆点。
 */
export function SciFiNode({
    id,
    data,
    selected,
    isConnectable,
}: NodeProps<FlowNode>): ReactElement {
    const rootRef = useRef<HTMLDivElement>(null);
    const [anchors, setAnchors] = useState<Readonly<Record<string, number>>>({});
    const updateNodeInternals = useUpdateNodeInternals();

    const measure = useCallback((): void => {
        const root = rootRef.current;
        if (root === null) return;

        const next: Record<string, number> = {};
        for (const element of root.querySelectorAll<HTMLElement>(
            "[data-port-anchor]",
        )) {
            const key = element.dataset.portAnchor;
            if (key === undefined) continue;
            next[key] = Math.max(0, Math.round(layoutTop(element, root)));
        }

        setAnchors((current) => (sameAnchors(current, next) ? current : next));
    }, []);

    // 配置变化会改变行高：每次渲染后按布局重新测量。
    useLayoutEffect(() => {
        measure();
    });

    useEffect(() => {
        const root = rootRef.current;
        if (root === null) return;
        const observer = new ResizeObserver(() => measure());
        observer.observe(root);
        return () => observer.disconnect();
    }, [measure]);

    // 端口 top 在首帧之后才写入：通知 react-flow 重新测量 Handle 边界，
    // 否则连线端点会停留在旧位置（行顶 0 或旧的已连接偏移）。
    const connectionKey = `${(data.connectedPorts?.inputs ?? []).join("|")}::${(data.connectedPorts?.outputs ?? []).join("|")}`;
    useEffect(() => {
        updateNodeInternals(id);
    }, [anchors, connectionKey, id, updateNodeInternals]);

    const connectedInputs = new Set(data.connectedPorts?.inputs ?? []);
    const connectedOutputs = new Set(data.connectedPorts?.outputs ?? []);
    const collapsed = data.collapsed === true;

    // 完成瞬间播放一次冷却动画：边框从运行时的橙红过渡回默认色。
    const [cooling, setCooling] = useState(false);
    const lastStatusRef = useRef(data.status);
    useEffect(() => {
        const previous = lastStatusRef.current;
        lastStatusRef.current = data.status;

        if (data.status !== "completed") {
            setCooling(false);
            return;
        }
        if (previous === "completed") return;

        setCooling(true);
        const timer = window.setTimeout(() => setCooling(false), COOLING_MS);
        return () => window.clearTimeout(timer);
    }, [data.status]);
    // 折叠态只保留已连接的端口：未连接参数与空端口由 NodeVisual 一并收起，
    // 这里同时隐藏它们的徽标，避免徽标堆在节点顶部。
    const inputs = collapsed
        ? data.inputs.filter((port) => connectedInputs.has(port.name))
        : data.inputs;
    const outputs = collapsed
        ? data.outputs.filter((port) => connectedOutputs.has(port.name))
        : data.outputs;

    const renderPort = (
        direction: "in" | "out",
        port: { name: string; type: string },
        connected: boolean,
    ): ReactElement => {
        const anchor = anchors[`${direction}:${port.name}`] ?? 0;
        // react-flow 对 Left / Right 句柄取「外缘 + 垂直中心」作为连线端点。句柄
        // 做成 6px 透明块，垂直中心始终对准徽标中心（已连接 = 实心点中心，
        // 未连接 = 方块中心）；视觉徽标独立渲染。
        const handleTop = anchor + 7;

        return (
            <Fragment key={`${direction}:${port.name}`}>
                <Handle
                    type={direction === "in" ? "target" : "source"}
                    position={direction === "in" ? Position.Left : Position.Right}
                    id={port.name}
                    isConnectable={isConnectable}
                    className={cx(
                        styles.handle,
                        direction === "in" ? styles.handleIn : styles.handleOut,
                    )}
                    style={{ top: handleTop }}
                    aria-label={`${direction === "in" ? "输入" : "输出"}端口 ${port.name}（${port.type}）`}
                />
                <span
                    className={cx(
                        styles.badge,
                        direction === "in" ? styles.badgeIn : styles.badgeOut,
                        connected ? styles.badgeConnected : styles.badgeOpen,
                    )}
                    style={{ top: anchor }}
                    data-port-badge={`${direction}:${port.name}`}
                    aria-hidden="true"
                >
                    {connected ? (
                        <>
                            <span className={styles.ring} />
                            <span className={styles.dot} />
                        </>
                    ) : (
                        <PortTypeIcon type={port.type} />
                    )}
                </span>
            </Fragment>
        );
    };

    return (
        <div
            ref={rootRef}
            className={cx(
                styles.wrapper,
                styles[data.status],
                selected && styles.selected,
            )}
            data-node-id={id}
        >
            <NodeVisual
                title={data.title}
                kind={data.kind}
                status={data.status}
                summary={data.summary}
                selected={selected}
                config={data.config}
                readOnly={data.readOnly}
                onUpdateConfig={data.onUpdateConfig}
                collapsed={collapsed}
                collapsedFields={data.collapsedFields}
                cooling={cooling}
                onToggleCollapsed={data.onToggleCollapsed}
                inputs={inputs}
                outputs={outputs}
                connectedPorts={data.connectedPorts}
                // 运行期间也保留端口行，节点结构与高度不随只读状态变化。
                showInputSlots
                notice={data.notice}
                fieldOptions={data.fieldOptions}
                lockedFields={data.lockedFields}
                slotLabels={data.slotLabels}
            />

            {data.status === "running" && data.runMetrics !== undefined ? (
                <RunBenchmark
                    startedAt={data.runMetrics.startedAt}
                    tokens={data.runMetrics.tokens}
                    tail={data.runMetrics.tail}
                />
            ) : null}

            {inputs.map((port) =>
                renderPort("in", port, connectedInputs.has(port.name)),
            )}

            {outputs.map((port) =>
                renderPort("out", port, connectedOutputs.has(port.name)),
            )}
        </div>
    );
}
