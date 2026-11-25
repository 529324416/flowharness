import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, sep } from "node:path";
import { unzipSync, zipSync } from "fflate";
import {
    FhError,
    type DocumentRef,
    type HarnessDocumentSummary,
    type WorkbenchSummary,
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
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const REVISION_PREFIX = "sha256:";

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
    private readonly documentWrites = new Map<string, Promise<void>>();
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

        try {
            await fs.mkdir(join(dir, "documents", "harness"), { recursive: true });
            await fs.mkdir(join(dir, "documents", "workbenches"), {
                recursive: true,
            });
            await fs.mkdir(join(dir, "objects"), { recursive: true });
            await fs.mkdir(join(dir, "runs"), { recursive: true });
            await fs.mkdir(join(dir, "sessions"), { recursive: true });
            await writeJsonFile(join(dir, "manifest.json"), manifest);
        } catch (error) {
            throw new FhError(
                "E_IO",
                `cannot create workspace: ${(error as Error).message}`,
                { code: (error as NodeJS.ErrnoException).code },
            );
        }

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

    /**
     * 读取文档与其内容哈希。
     *
     * `revision` 由文件字节计算，保存时作为乐观并发的 baseRevision；
     * 文件不存在返回 null，损坏的 JSON 报 E_IO（不把绝对路径暴露给 renderer）。
     */
    async readDocument(
        id: string,
        ref: DocumentRef,
    ): Promise<{ document: unknown; revision: string } | null> {
        const workspace = this.requireOpen(id);
        const file = documentPath(workspace.dir, ref);

        let bytes: Buffer;
        try {
            bytes = await fs.readFile(file);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
        }

        let document: unknown;
        try {
            document = JSON.parse(bytes.toString("utf8"));
        } catch {
            throw new FhError("E_IO", "document is not valid JSON");
        }

        return { document, revision: revisionOf(bytes) };
    }

    /**
     * 列出工作区内的 Harness 文档。
     *
     * 标题来自文档自身的 `title`；损坏 / 非法文件不阻断列表，
     * 缺失标题时回退到文件名。
     */
    async listDocuments(id: string): Promise<HarnessDocumentSummary[]> {
        const workspace = this.requireOpen(id);
        const dir = join(workspace.dir, "documents", "harness");

        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }

        const documents: HarnessDocumentSummary[] = [];

        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

            const documentId = entry.name.slice(0, -5);
            if (!SAFE_ID.test(documentId)) continue;

            const file = join(dir, entry.name);
            const stat = await fs.stat(file).catch(() => undefined);
            if (stat === undefined) continue;

            let title = documentId;
            try {
                const raw = await readJsonFile<unknown>(file);
                if (
                    typeof raw === "object" &&
                    raw !== null &&
                    !Array.isArray(raw)
                ) {
                    const candidate = (raw as { title?: unknown }).title;
                    if (typeof candidate === "string" && candidate.trim().length > 0) {
                        title = candidate;
                    }
                }
            } catch {
                // 保留文件名作为标题，避免单份损坏文档影响列表。
            }

            documents.push({
                id: documentId,
                title,
                updatedAt: stat.mtime.toISOString(),
                size: stat.size,
            });
        }

        documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return documents;
    }

    /** 列出工作区内的 Workbench 实例文档。 */
    async listWorkbenches(id: string): Promise<WorkbenchSummary[]> {
        const workspace = this.requireOpen(id);
        const dir = join(workspace.dir, "documents", "workbenches");

        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }

        const workbenches: WorkbenchSummary[] = [];

        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

            const workbenchId = entry.name.slice(0, -5);
            if (!SAFE_ID.test(workbenchId)) continue;

            const file = join(dir, entry.name);
            const stat = await fs.stat(file).catch(() => undefined);
            if (stat === undefined) continue;

            let title = workbenchId;
            let type = "unknown";
            try {
                const raw = await readJsonFile<unknown>(file);
                if (
                    typeof raw === "object" &&
                    raw !== null &&
                    !Array.isArray(raw)
                ) {
                    const candidate = raw as { title?: unknown; type?: unknown };
                    if (typeof candidate.title === "string" && candidate.title.trim().length > 0) {
                        title = candidate.title;
                    }
                    if (typeof candidate.type === "string" && candidate.type.length > 0) {
                        type = candidate.type;
                    }
                }
            } catch {
                // 保留 id / unknown，避免单份损坏实例影响列表。
            }

            workbenches.push({
                id: workbenchId,
                title,
                type,
                updatedAt: stat.mtime.toISOString(),
                size: stat.size,
            });
        }

        workbenches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return workbenches;
    }

    /** 删除一份文档；不存在时返回 false。 */
    async deleteDocument(id: string, ref: DocumentRef): Promise<boolean> {
        const workspace = this.requireOpen(id);

        if (ref.kind === "harness") {
            const referencedBy = await findWorkbenchReferences(
                workspace.dir,
                ref.id,
            );
            if (referencedBy.length > 0) {
                throw new FhError(
                    "E_CONFLICT",
                    `graph is referenced by workbench: ${referencedBy.join(", ")}`,
                );
            }
        }

        const file = documentPath(workspace.dir, ref);

        try {
            await fs.unlink(file);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw error;
        }
    }

    /**
     * 保存整份文档快照（ADR-012）。
     *
     * - `baseRevision = null` 表示创建，已存在则冲突；
     * - 非 null 时必须与当前文件 revision 一致，否则 E_CONFLICT；
     * - 写入前做 JSON 校验与大小上限检查，原子写，最后更新 manifest.updatedAt。
     */
    async saveDocument(
        id: string,
        ref: DocumentRef,
        document: unknown,
        baseRevision: string | null,
    ): Promise<{ revision: string; updatedAt: string }> {
        assertDocumentRef(ref);

        // 同一文档的保存串行化，保证 baseRevision 检查和写入之间不被插队。
        const key = `${id}:${ref.kind}:${ref.id}`;
        const previous = this.documentWrites.get(key) ?? Promise.resolve();
        const result = previous.then(() =>
            this.saveDocumentNow(id, ref, document, baseRevision),
        );
        this.documentWrites.set(
            key,
            result.then(
                () => undefined,
                () => undefined,
            ),
        );
        return result;
    }

    private async saveDocumentNow(
        id: string,
        ref: DocumentRef,
        document: unknown,
        baseRevision: string | null,
    ): Promise<{ revision: string; updatedAt: string }> {
        if (baseRevision !== null && typeof baseRevision !== "string") {
            throw new FhError("E_INVALID_ARGUMENT", "baseRevision must be a string or null");
        }

        const workspace = this.requireOpen(id);
        const current = await this.readDocument(id, ref);

        if (baseRevision === null) {
            if (current !== null) {
                throw new FhError("E_CONFLICT", "document already exists");
            }
        } else if (current === null) {
            throw new FhError("E_CONFLICT", "document does not exist");
        } else if (current.revision !== baseRevision) {
            throw new FhError("E_CONFLICT", "document was modified since it was read");
        }

        const text = serializeDocument(document);
        await writeFileAtomic(documentPath(workspace.dir, ref), text);

        const updatedAt = new Date().toISOString();
        workspace.manifest.updatedAt = updatedAt;
        try {
            await writeJsonFile(join(workspace.dir, "manifest.json"), workspace.manifest);
        } catch (error) {
            // 文档本身已经原子写入；manifest 时间戳失败不应让调用方误判为保存失败。
            console.warn(
                "[workspace] cannot persist manifest timestamp",
                (error as Error).message,
            );
        }

        return { revision: revisionOf(text), updatedAt };
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

async function findWorkbenchReferences(
    workspaceDir: string,
    graphId: string,
): Promise<string[]> {
    const dir = join(workspaceDir, "documents", "workbenches");
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }

    const references: string[] = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

        const id = entry.name.slice(0, -5);
        const raw = await readJsonFile<unknown>(join(dir, entry.name)).catch(
            () => undefined,
        );
        if (!isRecord(raw) || !referencesGraph(raw, graphId)) continue;

        const title =
            typeof raw.title === "string" && raw.title.trim().length > 0
                ? raw.title
                : id;
        references.push(`${title} (${id})`);
    }
    return references;
}

