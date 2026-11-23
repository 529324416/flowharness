import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, sep } from "node:path";
import { unzipSync, zipSync } from "fflate";
import {
    FhError,
    type DocumentRef,
    type WorkspaceCreateInput,
    type WorkspaceSummary,
} from "@flowharness/contracts";
import {
    isProcessAlive,
    readJsonFile,
    writeFileAtomic,
    writeJsonFile,
} from "./atomic-file";
import { BlobStore } from "./blob-store";

export const WORKSPACE_SCHEMA_VERSION = 1;
const EXPORT_FORMAT = "fhws";
const EXPORT_FORMAT_VERSION = 1;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

type WorkspaceManifest = {
    schemaVersion: number;
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    settings: { defaultWorkbenchId?: string };
};

type OpenWorkspace = {
    dir: string;
    manifest: WorkspaceManifest;
    blobs: BlobStore;
};

type ExportHeader = {
    format: string;
    formatVersion: number;
    exportedAt: string;
    appVersion: string;
};

export type ExportOptions = { includeObjects?: boolean };

/**
 * 工作区存储：目录 + manifest。
 *
 * 目录结构见 architecture/data-model.md。所有写入都经过这里，
 * 其他模块不得直接操作工作区文件。
 */
export class WorkspaceStore {
    private readonly openWorkspaces = new Map<string, OpenWorkspace>();
    private rootReady = false;

    constructor(
        private readonly root: string,
        private readonly appVersion: string,
    ) {}

    async init(): Promise<void> {
        if (this.rootReady) return;
        this.rootReady = true;

        try {
            await fs.mkdir(this.root, { recursive: true });
        } catch (error) {
            console.warn(
                "[workspace] cannot create workspace root; listing will be empty",
                (error as Error).message,
            );
        }
    }

    async list(): Promise<WorkspaceSummary[]> {
        await this.init();

        let entries;
        try {
            entries = await fs.readdir(this.root, { withFileTypes: true });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "ENOENT" || code === "EACCES" || code === "EPERM") return [];
            throw error;
        }

        const results: WorkspaceSummary[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const dir = join(this.root, entry.name);
            const raw = await readJsonFile<unknown>(join(dir, "manifest.json")).catch(
                () => undefined,
            );
            if (raw === undefined) continue;

            try {
                results.push(summary(dir, parseManifest(raw)));
            } catch {
                // 损坏的工作区不阻塞列表；诊断信息由后续的显式打开给出。
            }
        }

