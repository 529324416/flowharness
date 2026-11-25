import type { ReactElement } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cx } from "../../ui/cx";
import { CANVAS_METRICS } from "../metrics";
import type { FlowNode } from "./flow-types";
import { NodeVisual } from "./NodeVisual";
import styles from "./SciFiNode.module.css";

const HEADER_HEIGHT = CANVAS_METRICS.nodeHeaderHeight;
const PORT_TOP = HEADER_HEIGHT + 8;
const PORT_BOTTOM = 8;

/**
 * 把第 index 个端口放在 header 与 body 之间。
 *
 * top = S + f * (H - S - E) = (S - f*(S+E)) + f*100%，
 * 这样只需 px + 百分比，不依赖 CSS 乘法。
 */
function portTop(index: number, count: number): string {
    const fraction = (index + 1) / (count + 1);
    const offset = PORT_TOP - fraction * (PORT_TOP + PORT_BOTTOM);
    return `calc(${offset.toFixed(2)}px + ${(fraction * 100).toFixed(2)}%)`;
}

function nodeMinHeight(inputCount: number, outputCount: number): number | undefined {
    const portCount = Math.max(inputCount, outputCount);
    if (portCount <= 2) return undefined;
    return HEADER_HEIGHT + 16 + (portCount - 1) * 14;
}

export function SciFiNode({
    id,
    data,
    selected,
    isConnectable,
}: NodeProps<FlowNode>): ReactElement {
    return (
        <div
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
                showInputSlots={!data.readOnly}
                minHeight={nodeMinHeight(data.inputs.length, data.outputs.length)}
            />

            {data.inputs.map((port, index) => (
                <Handle
                    key={`in:${port.name}`}
                    type="target"
                    position={Position.Left}
                    id={port.name}
                    isConnectable={isConnectable}
                    className={cx(styles.handle, styles.in)}
                    style={{ top: portTop(index, data.inputs.length) }}
                />
            ))}

            {data.outputs.map((port, index) => (
                <Handle
                    key={`out:${port.name}`}
                    type="source"
                    position={Position.Right}
                    id={port.name}
                    isConnectable={isConnectable}
                    className={cx(styles.handle, styles.out)}
                    style={{ top: portTop(index, data.outputs.length) }}
                />
            ))}
        </div>
    );
}
