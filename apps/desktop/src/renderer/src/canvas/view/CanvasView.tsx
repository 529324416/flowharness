import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactElement,
} from "react";
import {
    Background,
    BackgroundVariant,
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
import type {
    CanvasCommand,
    CanvasDocument,
    CanvasNodeData,
    CanvasStatus,
} from "../core/types";
import { createNodeTypes } from "./node-registry";
import { SciFiEdge } from "./SciFiEdge";
import type { FlowEdge, FlowNode } from "./flow-types";
import styles from "./CanvasView.module.css";

const EDGE_TYPES = { sciFi: SciFiEdge };

const STATUS_COLOR: Record<CanvasStatus, string> = {
    idle: "#3f4a54",
    running: "#7b8f91",
    paused: "#8a7b52",
    completed: "#5a6b70",
    failed: "#a85b5b",
    skipped: "#4a555e",
};

type MenuState = {
    x: number;
    y: number;
    nodeId?: string;
};

export type CanvasViewProps = {
    document: CanvasDocument;
    title?: string;
    selectedNodeId?: string | null;
    onSelectNode?: (nodeId: string | null) => void;
    onCommand?: (command: CanvasCommand) => void;
    readOnly?: boolean;
    nodeStatuses?: Readonly<Record<string, CanvasStatus>>;
    /** 右键菜单「添加节点」；位置是视口坐标（clientX / clientY）。 */
    onAddNode?: (position: { x: number; y: number }) => void;
};

function toFlowNodes(
    document: CanvasDocument,
    selectedNodeId: string | null | undefined,
    nodeStatuses: Readonly<Record<string, CanvasStatus>> | undefined,
): FlowNode[] {
    return document.nodes.map((node) => {
        const data: CanvasNodeData = {
            ...node.data,
            status: nodeStatuses?.[node.id] ?? node.data.status,
        };

        return {
            id: node.id,
            type: node.kind,
            position: node.position,
            data,
            selected: node.id === selectedNodeId,
        };
    });
}

function toFlowEdges(document: CanvasDocument): FlowEdge[] {
    return document.edges.map((edge) => ({
        id: edge.id,
        source: edge.source.nodeId,
        target: edge.target.nodeId,
        sourceHandle: edge.source.port,
        targetHandle: edge.target.port,
        type: "sciFi",
        data: { status: edge.status },
    }));
}

export function CanvasView({
    document,
    title,
    selectedNodeId,
    onSelectNode,
    onCommand,
    readOnly = false,
    nodeStatuses,
    onAddNode,
}: CanvasViewProps): ReactElement {
    const rootRef = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(
        toFlowNodes(document, selectedNodeId, nodeStatuses),
    );
    const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(
        toFlowEdges(document),
    );
    const [menu, setMenu] = useState<MenuState | null>(null);
    const [instance, setInstance] = useState<ReactFlowInstance<
        FlowNode,
        FlowEdge
    > | null>(null);

    // 文档是事实源：外部加载/命令回写后重新投影；拖拽中间态只存在本地 view state。
    useEffect(() => {
        setNodes(toFlowNodes(document, selectedNodeId, nodeStatuses));
        setEdges(toFlowEdges(document));
    }, [document, selectedNodeId, nodeStatuses, setNodes, setEdges]);

    const kindsKey = useMemo(
        () =>
            [...new Set(document.nodes.map((node) => node.kind))]
                .sort()
                .join("|"),
        [document.nodes],
    );
    const nodeTypes = useMemo(
        () => createNodeTypes(kindsKey.length === 0 ? [] : kindsKey.split("|")),
        [kindsKey],
    );

    /**
     * 边框/圆角按 1/zoom 反向缩放（见 NodeVisual.module.css），
     * 让屏幕上的描边始终是 1px，避免缩小后圆角发虚。
     */
    const syncZoom = useCallback((zoom: number) => {
        rootRef.current?.style.setProperty("--fh-canvas-zoom", String(zoom));
    }, []);

    const handleInit = useCallback(
        (flow: ReactFlowInstance<FlowNode, FlowEdge>) => {
            setInstance(flow);
            syncZoom(flow.getZoom());
        },
        [syncZoom],
    );

    const handleConnect = useCallback(
        (connection: Connection) => {
            if (readOnly) return;

            const { source, target, sourceHandle, targetHandle } = connection;
            if (!source || !target || !sourceHandle || !targetHandle) return;

            onCommand?.({
                type: "connect",
                from: { nodeId: source, port: sourceHandle },
                to: { nodeId: target, port: targetHandle },
            });
        },
        [onCommand, readOnly],
    );

    const handleNodeDragStop = useCallback(
        (_event: MouseEvent | TouchEvent, node: FlowNode, dragged: FlowNode[]) => {
            if (readOnly) return;

            const moved = dragged.filter(
                (candidate) => candidate.selected || candidate.id === node.id,
            );
            if (moved.length === 0) return;

            onCommand?.({
                type: "moveNodes",
                positions: moved.map((candidate) => ({
                    nodeId: candidate.id,
                    position: { ...candidate.position },
                })),
            });
        },
        [onCommand, readOnly],
    );

    const handleNodesDelete = useCallback(
        (deleted: FlowNode[]) => {
            if (readOnly || deleted.length === 0) return;

            onCommand?.({
                type: "removeNodes",
                nodeIds: deleted.map((node) => node.id),
            });
        },
        [onCommand, readOnly],
    );

    const handleEdgesDelete = useCallback(
        (deleted: FlowEdge[]) => {
            if (readOnly) return;

            for (const edge of deleted) {
                if (!edge.sourceHandle || !edge.targetHandle) continue;
                onCommand?.({
                    type: "disconnect",
                    from: { nodeId: edge.source, port: edge.sourceHandle },
                    to: { nodeId: edge.target, port: edge.targetHandle },
                });
            }
        },
        [onCommand, readOnly],
    );

    const handleNodeClick = useCallback(
        (_event: React.MouseEvent, node: FlowNode) => {
            setMenu(null);
            onSelectNode?.(node.id);
        },
        [onSelectNode],
    );

    const handleMoveEnd = useCallback(
        (viewport: { x: number; y: number; zoom: number }) => {
            if (readOnly) return;
            onCommand?.({
                type: "setViewport",
                viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
            });
        },
        [onCommand, readOnly],
    );

    const handlePaneClick = useCallback(() => {
        setMenu(null);
        onSelectNode?.(null);
    }, [onSelectNode]);

    const openMenu = (
        event: MouseEvent | React.MouseEvent,
        nodeId?: string,
    ): void => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY, nodeId });
        if (nodeId) onSelectNode?.(nodeId);
    };

    const deleteNode = (): void => {
        if (!menu?.nodeId || readOnly) return;

        onCommand?.({ type: "removeNodes", nodeIds: [menu.nodeId] });
        setMenu(null);
    };

    const addNode = (): void => {
        if (readOnly) return;

        onAddNode?.({ x: menu?.x ?? 0, y: menu?.y ?? 0 });
        setMenu(null);
    };

    const fitView = (): void => {
        void instance?.fitView({ padding: 0.22, duration: 300 });
        setMenu(null);
    };

    return (
        <div
            ref={rootRef}
            className={styles.root}
            style={
                {
                    "--fh-node-width": `${String(CANVAS_METRICS.nodeWidth)}px`,
                    "--fh-node-header-height": `${String(CANVAS_METRICS.nodeHeaderHeight)}px`,
                    "--fh-port-size": `${String(CANVAS_METRICS.portSize)}px`,
                    "--fh-port-hit-size": `${String(CANVAS_METRICS.portHitSize)}px`,
                    "--fh-edge-width": `${String(CANVAS_METRICS.edgeWidth)}px`,
                } as CSSProperties
            }
        >
            <ReactFlow<FlowNode, FlowEdge>
                className={styles.flow}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={EDGE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={readOnly ? undefined : handleConnect}
                onNodesDelete={handleNodesDelete}
                onEdgesDelete={handleEdgesDelete}
                onNodeDragStop={handleNodeDragStop}
                onNodeClick={handleNodeClick}
                onInit={handleInit}
                onMove={(_, viewport) => syncZoom(viewport.zoom)}
                onMoveEnd={(_, viewport) => handleMoveEnd(viewport)}
                onPaneClick={handlePaneClick}
                onPaneContextMenu={(event) => openMenu(event)}
                onNodeContextMenu={(event, node) => openMenu(event, node.id)}
                defaultViewport={document.viewport}
                minZoom={CANVAS_METRICS.minZoom}
                maxZoom={CANVAS_METRICS.maxZoom}
                snapToGrid
                snapGrid={[CANVAS_METRICS.gridSize, CANVAS_METRICS.gridSize]}
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                edgesReconnectable={false}
                deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
                proOptions={{ hideAttribution: true }}
            >
                <Background
                    variant={BackgroundVariant.Lines}
                    gap={CANVAS_METRICS.gridSize}
                    size={1}
                    color="var(--fh-canvas-grid)"
                />

                <Panel position="top-left" className={styles.label}>
                    <span className={styles.liveDot} aria-hidden="true" />
                    <span className={styles.labelKind}>CANVAS / LIVE</span>
                    <span className={styles.labelTitle}>
                        {title ?? "示例工作流"}
                    </span>
                    <span className={styles.labelCount}>
                        {document.nodes.length} nodes · {document.edges.length} edges
                    </span>
                </Panel>

                <MiniMap
                    position="bottom-right"
                    pannable
                    zoomable
                    className={styles.minimap}
                    maskColor="rgb(4 8 9 / 0.74)"
                    nodeColor={(node: Node) =>
                        STATUS_COLOR[(node as FlowNode).data.status]
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
                        {!readOnly ? (
                            <button
                                type="button"
                                className={styles.menuItem}
                                role="menuitem"
                                onClick={addNode}
                            >
                                添加节点
                            </button>
                        ) : null}
                        {menu.nodeId && !readOnly ? (
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
                    </div>
                </>
            ) : null}
        </div>
    );
}
