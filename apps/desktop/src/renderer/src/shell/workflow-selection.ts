/**
 * 工作流列表多选状态（纯函数）。
 *
 * 列表点击语义：
 * - 普通点击：只打开该工作流，并清空多选；
 * - Ctrl / Cmd + 点击：切换单项；
 * - Shift + 点击：以最近一次点击为锚点选择连续区间。
 */
export function toggleSelected(
    selected: ReadonlySet<string>,
    id: string,
): Set<string> {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

/** 从锚点到目标的连续区间（含两端）；锚点失效时退化为单选目标。 */
export function selectRange(
    orderedIds: readonly string[],
    anchor: string | null,
    target: string,
): Set<string> {
    const targetIndex = orderedIds.indexOf(target);
    if (targetIndex < 0) return new Set([target]);

    const anchorIndex = anchor === null ? -1 : orderedIds.indexOf(anchor);
    if (anchorIndex < 0) return new Set([target]);

    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    return new Set(orderedIds.slice(start, end + 1));
}

/** 文档列表刷新后丢弃已删除项；没有变化时返回原引用。 */
export function pruneSelection(
    selected: ReadonlySet<string>,
    existingIds: readonly string[],
): ReadonlySet<string> {
    const existing = new Set(existingIds);
    const next = new Set([...selected].filter((id) => existing.has(id)));
    return next.size === selected.size ? selected : next;
}

/** 选中项按列表顺序排列，便于批量操作文案与结果稳定。 */
export function orderedSelection(
    selected: ReadonlySet<string>,
    orderedIds: readonly string[],
): readonly string[] {
    return orderedIds.filter((id) => selected.has(id));
}
