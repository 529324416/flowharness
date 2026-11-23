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
        await store.writeDocument(
            created.id,
            { kind: "harness", id: "graph-1" },
            { version: 1, nodes: [], edges: [] },
        );
        await store.close(created.id);

        const reopened = new WorkspaceStore(root, "0.0.0-test");
        await reopened.open(created.id);
        const document = await reopened.readDocument(created.id, {
            kind: "harness",
            id: "graph-1",
        });

        expect(document).toEqual({ version: 1, nodes: [], edges: [] });
        await reopened.close(created.id);
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
        await store.writeDocument(
            created.id,
            { kind: "harness", id: "graph-a" },
            { version: 1, nodes: [{ id: "n1" }], edges: [] },
        );

        const archivePath = join(dirs[dirs.length - 1]!, "export.fhws");
        await store.exportWorkspace(created.id, archivePath);
        expect((await readFile(archivePath)).byteLength).toBeGreaterThan(0);

        const imported = await store.importWorkspace(archivePath);
        expect(imported.id).not.toBe(created.id);

        await store.open(imported.id);
        expect(
            await store.readDocument(imported.id, { kind: "harness", id: "graph-a" }),
        ).toEqual({ version: 1, nodes: [{ id: "n1" }], edges: [] });
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
            store.writeDocument(created.id, { kind: "harness", id: "../evil" }, {}),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });
});
