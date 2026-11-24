import type { CanvasPortRef } from "./types";

/**
 * 稳定的边 key：由 from / to 的端口地址推导。
 *
 * wireclaw 的 EdgeDocument 没有独立 id；画布不能另造一份会漂移的身份。
 */
export function edgeKeyFromPorts(from: CanvasPortRef, to: CanvasPortRef): string {
    return `${from.nodeId}:${from.port}->${to.nodeId}:${to.port}`;
}
