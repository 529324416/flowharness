export type EdgeEndpoints = {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
};

/**
 * 稳定的边 key：同一对端口只允许一条边。
 * 不依赖 React Flow 生成的随机 id，便于持久化与 diff。
 */
export function edgeKey(edge: EdgeEndpoints): string {
    const sourceHandle = edge.sourceHandle ?? "out";
    const targetHandle = edge.targetHandle ?? "in";
    return `${edge.source}:${sourceHandle}->${edge.target}:${targetHandle}`;
}
