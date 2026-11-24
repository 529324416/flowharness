import type { CSSProperties, ReactElement } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { cx } from "../../ui/cx";
import type { CanvasEdge } from "../core/types";
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
}: EdgeProps<CanvasEdge>): ReactElement {
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
    const tone = active
        ? "var(--fh-energy)"
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
                    strokeWidth: active ? 1.6 : 1.4,
                    strokeOpacity: active ? 0.92 : 0.75,
                    strokeDasharray: error ? "5 5" : undefined,
                }}
            />

            {active ? <path d={path} className={styles.flow} /> : null}

            <circle cx={sourceX} cy={sourceY} r={2.2} className={styles.endpoint} />
            <circle cx={targetX} cy={targetY} r={2.2} className={styles.endpoint} />
        </g>
    );
}
