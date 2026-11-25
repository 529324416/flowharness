import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore } from "./session-store";

const ATTACHMENT_HASH = "a".repeat(64);

const dirs: string[] = [];

async function makeStoreIn(): Promise<{ store: SessionStore; dir: string }> {
    const dir = await mkdtemp(join(tmpdir(), "fh-session-store-"));
    dirs.push(dir);
    return { store: new SessionStore(dir), dir };
}

async function makeStore(): Promise<SessionStore> {
    return (await makeStoreIn()).store;
}

afterEach(async () => {
    await Promise.all(
        dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
});

describe("SessionStore", () => {
    it("creates, lists and reads sessions with wireclaw history", async () => {
        const store = await makeStore();
        const created = await store.create({ title: "工单分诊" });

        expect(created.id.startsWith("ses_")).toBe(true);
        expect(created.messageCount).toBe(0);
        expect(created.history).toEqual({
            version: 2,
            id: created.id,
            messages: [],
            isArchived: false,
        });

        const list = await store.list();
        expect(list).toHaveLength(1);
        expect(list[0]?.title).toBe("工单分诊");
        expect((await store.read(created.id)).title).toBe("工单分诊");
    });

    it("derives messageCount and attachments from history", async () => {
        const store = await makeStore();
        const created = await store.create();

        const saved = await store.save({
            ...created,
            status: "completed",
            history: {
                version: 2,
                id: created.id,
                isArchived: false,
                messages: [
                    { role: "user", isCompressed: false, content: "hello" },
                    {
                        role: "user",
                        isCompressed: false,
                        content: [
                            { type: "text", text: "看图" },
                            {
                                type: "attachment",
                                attachment: { contentHash: ATTACHMENT_HASH },
                            },
                        ],
                    },
                ],
            },
            attachments: ["ignored"],
        });

        expect(saved.messageCount).toBe(2);
        expect(saved.attachments).toEqual([ATTACHMENT_HASH]);
        expect(saved.status).toBe("completed");
        expect(saved.history).toMatchObject({
            version: 2,
            id: created.id,
            messages: expect.any(Array),
        });

        const read = await store.read(created.id);
        expect(read.messageCount).toBe(2);
        expect(read.attachments).toEqual([ATTACHMENT_HASH]);
    });

    it("migrates legacy empty-array history on read", async () => {
        const { store, dir } = await makeStoreIn();
        const created = await store.create();
        const file = join(dir, created.id, "session.json");
        const raw = JSON.parse(await readFile(file, "utf8")) as Record<
            string,
            unknown
        >;

        await writeFile(file, JSON.stringify({ ...raw, history: [] }), "utf8");

        const read = await store.read(created.id);
        expect(read.history).toEqual({
            version: 2,
            id: created.id,
            messages: [],
            isArchived: false,
        });
    });

    it("rejects malformed history", async () => {
        const store = await makeStore();
        const created = await store.create();

        await expect(
            store.save({
                ...created,
                history: [{ role: "user", text: "legacy" }],
            }),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
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
