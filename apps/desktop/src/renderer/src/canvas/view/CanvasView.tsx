import { useCallback, useMemo, useState, type ReactElement } from "react";
import {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    Panel,
    ReactFlow,
    useEdgesState,
    useNodesState,
    type Connection,
    type Node,
    type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CANVAS_METRICS } from "../metrics";
import type { CanvasEdge, CanvasNode, CanvasStatus } from "../core/types";
import { addEdgeUnique } from "../core/commands";
import { edgeKey } from "../core/edge-key";
import { createSampleGraph, SAMPLE_NODE_KINDS } from "../sample-graph";
import { createNodeTypes } from "./node-registry";
import { SciFiEdge } from "./SciFiEdge";
import styles from "./CanvasView.module.css";

const NODE_TYPES = createNodeTypes(SAMPLE_NODE_KINDS);
const EDGE_TYPES = { sciFi: SciFiEdge };
const HOME_VIEWPORT = { x: 24, y: 28, zoom: 1 };

const STATUS_COLOR: Record<CanvasStatus, string> = {
    idle: "#566b6e",
    running: "#ff7a45",
    paused: "#fbbf24",
    completed: "#34d399",
    failed: "#f87171",
    skipped: "#7b8f92",
};

type MenuState = {
    x: number;
    y: number;
    nodeId?: string;
};

export type CanvasViewProps = {
    sessionTitle?: string;
};

export function CanvasView({ sessionTitle }: CanvasViewProps): ReactElement {
    const initial = useMemo(createSampleGraph, []);
    const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initial.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(initial.edges);
    const [menu, setMenu] = useState<MenuState | null>(null);
    const [instance, setInstance] = useState<ReactFlowInstance<
        CanvasNode,
        CanvasEdge
    > | null>(null);

    const onConnect = useCallback(
        (connection: Connection) => {
            setEdges((current) =>
                addEdgeUnique(current, {
                    id: edgeKey(connection),
                    type: "sciFi",
                    source: connection.source,
                    target: connection.target,
                    sourceHandle: connection.sourceHandle,
                    targetHandle: connection.targetHandle,
                    data: { status: "idle" },
                }),
            );
            setMenu(null);
        },
        [setEdges],
    );

    const onNodesDelete = useCallback(
        (deleted: CanvasNode[]) => {
            const ids = new Set(deleted.map((node) => node.id));
            setEdges((current) =>
                current.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
            );
        },
        [setEdges],
    );

    const openMenu = (
        event: MouseEvent | React.MouseEvent,
        nodeId?: string,
    ): void => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY, nodeId });
        if (nodeId) {
            setNodes((current) =>
                current.map((node) => ({ ...node, selected: node.id === nodeId })),
            );
        }
    };

    const deleteNode = (): void => {
        if (!menu?.nodeId) return;
        const id = menu.nodeId;
        setNodes((current) => current.filter((node) => node.id !== id));
        setEdges((current) =>
            current.filter((edge) => edge.source !== id && edge.target !== id),
        );
        setMenu(null);
    };

    const resetGraph = (): void => {
        const graph = createSampleGraph();
        setNodes(graph.nodes);
        setEdges(graph.edges);
        setMenu(null);
        void instance?.setViewport(HOME_VIEWPORT, { duration: 300 });
    };

    const fitView = (): void => {
        void instance?.fitView({ padding: 0.22, duration: 300 });
        setMenu(null);
    };

    return (
        <div className={styles.root}>
            <ReactFlow<CanvasNode, CanvasEdge>
                className={styles.flow}
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodesDelete={onNodesDelete}
                onInit={setInstance}
                onPaneClick={() => setMenu(null)}
                onNodeClick={() => setMenu(null)}
                onPaneContextMenu={(event) => openMenu(event)}
                onNodeContextMenu={(event, node) => openMenu(event, node.id)}
                defaultViewport={HOME_VIEWPORT}
                minZoom={CANVAS_METRICS.minZoom}
                maxZoom={CANVAS_METRICS.maxZoom}
                snapToGrid
                snapGrid={[CANVAS_METRICS.gridSize, CANVAS_METRICS.gridSize]}
                deleteKeyCode={["Backspace", "Delete"]}
                proOptions={{ hideAttribution: true }}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={CANVAS_METRICS.gridSize}
                    size={1}
                />

                <Panel position="top-left" className={styles.label}>
                    <span className={styles.liveDot} aria-hidden="true" />
                    <span className={styles.labelKind}>CANVAS / LIVE</span>
                    <span className={styles.labelTitle}>
                        {sessionTitle ?? "示例工作流"}
                    </span>
                    <span className={styles.labelCount}>
                        {nodes.length} nodes · {edges.length} edges
                    </span>
                </Panel>

                <Controls
                    position="bottom-left"
                    showInteractive={false}
                    className={styles.controls}
                />

                <MiniMap
                    position="bottom-right"
                    pannable
                    zoomable
                    className={styles.minimap}
                    maskColor="rgb(4 8 9 / 0.74)"
                    nodeColor={(node: Node) =>
                        STATUS_COLOR[(node as CanvasNode).data.status]
                    }
                    nodeStrokeWidth={2}
                />
            </ReactFlow>

            {menu ? (
                <>
                    <button
                        type="button"
                        className={styles.menuBackdrop}
                        aria-label="关闭画布菜单"
                        onClick={() => setMenu(null)}
                    />
                    <div
                        className={styles.menu}
                        style={{ left: menu.x, top: menu.y }}
                        role="menu"
                    >
                        {menu.nodeId ? (
                            <button
                                type="button"
                                className={styles.menuItem}
                                role="menuitem"
                                onClick={deleteNode}
                            >
                                删除节点
                                <kbd>Del</kbd>
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className={styles.menuItem}
                            role="menuitem"
                            onClick={fitView}
                        >
                            适配视图
                        </button>
                        <button
                            type="button"
                            className={styles.menuItem}
                            role="menuitem"
                            onClick={resetGraph}
                        >
                            重置示例图
                        </button>
                    </div>
                </>
            ) : null}
        </div>
    );
}
