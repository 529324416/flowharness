import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StoredAttachment } from "wireclaw";
import { BlobStore } from "./blob-store";
import { WorkspaceFileHost } from "./workspace-file-host";

const dirs: string[] = [];

async function makeHost(): Promise<WorkspaceFileHost> {
    const dir = await mkdtemp(join(tmpdir(), "fh-filehost-"));
    dirs.push(dir);
    return new WorkspaceFileHost(new BlobStore(join(dir, "objects")));
}

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function attachment(content: string, sourcePaths: string[] = []): StoredAttachment {
    const bytes = new TextEncoder().encode(content);
    return {
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        name: "note.txt",
        mimeType: "text/plain",
        size: bytes.byteLength,
        sourcePaths,
        content: bytes,
    };
}

describe("WorkspaceFileHost", () => {
    it("writes, reads and lists attachments", async () => {
        const host = await makeHost();
        const file = attachment("hello attachment", ["C:/tmp/note.txt"]);

        const meta = await host.write(file);
        expect(meta.contentHash).toBe(file.contentHash);
        expect(meta.sourcePaths).toEqual(["C:/tmp/note.txt"]);

        const stored = await host.read(file.contentHash);
        expect(stored?.name).toBe("note.txt");
        expect(stored?.content).toEqual(file.content);
        expect(await host.read("0".repeat(64))).toBeUndefined();

        const list = await host.list();
        expect(list).toHaveLength(1);
        expect(list[0]?.contentHash).toBe(file.contentHash);
    });

    it("keeps first-write metadata and merges source paths", async () => {
        const host = await makeHost();
        const first = attachment("same bytes", ["C:/a.txt"]);
        const second = attachment("same bytes", ["C:/b.txt"]);

        await host.write(first);
        const meta = await host.write(second);

        expect(meta.name).toBe("note.txt");
        expect(meta.sourcePaths).toEqual(["C:/a.txt", "C:/b.txt"]);
    });

    it("deletes attachments", async () => {
        const host = await makeHost();
        const file = attachment("delete me");

        await host.write(file);
        expect(await host.delete(file.contentHash)).toBe(true);
        expect(await host.read(file.contentHash)).toBeUndefined();
    });

    it("rejects a contentHash that does not match the bytes", async () => {
        const host = await makeHost();
        const file = attachment("real content");

        await expect(
            host.write({ ...file, contentHash: "f".repeat(64) }),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });
});
