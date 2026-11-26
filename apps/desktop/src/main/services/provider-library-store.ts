import { access } from "node:fs/promises";
import {
    API_KEY_ERROR_KINDS,
    API_KEY_PROTOCOLS,
    API_KEY_STATUSES,
    FhError,
    PROVIDER_ADAPTER_KINDS,
    PROVIDER_ADAPTER_PROTOCOL,
    PROVIDER_LIBRARY_SCHEMA_VERSION,
    type ApiKeyError,
    type ApiKeyErrorKind,
    type ApiKeyProtocol,
    type ApiKeyRecord,
    type ApiKeyStatus,
    type ModelCapabilitySummary,
    type ModelCatalogEntry,
    type ModelCatalogSource,
    type ProviderAdapterKind,
    type ProviderLibrary,
    type ProviderProfile,
} from "@flowharness/contracts";
import { readJsonFile, writeJsonFile } from "./atomic-file";

/** 与 `SecretsStore` / 旧 providerId 保持一致的 id 约束。 */
export const PROVIDER_LIBRARY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const MODEL_CATALOG_SOURCES: readonly ModelCatalogSource[] = [
    "api",
    "builtin",
    "manual",
];

const CAPABILITY_BOOLEAN_KEYS = [
    "chat",
    "generate",
    "decide",
    "embed",
    "tools",
    "thinking",
    "vision",
] as const;

export function emptyProviderLibrary(): ProviderLibrary {
    return {
        schemaVersion: PROVIDER_LIBRARY_SCHEMA_VERSION,
        keys: [],
        profiles: [],
    };
}

/**
 * 宽容解析：顶层不合法返回 null；单条记录不合法时丢弃该条；
 * 缺失 / 协议不匹配的 key 引用会被清空，交给 UI 显示为“未绑定密钥”。
 */
export function parseProviderLibrary(value: unknown): ProviderLibrary | null {
    if (!isRecord(value)) return null;
    if (value.schemaVersion !== PROVIDER_LIBRARY_SCHEMA_VERSION) return null;

    const rawKeys = Array.isArray(value.keys) ? value.keys : [];
    const rawProfiles = Array.isArray(value.profiles) ? value.profiles : [];

    const keys: ApiKeyRecord[] = [];
    const seenKeys = new Set<string>();
    rawKeys.forEach((item, index) => {
        try {
            const key = readApiKey(item, `keys[${String(index)}]`);
            if (seenKeys.has(key.id)) return;
            seenKeys.add(key.id);
            keys.push(key);
        } catch {
            // 丢掉坏条目；不阻塞整个库。
        }
    });

    const keyById = new Map(keys.map((key) => [key.id, key]));
    const profiles: ProviderProfile[] = [];
    const seenProfiles = new Set<string>();
    rawProfiles.forEach((item, index) => {
        try {
            const profile = readProfile(item, `profiles[${String(index)}]`);
            if (seenProfiles.has(profile.id)) return;
            seenProfiles.add(profile.id);

            if (profile.apiKeyId !== undefined) {
                const key = keyById.get(profile.apiKeyId);
                if (
                    key === undefined ||
                    PROVIDER_ADAPTER_PROTOCOL[profile.adapter] !== key.protocol
                ) {
                    delete profile.apiKeyId;
                }
            }
            profiles.push(profile);
        } catch {
            // 同上：单条坏记录不影响其它 Provider。
        }
    });

    return {
        schemaVersion: PROVIDER_LIBRARY_SCHEMA_VERSION,
        keys,
        profiles,
    };
}

/**
 * 严格校验：用于写入。
 *
 * 与 `parseProviderLibrary` 的区别是任何不合法字段都会抛 `E_INVALID_ARGUMENT`，
 * 并且要求 profile 引用的 key 必须存在且协议匹配。
 */
