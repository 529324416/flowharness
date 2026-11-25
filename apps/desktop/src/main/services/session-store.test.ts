import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore } from "./session-store";

const dirs: string[] = [];

async function makeStore(): Promise<SessionStore> {
    const dir = await mkdtemp(join(tmpdir(), "fh-session-store-"));
    dirs.push(dir);
    return new SessionStore(dir);
}

afterEach(async () => {
    await Promise.all(
        dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
});

describe("SessionStore", () => {
    it("creates, lists and reads sessions", async () => {
        const store = await makeStore();
        const created = await store.create({ title: "工单分诊" });

        expect(created.id.startsWith("ses_")).toBe(true);
        expect(created.messageCount).toBe(0);

        const list = await store.list();
        expect(list).toHaveLength(1);
        expect(list[0]?.title).toBe("工单分诊");
        expect((await store.read(created.id)).title).toBe("工单分诊");
    });

    it("saves history and updates messageCount", async () => {
        const store = await makeStore();
        const created = await store.create();

        const saved = await store.save({
            ...created,
            status: "completed",
            history: [{ role: "user", text: "hello" }],
            attachments: ["sha256:abc"],
        });

        expect(saved.messageCount).toBe(1);
        expect(saved.status).toBe("completed");
        expect((await store.read(created.id)).attachments).toEqual([
            "sha256:abc",
        ]);
    });

    it("ensures a default session only when empty", async () => {
        const store = await makeStore();

        const first = await store.ensureDefault();
        const second = await store.ensureDefault();

        expect(second.id).toBe(first.id);
        expect(await store.list()).toHaveLength(1);
    });

    it("rejects malformed ids", async () => {
        const store = await makeStore();
        await expect(store.read("../escape")).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });
    });
});
