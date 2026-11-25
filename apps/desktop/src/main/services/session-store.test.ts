import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionTreeNode } from "@flowharness/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore, type SessionStoreOptions } from "./session-store";

const ATTACHMENT_HASH = "a".repeat(64);

const dirs: string[] = [];

type TestSettings = { draftSessionFolderId?: string | null };

async function makeStoreIn(options: {
    settings?: TestSettings;
} = {}): Promise<{
    store: SessionStore;
    dir: string;
    settings: TestSettings;
}> {
    const dir = await mkdtemp(join(tmpdir(), "fh-session-store-"));
    dirs.push(dir);
    const state: TestSettings = { ...options.settings };
    const storeOptions: SessionStoreOptions = {
        getSettings: () => state,
        updateSettings: async (patch) => {
            Object.assign(state, patch);
        },
    };
    return { store: new SessionStore(dir, storeOptions), dir, settings: state };
}

async function makeStore(): Promise<SessionStore> {
    return (await makeStoreIn()).store;
}

function findFolder(
    nodes: readonly SessionTreeNode[],
    folderId: string,
): Extract<SessionTreeNode, { type: "folder" }> | undefined {
    for (const node of nodes) {
        if (node.type !== "folder") continue;
        if (node.folder.id === folderId) return node;
        const nested = findFolder(node.children, folderId);
        if (nested !== undefined) return nested;
    }
    return undefined;
}

