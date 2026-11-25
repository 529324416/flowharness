/** 判断两次节点选择是否等价（顺序无关）；用于阻断画布选中回调循环。 */
export function sameNodeSelection(
    a: readonly string[],
    b: readonly string[],
): boolean {
    if (a.length !== b.length) return false;
    if (a.length === 0) return true;
    const set = new Set(a);
    for (const id of b) {
        if (!set.has(id)) return false;
    }
    return true;
}
