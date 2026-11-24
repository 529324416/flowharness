import { describe, expect, it } from "vitest";
import {
    parseRecentDocuments,
    pushRecentDocument,
    readRecentDocuments,
    RECENT_DOCUMENTS_LIMIT,
    recentDocumentsKey,
    writeRecentDocuments,
} from "./recent-documents";

describe("recent documents", () => {
    it("puts the newest first, dedupes and truncates", () => {
        let ids = pushRecentDocument([], "graph-a");
        ids = pushRecentDocument(ids, "graph-b");
        ids = pushRecentDocument(ids, "graph-a");

        expect(ids).toEqual(["graph-a", "graph-b"]);

        for (let index = 0; index < 10; index += 1) {
            ids = pushRecentDocument(ids, `graph-${String(index)}`);
        }
        expect(ids).toHaveLength(RECENT_DOCUMENTS_LIMIT);
        expect(ids[0]).toBe("graph-9");
    });

    it("tolerates invalid JSON and invalid items", () => {
        expect(parseRecentDocuments("not json")).toEqual([]);
        expect(parseRecentDocuments(null)).toEqual([]);
        expect(parseRecentDocuments("[]")).toEqual([]);
        expect(
            parseRecentDocuments(
                JSON.stringify(["graph-a", "graph-a", 3, "", "graph-b"]),
            ),
        ).toEqual(["graph-a", "graph-b"]);
    });

    it("reads and writes per workspace", () => {
        const store = new Map<string, string>();
        const storage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => {
                store.set(key, value);
            },
        };

        expect(readRecentDocuments(storage, "ws_1")).toEqual([]);
        writeRecentDocuments(storage, "ws_1", ["graph-a"]);
        writeRecentDocuments(storage, "ws_2", ["graph-b"]);

        expect(readRecentDocuments(storage, "ws_1")).toEqual(["graph-a"]);
        expect(readRecentDocuments(storage, "ws_2")).toEqual(["graph-b"]);
        expect(store.get(recentDocumentsKey("ws_1"))).toBe(
            JSON.stringify(["graph-a"]),
        );
    });
});
