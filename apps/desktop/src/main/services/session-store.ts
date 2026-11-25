import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, basename, resolve, sep } from "node:path";
import type {
    SessionFolder,
    SessionKind,
    SessionRecord,
    SessionStatus,
    SessionSummary,
    SessionTree,
    SessionTreeNode,
} from "@flowharness/contracts";
import { FhError } from "@flowharness/contracts";
import {
    collectAttachmentHashes,
    isContentHash,
    SessionHistory,
    SessionSerializer,
} from "wireclaw";
import { readJsonFile, writeJsonFile } from "./atomic-file";

const SESSION_ID_PATTERN = /^ses_[A-Za-z0-9_-]{1,64}$/;
const FOLDER_ID_PATTERN = /^fld_[A-Za-z0-9_-]{1,64}$/;
const SESSION_FILE = "session.json";
const FOLDER_FILE = "folder.json";
const FOLDER_SCHEMA_VERSION = 1;
const SESSION_SCHEMA_VERSION = 2;
const MAX_TREE_DEPTH = 32;
const STATUSES: readonly SessionStatus[] = [
    "idle",
    "running",
    "completed",
    "failed",
];
const KINDS: readonly SessionKind[] = ["conversation", "run"];

type FolderEntry = {
    dir: string;
    folder: SessionFolder;
    parentId: string | null;
};

type SessionEntry = {
    dir: string;
    folderId: string | null;
};

export type SessionStoreOptions = {
    getSettings?: () => { draftSessionFolderId?: string | null };
    updateSettings?: (patch: {
        draftSessionFolderId?: string | null;
    }) => Promise<void>;
};

/** 工作区会话存储：递归文件夹 + `sessions/<folder...>/<sessionId>/session.json`。 */
export class SessionStore {
    private draftFolderId: string | null | undefined;

    constructor(
        private readonly root: string,
        private readonly options: SessionStoreOptions = {},
    ) {}

    async tree(): Promise<SessionTree> {
        const draftFolderId = await this.ensureDraftFolder();
        return {
            nodes: await this.readTree(this.root, null, 0),
            draftFolderId,
        };
    }