export function assertProviderLibrary(value: unknown): ProviderLibrary {
    const record = asRecord(value, "provider library");
    if (record.schemaVersion !== PROVIDER_LIBRARY_SCHEMA_VERSION) {
        throw invalid(
            "schemaVersion",
            `must be ${String(PROVIDER_LIBRARY_SCHEMA_VERSION)}`,
        );
    }
    if (!Array.isArray(record.keys)) {
        throw invalid("keys", "must be an array");
    }
    if (!Array.isArray(record.profiles)) {
        throw invalid("profiles", "must be an array");
    }

    const keys = record.keys.map((item, index) =>
        readApiKey(item, `keys[${String(index)}]`),
    );
    const keyById = new Map<string, ApiKeyRecord>();
    for (const key of keys) {
        if (keyById.has(key.id)) throw invalid(`keys.${key.id}`, "duplicate id");
        keyById.set(key.id, key);
    }

    const profiles = record.profiles.map((item, index) =>
        readProfile(item, `profiles[${String(index)}]`),
    );
    const profileIds = new Set<string>();
    for (const profile of profiles) {
        if (profileIds.has(profile.id)) {
            throw invalid(`profiles.${profile.id}`, "duplicate id");
        }
        profileIds.add(profile.id);

        if (profile.apiKeyId === undefined) continue;
        const key = keyById.get(profile.apiKeyId);
        if (key === undefined) {
            throw invalid(
                `profiles.${profile.id}.apiKeyId`,
                `references missing key ${profile.apiKeyId}`,
            );
        }
        const expected = PROVIDER_ADAPTER_PROTOCOL[profile.adapter];
        if (key.protocol !== expected) {
            throw invalid(
                `profiles.${profile.id}.apiKeyId`,
                `key protocol ${key.protocol} does not match adapter ${profile.adapter}`,
            );
        }
    }

    return {
        schemaVersion: PROVIDER_LIBRARY_SCHEMA_VERSION,
        keys,
        profiles,
    };
}

/** 应用级 Provider 库文件；不存在时读取为空库，不自动落盘。 */
export class ProviderLibraryStore {
    constructor(private readonly filePath: string) {}

    get path(): string {
        return this.filePath;
    }

    async exists(): Promise<boolean> {
        try {
            await access(this.filePath);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw error;
        }
    }

    async load(): Promise<ProviderLibrary> {
        let raw: unknown;
        try {
            raw = await readJsonFile<unknown>(this.filePath);
        } catch (error) {
            // 只有“读到了但内容坏”才重置；权限 / IO 错误不能被当成损坏数据清空。
            if (!(error instanceof SyntaxError)) throw error;
            await this.backupCorrupt(undefined, errorMessage(error));
            await this.persistEmpty();
            return emptyProviderLibrary();
        }

        if (raw === undefined) return emptyProviderLibrary();

        if (
            isRecord(raw) &&
            typeof raw.schemaVersion === "number" &&
            raw.schemaVersion > PROVIDER_LIBRARY_SCHEMA_VERSION
        ) {
            throw new FhError(
                "E_MIGRATION",
                `provider library schema ${String(raw.schemaVersion)} is newer than supported ${String(PROVIDER_LIBRARY_SCHEMA_VERSION)}`,
            );
        }

        const parsed = parseProviderLibrary(raw);
        if (parsed === null) {
            await this.backupCorrupt(raw, "invalid provider library");
            await this.persistEmpty();
            return emptyProviderLibrary();
        }

        return parsed;
    }

    async save(value: ProviderLibrary): Promise<ProviderLibrary> {
        const normalized = assertProviderLibrary(value);
        try {
            await writeJsonFile(this.filePath, normalized);
        } catch (error) {
            throw new FhError(
                "E_IO",
                `无法写入 Provider 库（${this.filePath}）：${errorMessage(error)}`,
            );
        }
        return normalized;
    }

    private async backupCorrupt(raw: unknown, reason: string): Promise<void> {
        const backup = `${this.filePath}.corrupt-${String(Date.now())}.json`;
        try {
            await writeJsonFile(backup, {
                note: "unreadable provider library was backed up",
                reason,
                ...(raw === undefined ? {} : { raw }),
            });
        } catch {
            // 备份失败不影响后续以空库启动。
        }
    }

    private async persistEmpty(): Promise<void> {
        try {
            await writeJsonFile(this.filePath, emptyProviderLibrary());
        } catch {
            // 受限环境可能禁止写盘；保持内存态即可。
        }
    }
}

