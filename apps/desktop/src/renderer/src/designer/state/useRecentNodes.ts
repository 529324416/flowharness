import { useCallback, useState } from "react";
import {
    pushRecentNode,
    readRecentNodes,
    writeRecentNodes,
    type RecentNodeEntry,
} from "./recent-nodes";

export type UseRecentNodesResult = {
    entries: readonly RecentNodeEntry[];
    record: (entry: RecentNodeEntry) => void;
};

/** 节点库最近使用：localStorage 持久化，去重后最多 6 条。 */
export function useRecentNodes(): UseRecentNodesResult {
    const [entries, setEntries] = useState<readonly RecentNodeEntry[]>(() =>
        readRecentNodes(browserStorage()),
    );

    const record = useCallback((entry: RecentNodeEntry): void => {
        setEntries((previous) => {
            const next = pushRecentNode(previous, entry);
            writeRecentNodes(browserStorage(), next);
            return next;
        });
    }, []);

    return { entries, record };
}

function browserStorage(): Storage | undefined {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}
