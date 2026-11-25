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
    SelectionMode,
    useEdgesState,
    useNodesState,
    type Connection,
    type Node,
    type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CANVAS_METRICS } from "../metrics";
import { sameNodeSelection } from "../core/selection";
import type {
    CanvasCommand,
    CanvasDocument,
    CanvasPortRef,
    CanvasStatus,
} from "../core/types";
import type { FlowNodeData } from "./flow-types";
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
    /** 多选节点；第一个通常作为检查器的主选中项 */
    selectedNodeIds?: readonly string[];
    onSelectionChange?: (nodeIds: string[]) => void;
    onCommand?: (command: CanvasCommand) => void;
    readOnly?: boolean;
    nodeStatuses?: Readonly<Record<string, CanvasStatus>>;
    /** 右键菜单「添加节点」；位置是视口坐标（clientX / clientY）。 */
    onAddNode?: (position: { x: number; y: number }) => void;
    /** 问题面板定位：seq 变化时把视口聚焦到节点 */
    focusNode?: { nodeId: string; seq: number } | null;
    /** 节点内联编辑：写回该节点的 config。 */
    onUpdateNodeConfig?: (nodeId: string, config: unknown) => void;
};

function toFlowNodes(
    document: CanvasDocument,
    selectedNodeIds: readonly string[],
    nodeStatuses: Readonly<Record<string, CanvasStatus>> | undefined,
    onUpdateNodeConfig:
        | ((nodeId: string, config: unknown) => void)
        | undefined,
    readOnly: boolean,
): FlowNode[] {
    const selected = new Set(selectedNodeIds);
    return document.nodes.map((node) => {
        const data: FlowNodeData = {
            ...node.data,
            status: nodeStatuses?.[node.id] ?? node.data.status,
            ...(onUpdateNodeConfig === undefined
                ? {}
                : {
                      onUpdateConfig: (config: unknown) =>
                          onUpdateNodeConfig(node.id, config),
                  }),
            readOnly,
        };

        return {
            id: node.id,
            type: node.kind,
            position: node.position,
            data,
            selected: selected.has(node.id),
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
    selectedNodeIds = [],
    onSelectionChange,
    onCommand,
    readOnly = false,
    nodeStatuses,
    onAddNode,
    focusNode,
    onUpdateNodeConfig,
}: CanvasViewProps): ReactElement {
    const rootRef = useRef<HTMLDivElement>(null);
    const lastFocusSeq = useRef<number | null>(null);
    const rightPan = useRef<{ x: number; y: number; moved: boolean } | null>(null);
    const suppressContextMenu = useRef(false);
    const selectedIdsRef = useRef<readonly string[]>(selectedNodeIds);
    selectedIdsRef.current = selectedNodeIds;
    const lastSelectionKey = useRef(selectedNodeIds.join("|"));
    const connectFromRef = useRef<CanvasPortRef | null>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(
        toFlowNodes(
            document,
            selectedNodeIds,
            nodeStatuses,
            onUpdateNodeConfig,
            readOnly,
        ),
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
    // 选中状态单独同步，避免每次框选都重建节点对象导致闪烁。
    useEffect(() => {
        setNodes(
            toFlowNodes(
                document,
                selectedIdsRef.current,
                nodeStatuses,
                onUpdateNodeConfig,
                readOnly,
            ),
        );
        setEdges(toFlowEdges(document));
    }, [
        document,
        nodeStatuses,
        onUpdateNodeConfig,
        readOnly,
        setNodes,
        setEdges,
    ]);

    useEffect(() => {
        const key = selectedNodeIds.join("|");
        if (lastSelectionKey.current === key) return;
        lastSelectionKey.current = key;

        const selected = new Set(selectedNodeIds);
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const isSelected = selected.has(node.id);
                if (node.selected === isSelected) return node;
                changed = true;
                return { ...node, selected: isSelected };
            });
            return changed ? next : current;
        });
    }, [selectedNodeIds, setNodes]);

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

    // 问题面板选中节点后聚焦；seq 相同不重复触发，避免普通编辑重置视口。
    useEffect(() => {
        if (instance === null || focusNode === null || focusNode === undefined) return;
        if (lastFocusSeq.current === focusNode.seq) return;
        if (!document.nodes.some((node) => node.id === focusNode.nodeId)) return;

        lastFocusSeq.current = focusNode.seq;
        void instance.fitView({
            nodes: [{ id: focusNode.nodeId }],
            padding: 1.2,
            duration: 300,
            maxZoom: 1.4,
        });
    }, [document.nodes, focusNode, instance]);

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

    const handleConnectStart = useCallback(
        (
            _event: MouseEvent | TouchEvent,
            params: {
                nodeId: string | null;
                handleId: string | null;
                handleType: "source" | "target" | null;
            },
        ) => {
            if (params.handleType !== "source") return;
            if (params.nodeId === null || params.handleId === null) return;
            connectFromRef.current = {
                nodeId: params.nodeId,
                port: params.handleId,
            };
        },
        [],
    );

    /**
     * 连线可以落在左侧 Handle，也可以落在节点 Body 的输入端口槽。
     * React Flow 只在 Handle 上自动建边，这里补一层 body 落点判定。
     */
    const handleConnectEnd = useCallback(
        (event: MouseEvent | TouchEvent) => {
            const from = connectFromRef.current;
            connectFromRef.current = null;
            if (from === null || readOnly) return;

            const point =
                "clientX" in event ? event : event.changedTouches[0];
            if (point === undefined) return;

            const slot = window.document
                .elementFromPoint(point.clientX, point.clientY)
                ?.closest("[data-input-port]");
            if (!(slot instanceof HTMLElement)) return;

            const nodeElement = slot.closest("[data-node-id]");
            const nodeId = nodeElement?.getAttribute("data-node-id");
            const port = slot.getAttribute("data-input-port");
            if (!nodeId || !port) return;

            onCommand?.({
                type: "connect",
                from,
                to: { nodeId, port },
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

    const handleNodeClick = useCallback(() => {
        setMenu(null);
    }, []);

    const handleSelectionChange = useCallback(
        ({ nodes: selected }: { nodes: Node[] }) => {
            const ids = selected.map((node) => node.id);
            const current = selectedIdsRef.current;
            if (sameNodeSelection(ids, current)) return;

            // 先更新 ref：父组件 state 渲染前可能继续收到同一批 selection 事件。
            selectedIdsRef.current = ids;
            onSelectionChange?.(ids);
        },
        [onSelectionChange],
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
    }, []);

    /** 右键拖动画布后不再弹菜单；普通右键点击仍然弹出。 */
    const handleRootMouseDown = (event: React.MouseEvent): void => {
        if (event.button !== 2) return;
        rightPan.current = { x: event.clientX, y: event.clientY, moved: false };
        suppressContextMenu.current = false;
    };

    const handleRootMouseMove = (event: React.MouseEvent): void => {
        const pan = rightPan.current;
        if (pan === null) return;
        if (Math.abs(event.clientX - pan.x) > 4 || Math.abs(event.clientY - pan.y) > 4) {
            pan.moved = true;
            suppressContextMenu.current = true;
        }
    };

    const handleRootMouseUp = (event: React.MouseEvent): void => {
        if (event.button === 2) rightPan.current = null;
    };

    const openMenu = (
        event: MouseEvent | React.MouseEvent,
        nodeId?: string,
    ): void => {
        event.preventDefault();
        if (suppressContextMenu.current) {
            suppressContextMenu.current = false;
            return;
        }
        setMenu({ x: event.clientX, y: event.clientY, nodeId });
        if (nodeId) onSelectionChange?.([nodeId]);
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
            onMouseDown={handleRootMouseDown}
            onMouseMove={handleRootMouseMove}
            onMouseUp={handleRootMouseUp}
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
                onConnectStart={readOnly ? undefined : handleConnectStart}
                onConnectEnd={readOnly ? undefined : handleConnectEnd}
                onNodesDelete={handleNodesDelete}
                onEdgesDelete={handleEdgesDelete}
                onNodeDragStop={handleNodeDragStop}
                onNodeClick={handleNodeClick}
                onSelectionChange={handleSelectionChange}
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
                // 左键拖拽 = 框选；中键 / 右键拖拽 = 平移；右键单击仍弹菜单。
                selectionOnDrag
                selectionMode={SelectionMode.Partial}
                panOnDrag={[1, 2]}
                multiSelectionKeyCode={["Control", "Meta"]}
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
