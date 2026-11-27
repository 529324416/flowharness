/** 常量节点非编辑态的正文裁剪长度。 */
export const CONSTANT_PREVIEW_LIMIT = 200;

/** 常量节点 hover tooltip 的裁剪长度。 */
export const CONSTANT_TOOLTIP_LIMIT = 400;

/**
 * 按字符数裁剪文本。
 *
 * 只做上限裁剪，不在中间插入省略号；调用方决定是否追加 `…`。
 */
export function truncateText(
    text: string,
    limit: number,
): { text: string; truncated: boolean } {
    if (limit <= 0) return { text: "", truncated: text.length > 0 };
    if (text.length <= limit) return { text, truncated: false };
    return { text: text.slice(0, limit), truncated: true };
}