function readApiKey(value: unknown, path: string): ApiKeyRecord {
    const record = asRecord(value, path);
    const id = readId(record.id, `${path}.id`);
    const protocol = readProtocol(record.protocol, `${path}.protocol`);
    const label = readRequiredString(record.label, `${path}.label`).trim();
    if (label.length === 0) throw invalid(`${path}.label`, "must not be blank");

    const status = readStatus(record.status, `${path}.status`);
    const baseUrl = readOptionalUrl(record.baseUrl, `${path}.baseUrl`);
    const fingerprint = readOptionalString(
        record.fingerprint,
        `${path}.fingerprint`,
    );
    const lastCheckedAt = readOptionalString(
        record.lastCheckedAt,
        `${path}.lastCheckedAt`,
    );
    const lastError =
        record.lastError === undefined
            ? undefined
            : readApiKeyError(record.lastError, `${path}.lastError`);

    return {
        id,
        protocol,
        label,
        status,
        createdAt: readRequiredString(record.createdAt, `${path}.createdAt`),
        updatedAt: readRequiredString(record.updatedAt, `${path}.updatedAt`),
        ...(baseUrl === undefined ? {} : { baseUrl }),
        ...(fingerprint === undefined ? {} : { fingerprint }),
        ...(lastCheckedAt === undefined ? {} : { lastCheckedAt }),
        ...(lastError === undefined ? {} : { lastError }),
    };
}

function readApiKeyError(value: unknown, path: string): ApiKeyError {
    const record = asRecord(value, path);
    const kind = readString(record.kind, `${path}.kind`);
    if (!API_KEY_ERROR_KINDS.includes(kind as ApiKeyErrorKind)) {
        throw invalid(`${path}.kind`, `unknown api key error kind: ${kind}`);
    }
    const httpStatus = record.httpStatus;
    if (
        httpStatus !== undefined &&
        (typeof httpStatus !== "number" || !Number.isInteger(httpStatus))
    ) {
        throw invalid(`${path}.httpStatus`, "must be an integer");
    }

    return {
        kind: kind as ApiKeyErrorKind,
        message: readRequiredString(record.message, `${path}.message`),
        at: readRequiredString(record.at, `${path}.at`),
        ...(httpStatus === undefined ? {} : { httpStatus }),
    };
}

function readProfile(value: unknown, path: string): ProviderProfile {
    const record = asRecord(value, path);
    const id = readId(record.id, `${path}.id`);
    const label = readRequiredString(record.label, `${path}.label`).trim();
    if (label.length === 0) throw invalid(`${path}.label`, "must not be blank");

    const adapter = readAdapter(record.adapter, `${path}.adapter`);
    const apiKeyId =
        record.apiKeyId === undefined
            ? undefined
            : readId(record.apiKeyId, `${path}.apiKeyId`);
    const baseUrl = readOptionalUrl(record.baseUrl, `${path}.baseUrl`);
    const defaultModelId = readOptionalString(
        record.defaultModelId,
        `${path}.defaultModelId`,
    );
    if (typeof record.enabled !== "boolean") {
        throw invalid(`${path}.enabled`, "must be a boolean");
    }

    const models = Array.isArray(record.models)
        ? record.models.map((item, index) =>
              readModelCatalogEntry(item, `${path}.models[${String(index)}]`),
          )
        : [];
    const modelsFetchedAt = readOptionalString(
        record.modelsFetchedAt,
        `${path}.modelsFetchedAt`,
    );
    const modelsSource =
        record.modelsSource === undefined
            ? undefined
            : readModelCatalogSource(record.modelsSource, `${path}.modelsSource`);

    return {
        id,
        label,
        adapter,
        enabled: record.enabled,
        models,
        createdAt: readRequiredString(record.createdAt, `${path}.createdAt`),
        updatedAt: readRequiredString(record.updatedAt, `${path}.updatedAt`),
        ...(apiKeyId === undefined ? {} : { apiKeyId }),
        ...(baseUrl === undefined ? {} : { baseUrl }),
        ...(defaultModelId === undefined ? {} : { defaultModelId }),
        ...(modelsFetchedAt === undefined ? {} : { modelsFetchedAt }),
        ...(modelsSource === undefined ? {} : { modelsSource }),
    };
}

