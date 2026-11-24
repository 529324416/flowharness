/**
 * 最近打开的 Harness 文档（按工作区隔离）。
 *
 * 纯函数负责去重 / 截断 / 解析；localStorage 由调用方注入，
 * 便于在 node 环境单测。
 */
export const RECENT_DOCUMENTS_LIMIT = 6;
const RECENT_DOCUMENTS_PREFIX = "fh.documents.recent.v1:";

export function recentDocumentsKey(workspaceId: string): string {
    return `${RECENT_DOCUMENTS_PREFIX}${workspaceId}`;
}

export function parseRecentDocuments(raw: string | null): readonly string[] {
    if (raw === null || raw.length === 0) return [];

    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(value)) return [];

    const ids: string[] = [];
    for (const item of value) {
        if (typeof item !== "string" || item.length === 0) continue;
        if (ids.includes(item)) continue;
        ids.push(item);
        if (ids.length >= RECENT_DOCUMENTS_LIMIT) break;
    }
    return ids;
}

export function pushRecentDocument(
    list: readonly string[],
    id: string,
    limit: number = RECENT_DOCUMENTS_LIMIT,
): readonly string[] {
    return [id, ...list.filter((item) => item !== id)].slice(0, limit);
}

export function readRecentDocuments(
    storage: Pick<Storage, "getItem"> | undefined,
    workspaceId: string,
): readonly string[] {
    if (storage === undefined) return [];
    try {
        return parseRecentDocuments(
            storage.getItem(recentDocumentsKey(workspaceId)),
        );
    } catch {
        return [];
    }
}

export function writeRecentDocuments(
    storage: Pick<Storage, "setItem"> | undefined,
    workspaceId: string,
    ids: readonly string[],
): void {
    if (storage === undefined) return;
    try {
        storage.setItem(recentDocumentsKey(workspaceId), JSON.stringify(ids));
    } catch {
        // 存储不可用时保持内存状态。
    }
}