function findSession(
    nodes: readonly SessionTreeNode[],
    sessionId: string,
): Extract<SessionTreeNode, { type: "session" }> | undefined {
    for (const node of nodes) {
        if (node.type === "session") {
            if (node.session.id === sessionId) return node;
            continue;
        }
        const nested = findSession(node.children, sessionId);
        if (nested !== undefined) return nested;
    }
    return undefined;
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
        expect(created.schemaVersion).toBe(2);
        expect(created.kind).toBe("conversation");
        expect(created.folderId).toBeNull();
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

    it("creates a recursive folder tree and places sessions", async () => {
        const { store } = await makeStoreIn();
        const project = await store.createFolder({ title: "项目" });
        const nested = await store.createFolder({
            title: "子目录",
            parentFolderId: project.id,
        });
        const created = await store.create({
            title: "子目录会话",
            folderId: nested.id,
        });

        const tree = await store.tree();
        expect(tree.draftFolderId).not.toBeNull();
        expect(findFolder(tree.nodes, project.id)?.folder.title).toBe("项目");
        expect(findFolder(tree.nodes, nested.id)?.folder.title).toBe("子目录");
        expect(findSession(tree.nodes, created.id)?.session.folderId).toBe(
            nested.id,
        );
        expect(
            (await store.list()).find((session) => session.id === created.id)
                ?.folderId,
        ).toBe(nested.id);
    });

    it("renames and moves folders and sessions", async () => {
        const { store } = await makeStoreIn();
        const a = await store.createFolder({ title: "A" });
        const b = await store.createFolder({ title: "B" });
        const created = await store.create({ title: "会话", folderId: b.id });

        const renamed = await store.renameFolder(b.id, "B2");
        expect(renamed.title).toBe("B2");

        await store.moveFolder(b.id, a.id);
        let tree = await store.tree();
        expect(findFolder(tree.nodes, b.id)?.folder.title).toBe("B2");
        expect(findSession(tree.nodes, created.id)?.session.folderId).toBe(b.id);

        await store.moveSession(created.id, a.id);
        tree = await store.tree();
        expect(findSession(tree.nodes, created.id)?.session.folderId).toBe(a.id);
        expect((await store.read(created.id)).folderId).toBe(a.id);

        await expect(store.moveFolder(a.id, b.id)).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });
    });

    it("deletes a folder recursively", async () => {
        const { store } = await makeStoreIn();
        const folder = await store.createFolder({ title: "待删除" });
        const created = await store.create({ title: "会话", folderId: folder.id });

        await expect(store.deleteFolder(folder.id)).resolves.toBe(true);
        await expect(store.read(created.id)).rejects.toMatchObject({
            code: "E_NOT_FOUND",
        });
    });

    it("persists and reuses the draft folder configuration", async () => {
        const { store, dir, settings } = await makeStoreIn();
        const tree = await store.tree();

        expect(tree.draftFolderId).not.toBeNull();
        expect(settings.draftSessionFolderId).toBe(tree.draftFolderId);

        const reopened = new SessionStore(dir, {
            getSettings: () => settings,
            updateSettings: async (patch) => {
                Object.assign(settings, patch);
            },
        });
        const again = await reopened.tree();
        expect(again.draftFolderId).toBe(tree.draftFolderId);
        const drafts = again.nodes.filter(
            (node) =>
                node.type === "folder" && node.folder.title === "草稿",
        );
        expect(drafts).toHaveLength(1);
    });

    it("renames sessions", async () => {
        const { store } = await makeStoreIn();
        const created = await store.create({ title: "旧标题" });
        const renamed = await store.renameSession(created.id, "新标题");

        expect(renamed.title).toBe("新标题");
        expect((await store.read(created.id)).title).toBe("新标题");
        await expect(
            store.renameSession(created.id, "  "),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });

    it("migrates v1 session records to v2", async () => {
        const { store, dir } = await makeStoreIn();
        await mkdir(join(dir, "ses_legacy"), { recursive: true });
        await writeFile(
            join(dir, "ses_legacy", "session.json"),
            JSON.stringify({
                schemaVersion: 1,
                id: "ses_legacy",
                title: "旧会话",
                status: "completed",
                createdAt: "2026-11-25T00:00:00.000Z",
                updatedAt: "2026-11-25T00:00:00.000Z",
                messageCount: 0,
                history: [],
                attachments: [],
            }),
            "utf8",
        );

        const read = await store.read("ses_legacy");
        expect(read.schemaVersion).toBe(2);
        expect(read.kind).toBe("conversation");
        expect(read.folderId).toBeNull();
        expect(read.entryCount).toBe(0);
        expect(read.history).toEqual({
            version: 2,
            id: "ses_legacy",
            messages: [],
            isArchived: false,
        });
    });

    it("refuses to delete the draft folder", async () => {
        const { store } = await makeStoreIn();
        const tree = await store.tree();
        expect(tree.draftFolderId).not.toBeNull();
        await expect(
            store.deleteFolder(tree.draftFolderId!),
        ).rejects.toMatchObject({ code: "E_CONFLICT" });
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

    it("stores a validated run result in the draft folder", async () => {
        const { store, settings } = await makeStoreIn();
        const saved = await store.createRunSession({
            result: {
                version: 1,
                runId: "run_1",
                graphId: "main",
                status: "completed",
                startedAt: 1_000,
                endedAt: 2_000,
                outputs: { text: { type: "text", text: "ok" } },
                entries: [
                    {
                        kind: "model-call",
                        id: "entry-1",
                        nodeId: "call",
                        nodeType: "core.model.call",
                        providerId: "fake",
                        modelId: "echo",
                        mode: "chat",
                        status: "completed",
                        startedAt: 1_000,
                        endedAt: 2_000,
                        input: {
                            prompt: "hi",
                            attachments: [{ contentHash: ATTACHMENT_HASH }],
                        },
                        output: { text: "ok" },
                    },
                ],
            },
        });

        expect(saved.kind).toBe("run");
        expect(saved.messageCount).toBe(0);
        expect(saved.entryCount).toBe(1);
        expect(saved.attachments).toEqual([ATTACHMENT_HASH]);
        expect(saved.folderId).toBe(settings.draftSessionFolderId);

        const read = await store.read(saved.id);
        expect(read.entryCount).toBe(1);
        expect(
            (read.history as { entries: unknown[] }).entries,
        ).toHaveLength(1);
    });

    it("rejects invalid run results", async () => {
        const store = await makeStore();

        await expect(
            store.createRunSession({
                result: { version: 1, entries: [] } as never,
            }),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });

        const created = await store.create();
        await expect(
            store.save({
                ...created,
                kind: "run",
                history: { version: 1, runId: "run_1", entries: [] },
                entryCount: 2,
                attachments: [ATTACHMENT_HASH],
            }),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });

    it("appends run messages to a conversation session", async () => {
        const { store } = await makeStoreIn();
        const conversation = await store.create({ title: "对话" });
        const result = {
            version: 1 as const,
            runId: "run_2",
            graphId: "main",
            status: "completed" as const,
            startedAt: 10,
            endedAt: 20,
            outputs: {},
            entries: [
                {
                    kind: "model-call" as const,
                    id: "entry-1",
                    nodeId: "call",
                    nodeType: "core.model.call",
                    providerId: "fake",
                    modelId: "echo",
                    mode: "chat" as const,
                    status: "completed" as const,
                    startedAt: 10,
                    endedAt: 20,
                    input: {
                        prompt: "hello",
                        attachments: [{ contentHash: ATTACHMENT_HASH }],
                    },
                    output: { text: "hi" },
                },
            ],
        };

        const updated = await store.appendRunMessages(conversation.id, result);
        expect(updated.kind).toBe("conversation");
        expect(updated.messageCount).toBe(2);
        expect(updated.attachments).toEqual([ATTACHMENT_HASH]);

        const again = await store.appendRunMessages(conversation.id, result);
        expect(again.messageCount).toBe(4);

        const read = await store.read(conversation.id);
        expect(read.messageCount).toBe(4);
        expect((read.history as { messages: unknown[] }).messages).toHaveLength(4);
    });

    it("rejects appending run messages to a run session", async () => {
        const store = await makeStore();
        const runSession = await store.createRunSession({
            result: {
                version: 1,
                runId: "run_3",
                graphId: "main",
                status: "completed",
                startedAt: 1,
                endedAt: 2,
                outputs: {},
                entries: [],
            },
        });

        await expect(
            store.appendRunMessages(runSession.id, {
                version: 1,
                runId: "run_3",
                graphId: "main",
                status: "completed",
                startedAt: 1,
                endedAt: 2,
                outputs: {},
                entries: [],
            }),
        ).rejects.toMatchObject({ code: "E_CONFLICT" });
    });

    it("sets the draft folder and persists it in workspace settings", async () => {
        const { store, settings } = await makeStoreIn();
        const folder = await store.createFolder({ title: "输出" });

        const tree = await store.setDraftFolder(folder.id);

        expect(tree.draftFolderId).toBe(folder.id);
        expect(settings.draftSessionFolderId).toBe(folder.id);
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

    it("rejects malformed ids and missing folders", async () => {
        const store = await makeStore();
        await expect(store.read("../escape")).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });
        await expect(
            store.createFolder({
                title: "bad",
                parentFolderId: "../../escape",
            }),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
        await expect(
            store.create({ folderId: "fld_missing" }),
        ).rejects.toMatchObject({ code: "E_NOT_FOUND" });
    });
});