function readModelCatalogEntry(value: unknown, path: string): ModelCatalogEntry {
    const record = asRecord(value, path);
    const id = readRequiredString(record.id, `${path}.id`).trim();
    if (id.length === 0) throw invalid(`${path}.id`, "must not be blank");

    const name = readOptionalString(record.name, `${path}.name`)?.trim() || id;

    const size = record.size;
    if (
        size !== undefined &&
        (typeof size !== "number" || !Number.isFinite(size) || size < 0)
    ) {
        throw invalid(`${path}.size`, "must be a non-negative number");
    }

    const capabilities = readModelCapabilities(
        record.capabilities,
        `${path}.capabilities`,
    );
    const thinkingLevels = readThinkingLevels(
        record.thinkingLevels,
        `${path}.thinkingLevels`,
    );

    return {
        id,
        name,
        ...(size === undefined ? {} : { size }),
        ...(capabilities === undefined ? {} : { capabilities }),
        ...(thinkingLevels === undefined ? {} : { thinkingLevels }),
    };
}

function readModelCapabilities(
    value: unknown,
    path: string,
): ModelCapabilitySummary | undefined {
    if (value === undefined) return undefined;
    const record = asRecord(value, path);
    const result: ModelCapabilitySummary = {};

    for (const key of CAPABILITY_BOOLEAN_KEYS) {
        const candidate = record[key];
        if (candidate === undefined) continue;
        if (typeof candidate !== "boolean") {
            throw invalid(`${path}.${key}`, "must be a boolean");
        }
        result[key] = candidate;
    }

    for (const key of ["inputs", "outputs"] as const) {
        const candidate = record[key];
        if (candidate === undefined) continue;
        if (
            !Array.isArray(candidate) ||
            !candidate.every((entry) => typeof entry === "string")
        ) {
            throw invalid(`${path}.${key}`, "must be an array of strings");
        }
        result[key] = candidate;
    }

    return Object.keys(result).length === 0 ? undefined : result;
}

function readThinkingLevels(
    value: unknown,
    path: string,
): readonly (string | number)[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw invalid(path, "must be an array");
    }
    const levels = value.filter(
        (entry): entry is string | number =>
            typeof entry === "string" || typeof entry === "number",
    );
    return levels.length === 0 ? undefined : levels;
}

function readProtocol(value: unknown, path: string): ApiKeyProtocol {
    const protocol = readString(value, path);
    if (!API_KEY_PROTOCOLS.includes(protocol as ApiKeyProtocol)) {
        throw invalid(path, `unknown protocol: ${protocol}`);
    }
    return protocol as ApiKeyProtocol;
}

function readAdapter(value: unknown, path: string): ProviderAdapterKind {
    const adapter = readString(value, path);
    if (!PROVIDER_ADAPTER_KINDS.includes(adapter as ProviderAdapterKind)) {
        throw invalid(path, `unknown provider adapter: ${adapter}`);
    }
    return adapter as ProviderAdapterKind;
}

function readStatus(value: unknown, path: string): ApiKeyStatus {
    const status = readString(value, path);
    if (!API_KEY_STATUSES.includes(status as ApiKeyStatus)) {
        throw invalid(path, `unknown api key status: ${status}`);
    }
    return status as ApiKeyStatus;
}

function readModelCatalogSource(
    value: unknown,
    path: string,
): ModelCatalogSource {
    const source = readString(value, path);
    if (!MODEL_CATALOG_SOURCES.includes(source as ModelCatalogSource)) {
        throw invalid(path, `unknown model catalog source: ${source}`);
    }
    return source as ModelCatalogSource;
}

function readId(value: unknown, path: string): string {
    const id = readString(value, path);
    if (!PROVIDER_LIBRARY_ID_PATTERN.test(id)) {
        throw invalid(path, `invalid id: ${id}`);
    }
    return id;
}

function readRequiredString(value: unknown, path: string): string {
    const text = readString(value, path);
    if (text.length === 0) throw invalid(path, "must be a non-empty string");
    return text;
}

function readOptionalString(
    value: unknown,
    path: string,
): string | undefined {
    if (value === undefined) return undefined;
    return readString(value, path);
}

function readOptionalUrl(value: unknown, path: string): string | undefined {
    const text = readOptionalString(value, path)?.trim();
    return text === undefined || text.length === 0 ? undefined : text;
}

function readString(value: unknown, path: string): string {
    if (typeof value !== "string") {
        throw invalid(path, "must be a string");
    }
    return value;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw invalid(path, "must be an object");
    }
    return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(path: string, message: string): FhError {
    return new FhError("E_INVALID_ARGUMENT", `${path} ${message}`);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
