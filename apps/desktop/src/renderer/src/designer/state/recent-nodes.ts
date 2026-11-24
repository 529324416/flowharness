/**
 * 节点库「最近使用」：类型与预设共用一份列表。
 *
 * 纯函数负责去重 / 截断 / 解析；localStorage 读写由 hook 负责，
 * 这样可以在 node 环境的单测里直接验证。
 */
export type RecentNodeEntry =
    | { kind: "type"; id: string }
    | { kind: "preset"; id: string };

export const RECENT_NODES_KEY = "fh.nodeLibrary.recent.v1";
export const RECENT_NODES_LIMIT = 6;

/** 把 entry 放到最前；已存在时先移除，再截断到 limit。 */
export function pushRecentNode(
    list: readonly RecentNodeEntry[],
    entry: RecentNodeEntry,
    limit: number = RECENT_NODES_LIMIT,
): readonly RecentNodeEntry[] {
    const rest = list.filter(
        (item) => !(item.kind === entry.kind && item.id === entry.id),
    );
    return [entry, ...rest].slice(0, limit);
}

/** 宽容解析：坏 JSON / 非法条目直接丢弃，不抛错。 */
export function parseRecentNodes(raw: string | null): readonly RecentNodeEntry[] {
    if (raw === null || raw.length === 0) return [];

    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(value)) return [];

    const entries: RecentNodeEntry[] = [];
    for (const item of value) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
        const record = item as Record<string, unknown>;
        const kind = record.kind;
        const id = record.id;
        if ((kind === "type" || kind === "preset") && typeof id === "string" && id.length > 0) {
            entries.push({ kind, id });
        }
        if (entries.length >= RECENT_NODES_LIMIT) break;
    }
    return entries;
}

export function readRecentNodes(
    storage: Pick<Storage, "getItem"> | undefined,
): readonly RecentNodeEntry[] {
    if (storage === undefined) return [];
    try {
        return parseRecentNodes(storage.getItem(RECENT_NODES_KEY));
    } catch {
        return [];
    }
}

export function writeRecentNodes(
    storage: Pick<Storage, "setItem"> | undefined,
    entries: readonly RecentNodeEntry[],
): void {
    if (storage === undefined) return;
    try {
        storage.setItem(RECENT_NODES_KEY, JSON.stringify(entries));
    } catch {
        // 存储不可用时保持内存状态。
    }
}
