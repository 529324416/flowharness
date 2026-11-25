import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
    SessionRecord,
    SessionStatus,
    SessionSummary,
} from "@flowharness/contracts";
import { FhError } from "@flowharness/contracts";
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
        const record: SessionRecord = {
            schemaVersion: 1,
            id: `ses_${randomBytes(6).toString("hex")}`,
            title: input.title?.trim() || "未命名会话",
            status: "idle",
            createdAt: now,
            updatedAt: now,
            messageCount: 0,
            history: [],
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
        return parseRecord(raw);
    }

    async save(record: SessionRecord): Promise<SessionRecord> {
        assertId(record.id);
        const existing = await this.read(record.id).catch(() => undefined);
        const next: SessionRecord = {
            ...record,
            schemaVersion: 1,
            createdAt: existing?.createdAt ?? record.createdAt,
            updatedAt: new Date().toISOString(),
            messageCount: Array.isArray(record.history)
                ? record.history.length
                : record.messageCount,
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
