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
import styles from "./SciFiNode.module.css";

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

    const renderPort = (
        direction: "in" | "out",
        port: { name: string; type: string },
        connected: boolean,
    ): ReactElement => {
        const anchor = anchors[`${direction}:${port.name}`] ?? 0;
        // react-flow 对 Left / Right 句柄取外缘作为连线端点。句柄做成 6px 透明块：
        // 未连接时中心对准方块中心，已连接时对准实心点底部；视觉徽标独立渲染。
        const handleTop = anchor + (connected ? 10 : 7);

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
                inputs={data.inputs}
                outputs={data.outputs}
                connectedPorts={data.connectedPorts}
                // 运行期间也保留端口行，节点结构与高度不随只读状态变化。
                showInputSlots
                notice={data.notice}
                fieldOptions={data.fieldOptions}
                lockedFields={data.lockedFields}
                slotLabels={data.slotLabels}
            />

            {data.inputs.map((port) =>
                renderPort("in", port, connectedInputs.has(port.name)),
            )}

            {data.outputs.map((port) =>
                renderPort("out", port, connectedOutputs.has(port.name)),
            )}
        </div>
    );
}