    async list(): Promise<SessionSummary[]> {
        const tree = await this.tree();
        return flattenSessions(tree.nodes).sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
        );
    }

    async ensureDefault(): Promise<SessionRecord> {
        const existing = await this.list();
        if (existing.length > 0) {
            return this.read(existing[0]!.id);
        }
        return this.create({ title: "主会话" });
    }

    async create(input: { title?: string; folderId?: string | null } = {}): Promise<SessionRecord> {
        const now = new Date().toISOString();
        const id = `ses_${randomBytes(6).toString("hex")}`;
        const folderId = input.folderId ?? null;
        const folderDir = await this.requireFolderDir(folderId);
        const record: SessionRecord = {
            schemaVersion: SESSION_SCHEMA_VERSION,
            id,
            kind: "conversation",
            title: input.title?.trim() || "未命名会话",
            status: "idle",
            folderId,
            createdAt: now,
            updatedAt: now,
            messageCount: 0,
            entryCount: 0,
            history: SessionSerializer.serialize(new SessionHistory(id)),
            attachments: [],
        };
        await this.writeSession(join(folderDir, id), record);
        return record;
    }

    async read(sessionId: string): Promise<SessionRecord> {
        assertSessionId(sessionId);
        const entry = await this.findSession(sessionId);
        if (entry === undefined) {
            throw new FhError("E_NOT_FOUND", `session not found: ${sessionId}`);
        }
        return this.readSessionAt(entry);
    }

    async save(record: SessionRecord): Promise<SessionRecord> {
        assertSessionId(record.id);
        const existing = await this.findSession(record.id);
        const folderId = existing?.folderId ?? record.folderId ?? null;
        const dir = existing?.dir ?? join(await this.requireFolderDir(folderId), record.id);

        const parsed =
            record.kind === "run"
                ? undefined
                : parseHistoryValue(
                      record.history,
                      record.id,
                      "E_INVALID_ARGUMENT",
                  );

        const next: SessionRecord = {
            ...record,
            schemaVersion: SESSION_SCHEMA_VERSION,
            folderId,
            updatedAt: new Date().toISOString(),
            messageCount:
                parsed === undefined ? 0 : parsed.messages.length,
            entryCount:
                record.kind === "run" ? Math.max(0, record.entryCount) : 0,
            history:
                parsed === undefined
                    ? record.history
                    : SessionSerializer.serialize(parsed),
            attachments:
                parsed === undefined
                    ? record.attachments.filter(isContentHash)
                    : collectAttachmentHashes(parsed.messages).filter(
                          isContentHash,
                      ),
        };
        await this.writeSession(dir, next);
        return next;
    }

    async delete(sessionId: string): Promise<boolean> {
        assertSessionId(sessionId);
        const entry = await this.findSession(sessionId);
        if (entry === undefined) return false;
        await fs.rm(entry.dir, { recursive: true, force: true });
        return true;
    }

    async moveSession(
        sessionId: string,
        targetFolderId: string | null,
    ): Promise<SessionRecord> {
        assertSessionId(sessionId);
        const entry = await this.findSession(sessionId);
        if (entry === undefined) {
            throw new FhError("E_NOT_FOUND", `session not found: ${sessionId}`);
        }
        if (entry.folderId === targetFolderId) {
            return this.readSessionAt(entry);
        }

        const targetDir = await this.requireFolderDir(targetFolderId);
        const destination = join(targetDir, sessionId);
        if (await pathExists(destination)) {
            throw new FhError(
                "E_CONFLICT",
                `session already exists in target folder: ${sessionId}`,
            );
        }

        await fs.mkdir(targetDir, { recursive: true });
        await fs.rename(entry.dir, destination);
        const record = await this.readSessionAt({
            dir: destination,
            folderId: targetFolderId,
        });
        const next: SessionRecord = {
            ...record,
            folderId: targetFolderId,
            updatedAt: new Date().toISOString(),
        };
        await this.writeSession(destination, next);
        return next;
    }

    async createFolder(input: {
        title: string;
        parentFolderId?: string | null;
    }): Promise<SessionFolder> {
        const title = input.title.trim();
        if (title.length === 0) {
            throw new FhError("E_INVALID_ARGUMENT", "folder title is required");
        }
        const parentId = input.parentFolderId ?? null;
        const parentDir = await this.requireFolderDir(parentId);
        const id = `fld_${randomBytes(6).toString("hex")}`;
        const dir = join(parentDir, id);
        const now = new Date().toISOString();
        const folder: SessionFolder = {
            schemaVersion: FOLDER_SCHEMA_VERSION,
            id,
            title,
            createdAt: now,
            updatedAt: now,
        };
        await fs.mkdir(parentDir, { recursive: true });
        await fs.mkdir(dir, { recursive: false });
        await writeJsonFile(join(dir, FOLDER_FILE), folder);
        return folder;
    }

    async renameFolder(folderId: string, title: string): Promise<SessionFolder> {
        assertFolderId(folderId);
        const entry = await this.findFolderEntry(folderId);
        if (entry === undefined) {
            throw new FhError("E_NOT_FOUND", `folder not found: ${folderId}`);
        }
        const nextTitle = title.trim();
        if (nextTitle.length === 0) {
            throw new FhError("E_INVALID_ARGUMENT", "folder title is required");
        }
        const next: SessionFolder = {
            ...entry.folder,
            title: nextTitle,
            updatedAt: new Date().toISOString(),
        };
        await writeJsonFile(join(entry.dir, FOLDER_FILE), next);
        return next;
    }

    async moveFolder(
        folderId: string,
        targetFolderId: string | null,
    ): Promise<SessionFolder> {
        assertFolderId(folderId);
        const entry = await this.findFolderEntry(folderId);
        if (entry === undefined) {
            throw new FhError("E_NOT_FOUND", `folder not found: ${folderId}`);
        }

        const targetDir = await this.requireFolderDir(targetFolderId);
        if (
            targetDir === entry.dir ||
            isInside(entry.dir, targetDir)
        ) {
            throw new FhError(
                "E_INVALID_ARGUMENT",
                "cannot move a folder into itself or its descendant",
            );
        }

        const destination = join(targetDir, folderId);
        if (await pathExists(destination)) {
            throw new FhError(
                "E_CONFLICT",
                `folder already exists in target: ${folderId}`,
            );
        }

        await fs.mkdir(targetDir, { recursive: true });
        await fs.rename(entry.dir, destination);
        return entry.folder;
    }

    async deleteFolder(folderId: string): Promise<boolean> {
        assertFolderId(folderId);
        const entry = await this.findFolderEntry(folderId);
        if (entry === undefined) return false;

        const draftId = await this.currentDraftFolderId();
        if (draftId !== null) {
            const draft = await this.findFolderEntry(draftId);
            if (draft !== undefined && isInside(entry.dir, draft.dir)) {
                throw new FhError(
                    "E_CONFLICT",
                    "cannot delete the draft folder",
                );
            }
        }

        await fs.rm(entry.dir, { recursive: true, force: true });
        // TODO(M7.4): 汇总被删 session 的 attachments，Blob refs / GC 接线后统一清理。
        return true;
    }

    private async readSessionAt(entry: SessionEntry): Promise<SessionRecord> {
        const raw = await readJsonFile<unknown>(join(entry.dir, SESSION_FILE));
        if (raw === undefined) {
            throw new FhError("E_NOT_FOUND", "session record is missing");
        }
        const record = parseRecord(raw);
        if (record.id !== basename(entry.dir)) {
            throw new FhError("E_IO", "session id does not match its directory");
        }
        const parsed =
            record.kind === "conversation"
                ? parseHistoryValue(record.history, record.id, "E_IO")
                : undefined;
        return {
            ...record,
            folderId: entry.folderId,
            messageCount: parsed === undefined ? 0 : parsed.messages.length,
            history:
                parsed === undefined
                    ? record.history
                    : SessionSerializer.serialize(parsed),
        };
    }

    private async writeSession(
        dir: string,
        record: SessionRecord,
    ): Promise<void> {
        await fs.mkdir(dir, { recursive: true });
        await writeJsonFile(join(dir, SESSION_FILE), record);
    }

    private async requireFolderDir(folderId: string | null): Promise<string> {
        if (folderId === null) return this.root;
        assertFolderId(folderId);
        const entry = await this.findFolderEntry(folderId);
        if (entry === undefined) {
            throw new FhError("E_NOT_FOUND", `folder not found: ${folderId}`);
        }
        return entry.dir;
    }

    private async findFolderEntry(
        folderId: string,
    ): Promise<FolderEntry | undefined> {
        const folders = await this.scanFolders(this.root, null, 0);
        return folders.find((entry) => entry.folder.id === folderId);
    }

    private async findSession(
        sessionId: string,
    ): Promise<SessionEntry | undefined> {
        const sessions = await this.scanSessions(this.root, null, 0);
        return sessions.find((entry) => basename(entry.dir) === sessionId);
    }

    private async scanFolders(
        dir: string,
        parentId: string | null,
        depth: number,
    ): Promise<FolderEntry[]> {
        if (depth >= MAX_TREE_DEPTH) return [];
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return [];
        }

        const folders: FolderEntry[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory() || !FOLDER_ID_PATTERN.test(entry.name)) {
                continue;
            }
            const folderDir = join(dir, entry.name);
            const raw = await readJsonFile<unknown>(
                join(folderDir, FOLDER_FILE),
            ).catch(() => undefined);
            if (raw === undefined) continue;
            let folder: SessionFolder;
            try {
                folder = parseFolder(raw);
            } catch {
                continue;
            }
            if (folder.id !== entry.name) continue;
            folders.push({ dir: folderDir, folder, parentId });
            folders.push(
                ...(await this.scanFolders(folderDir, folder.id, depth + 1)),
            );
        }
        return folders;
    }

    private async scanSessions(
        dir: string,
        folderId: string | null,
        depth: number,
    ): Promise<SessionEntry[]> {
        if (depth >= MAX_TREE_DEPTH) return [];
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return [];
        }

        const sessions: SessionEntry[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const child = join(dir, entry.name);
            if (FOLDER_ID_PATTERN.test(entry.name)) {
                sessions.push(
                    ...(await this.scanSessions(child, entry.name, depth + 1)),
                );
            } else if (SESSION_ID_PATTERN.test(entry.name)) {
                if (await pathExists(join(child, SESSION_FILE))) {
                    sessions.push({ dir: child, folderId });
                }
            }
        }
        return sessions;
    }

    private async readTree(
        dir: string,
        folderId: string | null,
        depth: number,
    ): Promise<SessionTreeNode[]> {
        if (depth >= MAX_TREE_DEPTH) return [];
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return [];
        }

        const nodes: SessionTreeNode[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const child = join(dir, entry.name);

            if (FOLDER_ID_PATTERN.test(entry.name)) {
                const raw = await readJsonFile<unknown>(
                    join(child, FOLDER_FILE),
                ).catch(() => undefined);
                if (raw === undefined) continue;
                let folder: SessionFolder;
                try {
                    folder = parseFolder(raw);
                } catch {
                    continue;
                }
                if (folder.id !== entry.name) continue;
                nodes.push({
                    type: "folder",
                    folder,
                    children: await this.readTree(child, folder.id, depth + 1),
                });
                continue;
            }

            if (SESSION_ID_PATTERN.test(entry.name)) {
                const raw = await readJsonFile<unknown>(
                    join(child, SESSION_FILE),
                ).catch(() => undefined);
                if (raw === undefined) continue;
                let record: SessionRecord;
                try {
                    record = normalizeRecord(parseRecord(raw), folderId);
                } catch {
                    continue;
                }
                if (record.id !== entry.name) continue;
                nodes.push({ type: "session", session: toSummary(record) });
            }
        }

        return nodes.sort(compareTreeNodes);
    }

    private async currentDraftFolderId(): Promise<string | null> {
        if (this.draftFolderId !== undefined) return this.draftFolderId;

        const configured =
            this.options.getSettings?.().draftSessionFolderId ?? null;
        if (configured !== null) {
            const existing = await this.findFolderEntry(configured);
            if (existing !== undefined) {
                this.draftFolderId = configured;
                return configured;
            }
        }

        this.draftFolderId = null;
        return null;
    }

    private async ensureDraftFolder(): Promise<string | null> {
        const current = await this.currentDraftFolderId();
        if (current !== null) return current;

        const folders = await this.scanFolders(this.root, null, 0);
        const existing = folders.find(
            (entry) =>
                entry.parentId === null && entry.folder.title === "草稿",
        );
        if (existing !== undefined) {
            this.draftFolderId = existing.folder.id;
            await this.persistDraftFolder(existing.folder.id);
            return existing.folder.id;
        }

        const created = await this.createFolder({
            title: "草稿",
            parentFolderId: null,
        });
        this.draftFolderId = created.id;
        await this.persistDraftFolder(created.id);
        return created.id;
    }

    private async persistDraftFolder(folderId: string): Promise<void> {
        try {
            await this.options.updateSettings?.({ draftSessionFolderId: folderId });
        } catch {
            // 设置写入失败不应阻塞 Session 树；下次打开会重新 adopt 或创建。
        }
    }
}

