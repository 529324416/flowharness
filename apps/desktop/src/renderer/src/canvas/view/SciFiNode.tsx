import type { ReactElement } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cx } from "../../ui/cx";
import type { CanvasNode } from "../core/types";
import { NodeVisual } from "./NodeVisual";
import styles from "./SciFiNode.module.css";

export function SciFiNode({ id, data, selected }: NodeProps<CanvasNode>): ReactElement {
    const hasInput = (data.inputs ?? 0) > 0;
    const hasOutput = (data.outputs ?? 0) > 0;

    return (
        <div
            className={cx(
                styles.wrapper,
                styles[data.status],
                selected && styles.selected,
            )}
        >
            <NodeVisual
                id={id}
                title={data.title}
                kind={data.kind}
                status={data.status}
                summary={data.summary}
                meta={data.meta}
                inputs={data.inputs}
                outputs={data.outputs}
                selected={selected}
            />

            {hasInput ? (
                <>
                    <Handle
                        type="target"
                        position={Position.Left}
                        id="in"
                        className={cx(styles.handle, styles.in)}
                    />
                    <span className={cx(styles.portLabel, styles.portIn)} aria-hidden="true">
                        IN
                    </span>
                </>
            ) : null}

            {hasOutput ? (
                <>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="out"
                        className={cx(styles.handle, styles.out)}
                    />
                    <span className={cx(styles.portLabel, styles.portOut)} aria-hidden="true">
                        OUT
                    </span>
                </>
            ) : null}
        </div>
    );
}
