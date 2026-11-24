import type { CanvasPort, CanvasStatus } from "../canvas/core/types";

export type InspectorNodeModel = {
    id: string;
    type: string;
    typeVersion: number;
    title: string;
    status: CanvasStatus;
    inputs: readonly CanvasPort[];
    outputs: readonly CanvasPort[];
    requirements: readonly string[];
    config: unknown;
    error?: string;
};

export type InspectorGraphModel = {
    id: string;
    title?: string;
    nodeCount: number;
    edgeCount: number;
    viewport: { x: number; y: number; zoom: number };
};

export type InspectorModel = {
    graph: InspectorGraphModel | null;
    node: InspectorNodeModel | null;
    canEdit: boolean;
    onUpdateConfig: (nodeId: string, config: unknown) => void;
};
