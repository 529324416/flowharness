import { describe, expect, it } from "vitest";
import {
    parseRecentNodes,
    pushRecentNode,
    readRecentNodes,
    RECENT_NODES_KEY,
    RECENT_NODES_LIMIT,
    writeRecentNodes,
} from "./recent-nodes";

describe("recent node entries", () => {
    it("puts the newest entry first, dedupes and truncates", () => {
        let list = pushRecentNode([], { kind: "type", id: "core.constant" });
        list = pushRecentNode(list, { kind: "type", id: "core.output" });
        list = pushRecentNode(list, { kind: "type", id: "core.constant" });

        expect(list.map((entry) => entry.id)).toEqual([
            "core.constant",
            "core.output",
        ]);

        for (let index = 0; index < 10; index += 1) {
            list = pushRecentNode(list, { kind: "type", id: `core.type-${index}` });
        }
        expect(list).toHaveLength(RECENT_NODES_LIMIT);
        expect(list[0]?.id).toBe("core.type-9");
    });

    it("keeps type and preset entries separate", () => {
        const list = pushRecentNode(
            [{ kind: "preset", id: "same-id" }],
            { kind: "type", id: "same-id" },
        );
        expect(list).toHaveLength(2);
    });

    it("tolerates invalid JSON and invalid items", () => {
        expect(parseRecentNodes("not json")).toEqual([]);
        expect(parseRecentNodes(null)).toEqual([]);
        expect(parseRecentNodes("[]")).toEqual([]);
        expect(
            parseRecentNodes(
                JSON.stringify([
                    { kind: "type", id: "core.constant" },
                    { kind: "bad", id: "x" },
                    { kind: "type", id: "" },
                    null,
                    { kind: "preset", id: "preset.text-constant" },
                ]),
            ),
        ).toEqual([
            { kind: "type", id: "core.constant" },
            { kind: "preset", id: "preset.text-constant" },
        ]);
    });

    it("reads and writes through a storage adapter", () => {
        const store = new Map<string, string>();
        const storage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => {
                store.set(key, value);
            },
        };

        expect(readRecentNodes(storage)).toEqual([]);

        const entries = [{ kind: "type" as const, id: "core.constant" }];
        writeRecentNodes(storage, entries);

        expect(store.get(RECENT_NODES_KEY)).toBe(JSON.stringify(entries));
        expect(readRecentNodes(storage)).toEqual(entries);
    });
});
