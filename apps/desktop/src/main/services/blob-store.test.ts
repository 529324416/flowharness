import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BlobStore } from "./blob-store";

const dirs: string[] = [];

async function makeStore(): Promise<{ store: BlobStore; root: string }> {
    const dir = await mkdtemp(join(tmpdir(), "fh-blobs-"));
    dirs.push(dir);
    const root = join(dir, "objects");
    return { store: new BlobStore(root), root };
}

function sha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

const encode = (value: string) => new TextEncoder().encode(value);

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("BlobStore", () => {
    it("stores content by sha256 and deduplicates", async () => {
        const { store } = await makeStore();
        const bytes = encode("hello blob");

        const first = await store.put(bytes, { name: "a.txt", mimeType: "text/plain" });
        const second = await store.put(bytes, {
            name: "b.txt",
            mimeType: "text/markdown",
            sourcePaths: ["C:/tmp/b.txt"],
        });

        expect(first.hash).toBe(sha256(bytes));
        expect(second.hash).toBe(first.hash);
        expect(second.name).toBe("a.txt");
        expect(second.mimeType).toBe("text/plain");
        expect(second.sourcePaths).toEqual(["C:/tmp/b.txt"]);

        expect(await store.list()).toHaveLength(1);
        expect(new TextDecoder().decode(await store.get(first.hash))).toBe("hello blob");
    });

    it("merges source paths on repeated writes", async () => {
        const { store } = await makeStore();
        const bytes = encode("same content");

        await store.put(bytes, { name: "a.txt", sourcePaths: ["C:/a.txt"] });
        const meta = await store.put(bytes, { name: "a.txt", sourcePaths: ["C:/b.txt"] });

        expect(meta.sourcePaths).toEqual(["C:/a.txt", "C:/b.txt"]);
    });

    it("deletes content and metadata", async () => {
        const { store } = await makeStore();
        const meta = await store.put(encode("delete me"), { name: "d.txt" });

        expect(await store.delete(meta.hash)).toBe(true);
        expect(await store.get(meta.hash)).toBeUndefined();
        expect(await store.stat(meta.hash)).toBeUndefined();
        expect(await store.delete(meta.hash)).toBe(false);
    });

    it("rebuilds the index from object files", async () => {
        const { store, root } = await makeStore();
        const meta = await store.put(encode("rebuild me"), { name: "r.txt" });

        await rm(join(root, "index.json"), { force: true });

        const rebuilt = new BlobStore(root);
        const added = await rebuilt.rebuildIndex();

        expect(added).toBe(1);
        expect(await rebuilt.stat(meta.hash)).toBeDefined();
        expect(await readdir(root)).toContain("index.json");
    });

    it("tracks refs", async () => {
        const { store } = await makeStore();
        const meta = await store.put(encode("ref me"), { name: "ref.txt" });

        const withRef = await store.addRef(meta.hash, { kind: "session", id: "s_1" });
        expect(withRef?.refs).toEqual([{ kind: "session", id: "s_1" }]);

        await store.addRef(meta.hash, { kind: "session", id: "s_1" });
        expect((await store.stat(meta.hash))?.refs).toHaveLength(1);

        const withoutRef = await store.removeRef(meta.hash, { kind: "session", id: "s_1" });
        expect(withoutRef?.refs).toHaveLength(0);
    });

    it("garbage collects unreferenced objects", async () => {
        const { store } = await makeStore();
        const keep = await store.put(encode("keep"), { name: "keep.txt" });
        const drop = await store.put(encode("drop"), { name: "drop.txt" });

        const removed = await store.gc([keep.hash]);

        expect(removed).toEqual([drop.hash]);
        expect(await store.get(keep.hash)).toBeDefined();
        expect(await store.get(drop.hash)).toBeUndefined();
    });

    it("rejects invalid hashes", async () => {
        const { store } = await makeStore();
        await expect(store.get("not-a-hash")).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });
    });
});
