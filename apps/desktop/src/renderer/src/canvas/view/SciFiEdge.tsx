import type { CSSProperties, ReactElement } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { cx } from "../../ui/cx";
import type { FlowEdge } from "./flow-types";
import styles from "./SciFiEdge.module.css";

export function SciFiEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
}: EdgeProps<FlowEdge>): ReactElement {
    const [path] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        curvature: 0.28,
    });

    const active = data?.status === "active";
    const error = data?.status === "error";
    // 动画态用中性灰做底，白色扫过段由 `.flow` 叠加，形成「半白半灰」的进度感。
    const tone = active
        ? "var(--fh-border-strong)"
        : error
          ? "var(--fh-danger)"
          : "var(--fh-edge)";

    return (
        <g
            className={cx(styles.group, selected && styles.selected)}
            style={{ "--edge-tone": tone } as CSSProperties}
        >
            <BaseEdge
                id={id}
                path={path}
                className={cx(
                    styles.base,
                    active && styles.active,
                    error && styles.error,
                )}
                interactionWidth={20}
                style={{
                    stroke: tone,
                    strokeWidth: 1.4,
                    strokeOpacity: active ? 0.86 : 0.75,
                    strokeDasharray: error ? "5 5" : undefined,
                }}
            />

            {active ? (
                <path
                    d={path}
                    pathLength={100}
                    className={styles.flow}
                />
            ) : null}
        </g>
    );
}
