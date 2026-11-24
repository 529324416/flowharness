import type { ComponentType } from "react";
import type { NodeProps, NodeTypes } from "@xyflow/react";
import type { CanvasNode } from "../core/types";
import { SciFiNode } from "./SciFiNode";

export type CanvasNodeRenderer = ComponentType<NodeProps<CanvasNode>>;

const registry = new Map<string, CanvasNodeRenderer>();

export function registerNodeRenderer(kind: string, renderer: CanvasNodeRenderer): void {
    registry.set(kind, renderer);
}

export function getNodeRenderer(kind: string): CanvasNodeRenderer {
    return registry.get(kind) ?? SciFiNode;
}

export function createNodeTypes(kinds: Iterable<string>): NodeTypes {
    const types: NodeTypes = {};
    for (const kind of new Set(kinds)) {
        types[kind] = getNodeRenderer(kind) as NodeTypes[string];
    }
    return types;
}

// 默认 renderer；后续可按 node type 覆盖（例如 input 专用表单）。
for (const kind of [
    "core.input",
    "core.model-call",
    "core.branch",
    "core.output",
    "core.log-sink",
]) {
    registerNodeRenderer(kind, SciFiNode);
}
