import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspace-store";

const dirs: string[] = [];

async function makeStore(): Promise<{ store: WorkspaceStore; root: string }> {
    const dir = await mkdtemp(join(tmpdir(), "fh-workspaces-"));
    dirs.push(dir);
    const root = join(dir, "workspaces");
    const store = new WorkspaceStore(root, "0.0.0-test");
    await store.init();
    return { store, root };
}

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("WorkspaceStore", () => {
    it("creates and lists workspaces", async () => {
        const { store } = await makeStore();

        const created = await store.create({ name: "Demo Workspace" });
        const list = await store.list();

        expect(created.id).toMatch(/^ws_[a-f0-9]{12}$/);
        expect(created.name).toBe("Demo Workspace");
        expect(list.map((item) => item.id)).toContain(created.id);

        const manifest = JSON.parse(
            await readFile(join(created.path, "manifest.json"), "utf8"),
        );
        expect(manifest.schemaVersion).toBe(1);
        expect(manifest.id).toBe(created.id);
    });

    it("persists documents across open/close", async () => {
        const { store, root } = await makeStore();
        const created = await store.create({ name: "Docs" });

        await store.open(created.id);
        const ref = { kind: "harness", id: "graph-1" } as const;
        await store.saveDocument(created.id, ref, { version: 1, nodes: [], edges: [] }, null);
        await store.close(created.id);

        const reopened = new WorkspaceStore(root, "0.0.0-test");
        await reopened.open(created.id);
        const snapshot = await reopened.readDocument(created.id, ref);

        expect(snapshot?.document).toEqual({ version: 1, nodes: [], edges: [] });
        expect(snapshot?.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
        await reopened.close(created.id);
    });

    it("lists and deletes harness documents", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Documents" });
        await store.open(created.id);

        await store.saveDocument(
            created.id,
            { kind: "harness", id: "graph-a" },
            { version: 1, title: "图 A", nodes: [], edges: [] },
            null,
        );
        await store.saveDocument(
            created.id,
            { kind: "harness", id: "graph-b" },
            { version: 1, title: "图 B", nodes: [], edges: [] },
            null,
        );

        const list = await store.listDocuments(created.id);
        expect(list).toHaveLength(2);
        expect(list.find((item) => item.id === "graph-a")).toMatchObject({
            id: "graph-a",
            title: "图 A",
        });
        expect(list.find((item) => item.id === "graph-b")).toMatchObject({
            id: "graph-b",
            title: "图 B",
        });
        expect(list[0]?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(list[0]?.size).toBeGreaterThan(0);

        await expect(
            store.deleteDocument(created.id, { kind: "harness", id: "graph-a" }),
        ).resolves.toBe(true);
        await expect(
            store.deleteDocument(created.id, { kind: "harness", id: "graph-a" }),
        ).resolves.toBe(false);

        expect((await store.listDocuments(created.id)).map((item) => item.id)).toEqual([
            "graph-b",
        ]);
    });

    it("refuses to delete a graph referenced by a workbench", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "References" });
        await store.open(created.id);

        await store.saveDocument(
            created.id,
            { kind: "harness", id: "graph-a" },
            { version: 1, title: "图 A", nodes: [], edges: [] },
            null,
        );
        await store.saveDocument(
            created.id,
            { kind: "workbench", id: "wb_a" },
            {
                schemaVersion: 1,
                id: "wb_a",
                type: "harness-designer",
                title: "主工作台",
                graphs: [{ graphId: "graph-a", role: "main" }],
                plan: null,
                parameters: {},
                createdAt: "2026-11-26T00:00:00.000Z",
                updatedAt: "2026-11-26T00:00:00.000Z",
            },
            null,
        );

        await expect(
            store.deleteDocument(created.id, {
                kind: "harness",
                id: "graph-a",
            }),
        ).rejects.toMatchObject({ code: "E_CONFLICT" });
        await expect(
            store.readDocument(created.id, {
                kind: "harness",
                id: "graph-a",
            }),
        ).resolves.not.toBeNull();

        await expect(
            store.deleteDocument(created.id, { kind: "workbench", id: "wb_a" }),
        ).resolves.toBe(true);
        await expect(
            store.deleteDocument(created.id, {
                kind: "harness",
                id: "graph-a",
            }),
        ).resolves.toBe(true);
    });

    it("persists workspace settings", async () => {
        const { store, root } = await makeStore();
        const created = await store.create({ name: "Settings" });
        await store.open(created.id);

        expect(store.getSettings(created.id)).toEqual({});
        await store.updateSettings(created.id, {
            draftSessionFolderId: "fld_abc",
        });
        expect(store.getSettings(created.id).draftSessionFolderId).toBe(
            "fld_abc",
        );

        await store.close(created.id);
        const reopened = new WorkspaceStore(root, "0.0.0-test");
        await reopened.open(created.id);
        expect(reopened.getSettings(created.id).draftSessionFolderId).toBe(
            "fld_abc",
        );
        await reopened.close(created.id);
    });

    it("keeps listing when a document is corrupt", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Corrupt list" });
        await store.open(created.id);

        await store.saveDocument(
            created.id,
            { kind: "harness", id: "graph-good" },
            { version: 1, title: "Good", nodes: [], edges: [] },
            null,
        );
        await writeFile(join(created.path, "documents", "harness", "bad.json"), "{not json");

        const list = await store.listDocuments(created.id);
        expect(list.map((item) => item.id).sort()).toEqual(["bad", "graph-good"]);
        expect(list.find((item) => item.id === "bad")?.title).toBe("bad");
    });

    it("lists and deletes workbench instances", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Workbenches" });
        await store.open(created.id);

        await store.saveDocument(
            created.id,
            { kind: "workbench", id: "wb_one" },
            {
                schemaVersion: 1,
                id: "wb_one",
                type: "harness-designer",
                title: "主工作台",
                graphs: [{ graphId: "main", role: "main" }],
                plan: null,
                parameters: {},
                createdAt: "2026-11-25T00:00:00.000Z",
                updatedAt: "2026-11-25T00:00:00.000Z",
            },
            null,
        );

        const list = await store.listWorkbenches(created.id);
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({
            id: "wb_one",
            title: "主工作台",
            type: "harness-designer",
        });

        await expect(
            store.deleteDocument(created.id, { kind: "workbench", id: "wb_one" }),
        ).resolves.toBe(true);
        expect(await store.listWorkbenches(created.id)).toEqual([]);
    });

    it("returns null for a missing document", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Empty" });
        await store.open(created.id);

        await expect(
            store.readDocument(created.id, { kind: "harness", id: "graph-missing" }),
        ).resolves.toBeNull();
    });

    it("requires the current revision to update a document", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Revisions" });
        await store.open(created.id);

        const ref = { kind: "harness", id: "graph-1" } as const;
        const first = await store.saveDocument(created.id, ref, { version: 1 }, null);

        await expect(
            store.saveDocument(created.id, ref, { version: 2 }, "sha256:stale"),
        ).rejects.toMatchObject({ code: "E_CONFLICT" });

        const second = await store.saveDocument(
            created.id,
            ref,
            { version: 2 },
            first.revision,
        );

        expect(second.revision).not.toBe(first.revision);
        await expect(store.readDocument(created.id, ref)).resolves.toMatchObject({
            document: { version: 2 },
            revision: second.revision,
        });
    });

    it("refuses to create over an existing document or update a missing one", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Conflicts" });
        await store.open(created.id);

        const ref = { kind: "harness", id: "graph-1" } as const;
        await store.saveDocument(created.id, ref, { version: 1 }, null);

        await expect(
            store.saveDocument(created.id, ref, { version: 2 }, null),
        ).rejects.toMatchObject({ code: "E_CONFLICT" });

        await expect(
            store.saveDocument(
                created.id,
                { kind: "harness", id: "graph-2" },
                { version: 1 },
                "sha256:missing",
            ),
        ).rejects.toMatchObject({ code: "E_CONFLICT" });
    });

    it("rejects documents that are not JSON values", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Bad JSON" });
        await store.open(created.id);

        await expect(
            store.saveDocument(
                created.id,
                { kind: "harness", id: "graph-fn" },
                { version: 1, value: () => undefined },
                null,
            ),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });

    it("rejects documents over the size limit", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Huge" });
        await store.open(created.id);

        await expect(
            store.saveDocument(
                created.id,
                { kind: "harness", id: "graph-huge" },
                { version: 1, padding: "x".repeat(4 * 1024 * 1024) },
                null,
            ),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });

    it("reports corrupt document JSON as E_IO", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Corrupt" });
        await store.open(created.id);

        await writeFile(join(created.path, "documents", "harness", "bad.json"), "{not json");

        await expect(
            store.readDocument(created.id, { kind: "harness", id: "bad" }),
        ).rejects.toMatchObject({ code: "E_IO" });
    });

    it("rejects an invalid document ref", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Bad Ref" });
        await store.open(created.id);

        await expect(
            store.readDocument(created.id, { kind: "other", id: "x" } as never),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });

    it("rejects documents when the workspace is not open", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Closed" });

        await expect(
            store.readDocument(created.id, { kind: "harness", id: "graph-1" }),
        ).rejects.toMatchObject({ code: "E_CONFLICT" });
    });

    it("refuses to open a workspace locked by another live process", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Locked" });

        await writeFile(
            join(created.path, "lock"),
            JSON.stringify({ pid: process.ppid, startedAt: new Date().toISOString() }),
        );

        await expect(store.open(created.id)).rejects.toMatchObject({ code: "E_CONFLICT" });
    });

    it("exports and re-imports a workspace archive", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Export Me" });

        await store.open(created.id);
        await store.saveDocument(
            created.id,
            { kind: "harness", id: "graph-a" },
            { version: 1, nodes: [{ id: "n1" }], edges: [] },
            null,
        );

        const archivePath = join(dirs[dirs.length - 1]!, "export.fhws");
        await store.exportWorkspace(created.id, archivePath);
        expect((await readFile(archivePath)).byteLength).toBeGreaterThan(0);

        const imported = await store.importWorkspace(archivePath);
        expect(imported.id).not.toBe(created.id);

        await store.open(imported.id);
        const snapshot = await store.readDocument(imported.id, {
            kind: "harness",
            id: "graph-a",
        });
        expect(snapshot?.document).toEqual({ version: 1, nodes: [{ id: "n1" }], edges: [] });
    });

    it("refuses a workspace written by a newer schema", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Future" });

        const manifestPath = join(created.path, "manifest.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifest.schemaVersion = 99;
        await writeFile(manifestPath, JSON.stringify(manifest));

        await expect(store.open(created.id)).rejects.toMatchObject({ code: "E_MIGRATION" });
    });

    it("rejects unsafe document ids", async () => {
        const { store } = await makeStore();
        const created = await store.create({ name: "Unsafe" });
        await store.open(created.id);

        await expect(
            store.saveDocument(created.id, { kind: "harness", id: "../evil" }, {}, null),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });
});