function parseFolder(value: unknown): SessionFolder {
    if (!isRecord(value)) {
        throw new FhError("E_IO", "session folder must be an object");
    }
    if (
        value.schemaVersion !== FOLDER_SCHEMA_VERSION ||
        typeof value.id !== "string" ||
        !FOLDER_ID_PATTERN.test(value.id) ||
        typeof value.title !== "string" ||
        typeof value.createdAt !== "string" ||
        typeof value.updatedAt !== "string"
    ) {
        throw new FhError("E_IO", "session folder is invalid");
    }
    return value as SessionFolder;
}

function parseRecord(value: unknown): SessionRecord {
    if (!isRecord(value)) {
        throw new FhError("E_IO", "session record must be an object");
    }

    const schemaVersion = value.schemaVersion;
    if (schemaVersion !== 1 && schemaVersion !== SESSION_SCHEMA_VERSION) {
        throw new FhError("E_IO", "session record version is invalid");
    }
    if (
        typeof value.id !== "string" ||
        typeof value.title !== "string" ||
        typeof value.status !== "string" ||
        !STATUSES.includes(value.status as SessionStatus) ||
        typeof value.createdAt !== "string" ||
        typeof value.updatedAt !== "string" ||
        typeof value.messageCount !== "number" ||
        !Array.isArray(value.attachments)
    ) {
        throw new FhError("E_IO", "session record is invalid");
    }

    if (schemaVersion === 1) {
        return {
            schemaVersion: SESSION_SCHEMA_VERSION,
            id: value.id,
            title: value.title,
            kind: "conversation",
            status: value.status as SessionStatus,
            folderId: null,
            createdAt: value.createdAt,
            updatedAt: value.updatedAt,
            messageCount: value.messageCount,
            entryCount: 0,
            history: value.history,
            attachments: value.attachments as string[],
        };
    }

    if (
        typeof value.kind !== "string" ||
        !KINDS.includes(value.kind as SessionKind) ||
        (value.folderId !== null &&
            (typeof value.folderId !== "string" ||
                !FOLDER_ID_PATTERN.test(value.folderId))) ||
        typeof value.entryCount !== "number"
    ) {
        throw new FhError("E_IO", "session record is invalid");
    }

    return value as SessionRecord;
}

