import type { ReactElement } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { CANVAS_METRICS } from "../canvas/metrics";
import { Badge, IconButton } from "../ui";
import { NodeCard } from "./NodeCard";
import styles from "./CanvasPreview.module.css";

type PreviewNode = {
    id: string;
    x: number;
    y: number;
    title: string;
    kind: string;
    status: "idle" | "running" | "completed" | "failed" | "skipped";
    summary: string;
    selected?: boolean;
    inputs?: readonly number[];
    outputs?: readonly number[];
};

const NODES: readonly PreviewNode[] = [
    {
        id: "input",
        x: 24,
        y: 72,
        title: "Input",
        kind: "core.input",
        status: "completed",
        summary: "text · attachments",
        outputs: [56, 84],
    },
    {
        id: "model",
        x: 286,
        y: 48,
        title: "Model Call",
        kind: "core.model-call",
        status: "running",
        summary: "deepseek-chat · stream",
        selected: true,
        inputs: [70],
        outputs: [70],
    },
    {
        id: "output",
        x: 548,
        y: 132,
        title: "Output",
        kind: "core.output",
        status: "failed",
        summary: "text",
        inputs: [70],
    },
    {
        id: "branch",
        x: 286,
        y: 246,
        title: "Branch",
        kind: "core.branch",
        status: "skipped",
        summary: "has text?",
        inputs: [70],
        outputs: [70],
    },
    {
        id: "log",
        x: 548,
        y: 310,
        title: "Log Sink",
        kind: "core.log-sink",
        status: "idle",
        summary: "debug",
        inputs: [70],
    },
];

const SCENE_WIDTH = 780;
const SCENE_HEIGHT = 500;

type EdgeTone = "idle" | "active" | "error";

const EDGES: ReadonlyArray<{ id: string; d: string; tone: EdgeTone }> = [
    {
        id: "input-model",
        d: "M 244 128 C 320 128, 230 118, 286 118",
        tone: "active",
    },
    {
        id: "model-output",
        d: "M 506 118 C 560 118, 500 202, 548 202",
        tone: "error",
    },
    {
        id: "input-branch",
        d: "M 244 156 C 300 156, 244 316, 286 316",
        tone: "idle",
    },
    {
        id: "branch-log",
        d: "M 506 316 C 560 316, 520 380, 548 380",
        tone: "idle",
    },
];

function pathClass(tone: EdgeTone): string {
    if (tone === "active") return `${styles.edge} ${styles.edgeActive}`;
    if (tone === "error") return `${styles.edge} ${styles.edgeError}`;
    return styles.edge;
}

/** 画布静态视觉样张：验证节点、端口、连线、状态与附属控件。 */
export function CanvasPreview(): ReactElement {
    const minimapScaleX = CANVAS_METRICS.minimapWidth / SCENE_WIDTH;
    const minimapScaleY = CANVAS_METRICS.minimapHeight / SCENE_HEIGHT;

    return (
        <div className={styles.root}>
            <div className={styles.note}>
                <Badge variant="accent">画布视觉样张</Badge>
                <span>交互将在 Phase 3 接入</span>
            </div>

            <div className={styles.scene} role="img" aria-label="画布视觉预览：节点与连线">
                <svg
                    className={styles.edges}
                    viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
                    aria-hidden="true"
                >
                    {EDGES.map((edge) => (
                        <path key={edge.id} d={edge.d} className={pathClass(edge.tone)} />
                    ))}
                </svg>

                {NODES.map((node) => (
                    <NodeCard
                        key={node.id}
                        title={node.title}
                        kind={node.kind}
                        status={node.status}
                        summary={node.summary}
                        selected={node.selected}
                        inputs={node.inputs}
                        outputs={node.outputs}
                        style={{ left: node.x, top: node.y }}
                    />
                ))}
            </div>

            <div className={styles.controls}>
                <IconButton label="缩小（Phase 3）" size="sm" disabled>
                    <ZoomOut size={14} aria-hidden="true" />
                </IconButton>
                <span className={styles.zoom}>100%</span>
                <IconButton label="放大（Phase 3）" size="sm" disabled>
                    <ZoomIn size={14} aria-hidden="true" />
                </IconButton>
                <IconButton label="适配视图（Phase 3）" size="sm" disabled>
                    <Maximize2 size={14} aria-hidden="true" />
                </IconButton>
            </div>

            <div className={styles.minimap} aria-hidden="true">
                <div className={styles.minimapViewport} />
                {NODES.map((node) => (
                    <span
                        key={node.id}
                        className={styles.minimapNode}
                        style={{
                            left: 6 + node.x * minimapScaleX,
                            top: 4 + node.y * minimapScaleY,
                            width: CANVAS_METRICS.nodeWidth * minimapScaleX,
                            height: 18,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
