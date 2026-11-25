import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
    SessionRecord,
    SessionStatus,
    SessionSummary,
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
const STATUSES: readonly SessionStatus[] = [
    "idle",
    "running",
    "completed",
    "failed",
];

/** 工作区会话存储：`sessions/<sessionId>/session.json`。 */
export class SessionStore {
    constructor(private readonly root: string) {}

    async list(): Promise<SessionSummary[]> {
        let entries;
        try {
            entries = await fs.readdir(this.root, { withFileTypes: true });
        } catch {
            return [];
        }

        const summaries: SessionSummary[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory() || !SESSION_ID_PATTERN.test(entry.name)) {
                continue;
            }
            const record = await this.read(entry.name).catch(() => undefined);
            if (record !== undefined) summaries.push(toSummary(record));
        }
        return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    async ensureDefault(): Promise<SessionRecord> {
        const existing = await this.list();
        if (existing.length > 0) {
            return this.read(existing[0]!.id);
        }
        return this.create({ title: "主会话" });
    }

    async create(input: { title?: string } = {}): Promise<SessionRecord> {
        const now = new Date().toISOString();
        const id = `ses_${randomBytes(6).toString("hex")}`;
        const record: SessionRecord = {
            schemaVersion: 1,
            id,
            title: input.title?.trim() || "未命名会话",
            status: "idle",
            createdAt: now,
            updatedAt: now,
            messageCount: 0,
            history: SessionSerializer.serialize(new SessionHistory(id)),
            attachments: [],
        };
        await this.write(record);
        return record;
    }

    async read(sessionId: string): Promise<SessionRecord> {
        assertId(sessionId);
        const raw = await readJsonFile<unknown>(
            join(this.root, sessionId, "session.json"),
        );
        if (raw === undefined) {
            throw new FhError("E_NOT_FOUND", `session not found: ${sessionId}`);
        }
        return normalizeRecord(parseRecord(raw), sessionId);
    }

    async save(record: SessionRecord): Promise<SessionRecord> {
        assertId(record.id);
        const existing = await this.read(record.id).catch(() => undefined);
        const history = parseHistoryValue(
            record.history,
            record.id,
            "E_INVALID_ARGUMENT",
        );
        const next: SessionRecord = {
            ...record,
            schemaVersion: 1,
            history: SessionSerializer.serialize(history),
            createdAt: existing?.createdAt ?? record.createdAt,
            updatedAt: new Date().toISOString(),
            messageCount: history.messages.length,
            attachments: collectAttachmentHashes(history.messages).filter(
                isContentHash,
            ),
        };
        await this.write(next);
        return next;
    }

    async delete(sessionId: string): Promise<boolean> {
        assertId(sessionId);
        try {
            await fs.rm(join(this.root, sessionId), {
                recursive: true,
                force: true,
            });
            return true;
        } catch {
            return false;
        }
    }

    private async write(record: SessionRecord): Promise<void> {
        await fs.mkdir(join(this.root, record.id), { recursive: true });
        await writeJsonFile(
            join(this.root, record.id, "session.json"),
            record,
        );
    }
}

function parseRecord(value: unknown): SessionRecord {
    if (!isRecord(value)) {
        throw new FhError("E_IO", "session record must be an object");
    }
    if (
        value.schemaVersion !== 1 ||
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
    return value as SessionRecord;
}

function normalizeRecord(record: SessionRecord, sessionId: string): SessionRecord {
    return {
        ...record,
        history: SessionSerializer.serialize(
            parseHistoryValue(record.history, sessionId, "E_IO"),
        ),
    };
}

/**
 * 历史字段只接受 wireclaw `SessionData`；M6.2 的空数组在读取/保存时迁移为空会话。
 * 其他形状直接拒绝，避免 UI 拿到无法回放的数据。
 */
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

function toSummary(record: SessionRecord): SessionSummary {
    return {
        id: record.id,
        title: record.title,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        messageCount: record.messageCount,
    };
}

function assertId(id: string): void {
    if (!SESSION_ID_PATTERN.test(id)) {
        throw new FhError("E_INVALID_ARGUMENT", `invalid session id: ${id}`);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