        results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return results;
    }

    async create(input: WorkspaceCreateInput): Promise<WorkspaceSummary> {
        await this.init();

        const name = normalizeName(input?.name);
        const id = `ws_${randomBytes(6).toString("hex")}`;
        const dir = join(this.root, `${slugify(name)}-${id.slice(-8)}`);
        const now = new Date().toISOString();

        const manifest: WorkspaceManifest = {
            schemaVersion: WORKSPACE_SCHEMA_VERSION,
            id,
            name,
            createdAt: now,
            updatedAt: now,
            settings: {},
        };

        await fs.mkdir(join(dir, "documents", "harness"), { recursive: true });
        await fs.mkdir(join(dir, "documents", "workbenches"), { recursive: true });
        await fs.mkdir(join(dir, "objects"), { recursive: true });
        await fs.mkdir(join(dir, "runs"), { recursive: true });
        await fs.mkdir(join(dir, "sessions"), { recursive: true });
        await writeJsonFile(join(dir, "manifest.json"), manifest);

        return summary(dir, manifest);
    }

    async open(id: string): Promise<WorkspaceSummary> {
        assertSafeId(id);

        const existing = this.openWorkspaces.get(id);
        if (existing) return summary(existing.dir, existing.manifest);

        const dir = await this.findDir(id);
        const raw = await readJsonFile<unknown>(join(dir, "manifest.json"));
        const manifest = parseManifest(raw);

        await this.acquireLock(dir);
        this.openWorkspaces.set(id, {
            dir,
            manifest,
            blobs: new BlobStore(join(dir, "objects")),
        });

        return summary(dir, manifest);
    }

    async close(id: string): Promise<void> {
        const workspace = this.openWorkspaces.get(id);
        if (!workspace) return;

        await this.releaseLock(workspace.dir);
        this.openWorkspaces.delete(id);
    }

    getBlobStore(id: string): BlobStore | undefined {
        return this.openWorkspaces.get(id)?.blobs;
    }

    isOpen(id: string): boolean {
        return this.openWorkspaces.has(id);
    }

    /** 已打开工作区的目录；未打开返回 undefined。 */
    getWorkspaceDir(id: string): string | undefined {
        return this.openWorkspaces.get(id)?.dir;
    }

    async readDocument(id: string, ref: DocumentRef): Promise<unknown> {
        const workspace = this.requireOpen(id);
        return readJsonFile<unknown>(documentPath(workspace.dir, ref));
    }

    async writeDocument(id: string, ref: DocumentRef, value: unknown): Promise<void> {
        const workspace = this.requireOpen(id);
        await writeJsonFile(documentPath(workspace.dir, ref), value);

        workspace.manifest.updatedAt = new Date().toISOString();
        await writeJsonFile(join(workspace.dir, "manifest.json"), workspace.manifest);
    }

    async exportWorkspace(
        id: string,
        targetPath: string,
        options: ExportOptions = {},
    ): Promise<string> {
        const workspace = this.requireOpen(id);
        const files: Record<string, Uint8Array> = {};

        const header: ExportHeader = {
            format: EXPORT_FORMAT,
            formatVersion: EXPORT_FORMAT_VERSION,
            exportedAt: new Date().toISOString(),
            appVersion: this.appVersion,
        };

        files["export.json"] = encodeJson(header);
        await collectFiles(workspace.dir, "documents", files);
        files["manifest.json"] = encodeJson(workspace.manifest);

        if (options.includeObjects !== false) {
            await collectFiles(workspace.dir, "objects", files);
        }

        const archive = zipSync(files);
        await fs.mkdir(dirname(targetPath), { recursive: true });
        await writeFileAtomic(targetPath, archive);

        return targetPath;
    }

    async importWorkspace(sourcePath: string): Promise<WorkspaceSummary> {
        await this.init();

        const archive = new Uint8Array(await fs.readFile(sourcePath));
        const entries = unzipSync(archive);

        for (const key of Object.keys(entries)) {
            assertSafeEntry(key);
        }

        const header = readEntryJson<ExportHeader>(entries, "export.json");
        if (header.format !== EXPORT_FORMAT) {
            throw new FhError("E_INVALID_ARGUMENT", "not a FlowHarness workspace archive");
        }
        if (header.formatVersion > EXPORT_FORMAT_VERSION) {
            throw new FhError(
                "E_MIGRATION",
                `archive format ${header.formatVersion} is newer than supported ${EXPORT_FORMAT_VERSION}`,
            );
        }

        const manifest = parseManifest(readEntryJson<unknown>(entries, "manifest.json"));
        const id = `ws_${randomBytes(6).toString("hex")}`;
        const dir = join(this.root, `${slugify(manifest.name)}-${id.slice(-8)}`);

        await fs.mkdir(dir, { recursive: true });

        for (const [key, data] of Object.entries(entries)) {
            if (key === "export.json" || key === "manifest.json") continue;
            if (!key.startsWith("documents/") && !key.startsWith("objects/")) continue;

            const target = join(dir, ...key.split("/"));
            await writeFileAtomic(target, data);
        }

        const now = new Date().toISOString();
        const next: WorkspaceManifest = {
            ...manifest,
            id,
            createdAt: now,
            updatedAt: now,
        };

        await fs.mkdir(join(dir, "objects"), { recursive: true });
        await fs.mkdir(join(dir, "runs"), { recursive: true });
        await fs.mkdir(join(dir, "sessions"), { recursive: true });
        await writeJsonFile(join(dir, "manifest.json"), next);

        return summary(dir, next);
    }

    private async findDir(id: string): Promise<string> {
        await this.init();
        const entries = await fs.readdir(this.root, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const dir = join(this.root, entry.name);
            const raw = await readJsonFile<{ id?: unknown }>(
                join(dir, "manifest.json"),
            ).catch(() => undefined);
            if (raw && raw.id === id) return dir;
        }

        throw new FhError("E_NOT_FOUND", `workspace not found: ${id}`);
    }

    private requireOpen(id: string): OpenWorkspace {
        assertSafeId(id);
        const workspace = this.openWorkspaces.get(id);
        if (!workspace) {
            throw new FhError("E_CONFLICT", `workspace is not open: ${id}`);
        }
        return workspace;
    }

    private async acquireLock(dir: string): Promise<void> {
        const lockPath = join(dir, "lock");
        const existing = await readJsonFile<{ pid?: unknown }>(lockPath).catch(
            () => undefined,
        );

        if (
            existing &&
            typeof existing.pid === "number" &&
            existing.pid !== process.pid &&
            isProcessAlive(existing.pid)
        ) {
            throw new FhError(
                "E_CONFLICT",
                `workspace is open in another process (pid ${existing.pid})`,
            );
        }

        await writeJsonFile(lockPath, {
            pid: process.pid,
            startedAt: new Date().toISOString(),
            appVersion: this.appVersion,
        });
    }

    private async releaseLock(dir: string): Promise<void> {
        const lockPath = join(dir, "lock");
        const lock = await readJsonFile<{ pid?: unknown }>(lockPath).catch(
            () => undefined,
        );

        if (lock?.pid === process.pid) {
            await fs.rm(lockPath, { force: true });
        }
    }
}