function normalizeRecord(
    record: SessionRecord,
    folderId: string | null,
): SessionRecord {
    return {
        ...record,
        schemaVersion: SESSION_SCHEMA_VERSION,
        folderId,
    };
}

function toSummary(record: SessionRecord): SessionSummary {
    return {
        id: record.id,
        title: record.title,
        kind: record.kind,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        folderId: record.folderId,
        messageCount: record.messageCount,
        entryCount: record.entryCount,
    };
}

function flattenSessions(nodes: readonly SessionTreeNode[]): SessionSummary[] {
    const sessions: SessionSummary[] = [];
    for (const node of nodes) {
        if (node.type === "session") {
            sessions.push(node.session);
        } else {
            sessions.push(...flattenSessions(node.children));
        }
    }
    return sessions;
}

function compareTreeNodes(a: SessionTreeNode, b: SessionTreeNode): number {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    if (a.type === "folder" && b.type === "folder") {
        return a.folder.title.localeCompare(b.folder.title, "zh-CN");
    }
    if (a.type === "session" && b.type === "session") {
        return b.session.updatedAt.localeCompare(a.session.updatedAt);
    }
    return 0;
}

function parseHistoryValue(
    value: unknown,
    sessionId: string,
    code: "E_IO" | "E_INVALID_ARGUMENT",
): SessionHistory {
    if (Array.isArray(value)) {
        if (value.length === 0) return new SessionHistory(sessionId);
        throw new FhError(code, "legacy session history must be an empty array");
    }

    try {
        return SessionSerializer.deserialize(value);
    } catch (cause) {
        throw new FhError(
            code,
            `invalid session history: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
    }
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await fs.stat(path);
        return true;
    } catch {
        return false;
    }
}

function isInside(parent: string, child: string): boolean {
    const parentResolved = resolve(parent);
    const childResolved = resolve(child);
    return (
        childResolved === parentResolved ||
        childResolved.startsWith(`${parentResolved}${sep}`)
    );
}

function assertSessionId(id: string): void {
    if (!SESSION_ID_PATTERN.test(id)) {
        throw new FhError("E_INVALID_ARGUMENT", `invalid session id: ${id}`);
    }
}

function assertFolderId(id: string): void {
    if (!FOLDER_ID_PATTERN.test(id)) {
        throw new FhError("E_INVALID_ARGUMENT", `invalid folder id: ${id}`);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