function referencesGraph(
    value: Record<string, unknown>,
    graphId: string,
): boolean {
    if (
        Array.isArray(value.graphs) &&
        value.graphs.some(
            (item) => isRecord(item) && item.graphId === graphId,
        )
    ) {
        return true;
    }

    const plan = value.plan;
    return (
        isRecord(plan) &&
        Array.isArray(plan.graphs) &&
        plan.graphs.some(
            (item) => isRecord(item) && item.graphId === graphId,
        )
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function documentPath(dir: string, ref: DocumentRef): string {
    assertDocumentRef(ref);
    const sub = ref.kind === "harness" ? "harness" : "workbenches";
    return join(dir, "documents", sub, `${ref.id}.json`);
}

function assertDocumentRef(ref: DocumentRef): void {
    if (!ref || (ref.kind !== "harness" && ref.kind !== "workbench")) {
        throw new FhError("E_INVALID_ARGUMENT", "invalid document ref");
    }
    assertSafeId(ref.id);
}

function revisionOf(value: string | Uint8Array): string {
    return `${REVISION_PREFIX}${createHash("sha256").update(value).digest("hex")}`;
}

/** 与 writeJsonFile 相同的序列化；额外拒绝非 JSON 值并限制体积。 */
function serializeDocument(value: unknown): string {
    let text: string | undefined;

    try {
        text = JSON.stringify(
            value,
            (_key, candidate: unknown) => {
                if (
                    typeof candidate === "bigint" ||
                    typeof candidate === "function" ||
                    typeof candidate === "symbol" ||
                    (typeof candidate === "number" && !Number.isFinite(candidate))
                ) {
                    throw new Error("unsupported JSON value");
                }
                return candidate;
            },
            2,
        );
    } catch {
        throw new FhError("E_INVALID_ARGUMENT", "document must be a JSON value");
    }

    if (text === undefined) {
        throw new FhError("E_INVALID_ARGUMENT", "document must be a JSON value");
    }

    const serialized = `${text}\n`;
    if (Buffer.byteLength(serialized, "utf8") > MAX_DOCUMENT_BYTES) {
        throw new FhError("E_INVALID_ARGUMENT", "document is too large", {
            maxBytes: MAX_DOCUMENT_BYTES,
        });
    }

    return serialized;
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