function parseManifest(raw: unknown): WorkspaceManifest {
    if (!raw || typeof raw !== "object") {
        throw new FhError("E_INVALID_ARGUMENT", "invalid workspace manifest");
    }

    const candidate = raw as Partial<WorkspaceManifest>;
    const version =
        typeof candidate.schemaVersion === "number" ? candidate.schemaVersion : 0;

    if (version > WORKSPACE_SCHEMA_VERSION) {
        throw new FhError(
            "E_MIGRATION",
            `workspace schema ${version} is newer than supported ${WORKSPACE_SCHEMA_VERSION}`,
        );
    }

    if (version < 1) {
        throw new FhError("E_MIGRATION", "workspace manifest is missing schemaVersion");
    }

    assertSafeId(candidate.id);

    if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
        throw new FhError("E_INVALID_ARGUMENT", "workspace manifest is missing name");
    }

    return {
        schemaVersion: version,
        id: candidate.id as string,
        name: candidate.name,
        createdAt:
            typeof candidate.createdAt === "string"
                ? candidate.createdAt
                : new Date().toISOString(),
        updatedAt:
            typeof candidate.updatedAt === "string"
                ? candidate.updatedAt
                : new Date().toISOString(),
        settings:
            candidate.settings && typeof candidate.settings === "object"
                ? candidate.settings
                : {},
    };
}

function summary(dir: string, manifest: WorkspaceManifest): WorkspaceSummary {
    return {
        id: manifest.id,
        name: manifest.name,
        path: dir,
        createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt,
    };
}

function documentPath(dir: string, ref: DocumentRef): string {
    assertSafeId(ref.id);
    const sub = ref.kind === "harness" ? "harness" : "workbenches";
    return join(dir, "documents", sub, `${ref.id}.json`);
}

function normalizeName(name: unknown): string {
    if (typeof name !== "string") {
        throw new FhError("E_INVALID_ARGUMENT", "workspace name must be a string");
    }

    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 80) {
        throw new FhError("E_INVALID_ARGUMENT", "workspace name must be 1-80 characters");
    }

    return trimmed;
}

function slugify(name: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);

    return slug.length > 0 ? slug : "workspace";
}

function assertSafeId(id: unknown): void {
    if (typeof id !== "string" || !SAFE_ID.test(id)) {
        throw new FhError("E_INVALID_ARGUMENT", `invalid workspace id: ${String(id)}`);
    }
}

function assertSafeEntry(key: string): void {
    if (
        key.length === 0 ||
        key.startsWith("/") ||
        key.includes("\\") ||
        key.split("/").includes("..")
    ) {
        throw new FhError("E_INVALID_ARGUMENT", `unsafe archive entry: ${key}`);
    }
}

function readEntryJson<T>(entries: Record<string, Uint8Array>, key: string): T {
    const data = entries[key];
    if (!data) {
        throw new FhError("E_INVALID_ARGUMENT", `archive is missing ${key}`);
    }

    try {
        return JSON.parse(new TextDecoder().decode(data)) as T;
    } catch {
        throw new FhError("E_INVALID_ARGUMENT", `archive entry ${key} is not valid JSON`);
    }
}

async function collectFiles(
    root: string,
    sub: string,
    out: Record<string, Uint8Array>,
): Promise<void> {
    const base = join(root, sub);

    let entries;
    try {
        entries = await fs.readdir(base, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }

    for (const entry of entries) {
        const full = join(base, entry.name);

        if (entry.isDirectory()) {
            await collectFiles(root, join(sub, entry.name), out);
            continue;
        }

        if (!entry.isFile()) continue;

        const key = `${sub}/${entry.name}`.split(sep).join("/");
        out[key] = new Uint8Array(await fs.readFile(full));
    }
}

function encodeJson(value: unknown): Uint8Array {
    return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}
