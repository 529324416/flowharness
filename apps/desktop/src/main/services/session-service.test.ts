import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BlobStore } from "./blob-store";
import { SessionService } from "./session-service";

const dirs: string[] = [];

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SessionService", () => {
    it("creates one attachment manager per workspace", async () => {
        const dir = await mkdtemp(join(tmpdir(), "fh-session-"));
        dirs.push(dir);
        const blobs = new BlobStore(join(dir, "objects"));
        const service = new SessionService(
            () => blobs,
            () => dir,
        );

        const first = service.attachmentsFor("ws_1");
        expect(first).toBeDefined();
        expect(service.attachmentsFor("ws_1")).toBe(first);

        service.close("ws_1");
        expect(service.attachmentsFor("ws_1")).not.toBe(first);
    });

    it("provides a workspace session store", async () => {
        const dir = await mkdtemp(join(tmpdir(), "fh-session-"));
        dirs.push(dir);
        const service = new SessionService(
            () => undefined,
            () => dir,
        );

        const store = service.sessionsFor("ws_1");
        expect(store).toBeDefined();
        const created = await store!.create({ title: "测试会话" });
        expect((await store!.list())[0]?.title).toBe("测试会话");
        expect(created.id.startsWith("ses_")).toBe(true);
    });

    it("returns undefined for a closed workspace", () => {
        const service = new SessionService(
            () => undefined,
            () => undefined,
        );
        expect(service.attachmentsFor("ws_missing")).toBeUndefined();
        expect(service.sessionsFor("ws_missing")).toBeUndefined();
    });
});
