import {
    FhError,
    type AppConfig,
    type AppConfigUpdate,
    type ProviderConfig,
    type ProviderKind,
    type RecentWorkspace,
    type ThemeMode,
} from "@flowharness/contracts";
import { readJsonFile, writeJsonFile } from "./atomic-file";

export const APP_CONFIG_SCHEMA_VERSION = 2;

const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"];
const LANGUAGES: readonly AppConfig["language"][] = ["zh-CN", "en-US"];
const PROVIDER_KINDS: readonly ProviderKind[] = [
    "deepseek",
    "ollama",
    "minimax",
    "qwen",
];

export function createDefaultAppConfig(workspaceRoot: string): AppConfig {
    return {
        schemaVersion: APP_CONFIG_SCHEMA_VERSION,
        theme: "dark",
        workspaceRoot,
        recentWorkspaces: [],
        language: "zh-CN",
        devtools: true,
    };
}

/**
 * 首次安装 / v2 配置但 Provider 库尚不存在时的默认 Provider 列表。
 *
 * 与 M9 之前的默认值保持一致；只用于播种 Provider 库，不再写回 AppConfig。
 */
export function defaultProviderConfigs(): ProviderConfig[] {
    return [
        {
            id: "ollama",
            kind: "ollama",
            label: "Ollama",
            enabled: true,
            baseUrl: "http://127.0.0.1:11434",
        },
        { id: "deepseek", kind: "deepseek", label: "DeepSeek", enabled: false },
        { id: "minimax", kind: "minimax", label: "MiniMax", enabled: false },
        { id: "qwen", kind: "qwen", label: "Qwen", enabled: false },
    ];
}

/**
 * 应用级配置：`%APPDATA%/FlowHarness/config.json`。
 *
 * - 读取时宽容（坏字段回退默认值，坏文件备份后重建）；
 * - 更新时严格（非法字段直接拒绝，绝不静默写坏）；
 * - schemaVersion 2 起移除 `providers`；v1 的旧 Provider 列表只在迁移时通过
 *   `legacyProviders` 暴露一次，由 main 播种 Provider 库。
 */
export class AppConfigStore {
    private current?: AppConfig;
    private readonly defaults: AppConfig;
    private legacy: ProviderConfig[] = [];
    private pendingMigration = false;

    constructor(
        private readonly filePath: string,
        defaults: AppConfig,
    ) {
        this.defaults = structuredClone(defaults);
    }

    /** 从 v1 配置读取到的旧 Provider 列表；只用于 M9.3 一次性迁移。 */
    get legacyProviders(): readonly ProviderConfig[] {
        return this.legacy;
    }

    async get(): Promise<AppConfig> {
        if (!this.current) {
            this.current = await this.load();
        }
        return this.current;
    }

    async update(patch: AppConfigUpdate): Promise<AppConfig> {
        const current = await this.get();
        const next = applyPatch(current, patch);
        await this.persist(next);
        this.current = next;
        return next;
    }

    async reset(): Promise<AppConfig> {
        const next = structuredClone(this.defaults);
        await this.persist(next);
        this.current = next;
        this.legacy = [];
        this.pendingMigration = false;
        return next;
    }

    /**
     * v1 → v2 的落盘握手。
     *
     * main 在 Provider 库确认存在后调用；这样库写入失败时 AppConfig 仍保持 v1，
     * 下次启动还能拿到 legacy providers 重试，不会出现「配置已 v2、Provider 库为空」。
     */
    async finalizeMigration(): Promise<void> {
        if (!this.pendingMigration) return;
        const current = await this.get();
        await this.persist(current);
        this.pendingMigration = false;
    }

    /** 记录最近打开的工作区（最多 10 条，按最近优先）。 */
    async addRecentWorkspace(entry: RecentWorkspace): Promise<AppConfig> {
        const current = await this.get();
        const next: AppConfig = {
            ...current,
            recentWorkspaces: [
                entry,
                ...current.recentWorkspaces.filter((item) => item.id !== entry.id),
            ].slice(0, 10),
        };
        await this.persist(next);
        this.current = next;
        return next;
    }

    private async load(): Promise<AppConfig> {
        let raw: unknown;

        try {
            raw = await readJsonFile<unknown>(this.filePath);
        } catch {
            await this.backupCorruptFile();
            raw = undefined;
        }

        if (raw === undefined) {
            const fresh = structuredClone(this.defaults);
            await this.persist(fresh);
            return fresh;
        }

        this.legacy = readLegacyProviders(raw);
        const version =
            typeof (raw as { schemaVersion?: unknown }).schemaVersion === "number"
                ? (raw as { schemaVersion: number }).schemaVersion
                : 0;
        const migrated = migrateConfig(raw);
        const coerced = coerceConfig(migrated, this.defaults);

        if (version === 1) {
            // 先留在内存；等 main 确认 Provider 库落盘后再 finalize。
            this.pendingMigration = true;
        } else if (JSON.stringify(migrated) !== JSON.stringify(coerced)) {
            await this.persist(coerced);
        }

        return coerced;
    }

    private async persist(config: AppConfig): Promise<void> {
        try {
            await writeJsonFile(this.filePath, config);
        } catch (error) {
            // 受限环境（CI/沙箱）可能禁止写盘；配置退化为内存态，不阻塞启动。
            console.warn(
                "[config] cannot persist app config; running in memory",
                (error as Error).message,
            );
        }
    }

    private async backupCorruptFile(): Promise<void> {
        const backup = `${this.filePath}.corrupt-${Date.now()}.json`;
        try {
            await writeJsonFile(backup, { note: "unreadable config was backed up" });
        } catch {
            // 备份失败不影响后续以默认值启动。
        }
    }
}

function migrateConfig(raw: unknown): unknown {
    if (!raw || typeof raw !== "object") {
        throw new FhError("E_INVALID_ARGUMENT", "app config must be a JSON object");
    }

    const candidate = raw as { schemaVersion?: unknown };
    const version =
        typeof candidate.schemaVersion === "number" ? candidate.schemaVersion : 0;

    if (version > APP_CONFIG_SCHEMA_VERSION) {
        throw new FhError(
            "E_MIGRATION",
            `app config schema ${version} is newer than supported ${APP_CONFIG_SCHEMA_VERSION}`,
        );
    }

    if (version < 1) {
        throw new FhError("E_MIGRATION", "app config is missing schemaVersion");
    }

    if (version === 1) {
        return { ...raw, schemaVersion: APP_CONFIG_SCHEMA_VERSION };
    }

    return candidate;
}

function coerceConfig(raw: unknown, defaults: AppConfig): AppConfig {
    const candidate = (raw ?? {}) as Partial<AppConfig>;

    return {
        schemaVersion: APP_CONFIG_SCHEMA_VERSION,
        theme: THEME_MODES.includes(candidate.theme as ThemeMode)
            ? (candidate.theme as ThemeMode)
            : defaults.theme,
        workspaceRoot:
            typeof candidate.workspaceRoot === "string" &&
            candidate.workspaceRoot.trim().length > 0
                ? candidate.workspaceRoot
                : defaults.workspaceRoot,
        recentWorkspaces: Array.isArray(candidate.recentWorkspaces)
            ? candidate.recentWorkspaces.filter(isRecentWorkspace)
            : [],
        language: LANGUAGES.includes(candidate.language as AppConfig["language"])
            ? (candidate.language as AppConfig["language"])
            : defaults.language,
        devtools:
            typeof candidate.devtools === "boolean"
                ? candidate.devtools
                : defaults.devtools,
    };
}

function applyPatch(current: AppConfig, patch: AppConfigUpdate): AppConfig {
    if (!patch || typeof patch !== "object") {
        throw new FhError("E_INVALID_ARGUMENT", "config patch must be an object");
    }

    if (patch.theme !== undefined && !THEME_MODES.includes(patch.theme)) {
        throw new FhError("E_INVALID_ARGUMENT", "theme must be light, dark or system");
    }

    if (
        patch.workspaceRoot !== undefined &&
        (typeof patch.workspaceRoot !== "string" ||
            patch.workspaceRoot.trim().length === 0)
    ) {
        throw new FhError("E_INVALID_ARGUMENT", "workspaceRoot must be a non-empty string");
    }

    if (patch.language !== undefined && !LANGUAGES.includes(patch.language)) {
        throw new FhError("E_INVALID_ARGUMENT", "language must be zh-CN or en-US");
    }

    if (patch.devtools !== undefined && typeof patch.devtools !== "boolean") {
        throw new FhError("E_INVALID_ARGUMENT", "devtools must be a boolean");
    }

    return {
        ...current,
        theme: patch.theme ?? current.theme,
        workspaceRoot: patch.workspaceRoot ?? current.workspaceRoot,
        language: patch.language ?? current.language,
        devtools: patch.devtools ?? current.devtools,
    };
}

/**
 * v1 → v2 迁移：把旧 `providers` 数组读出来留给 Provider 库迁移。
 *
 * 不做严格拒绝：坏条目丢弃；真正写入 v2 的配置由 `coerceConfig` 负责。
 */
function readLegacyProviders(raw: unknown): ProviderConfig[] {
    if (!raw || typeof raw !== "object") return [];
    const candidate = raw as { schemaVersion?: unknown; providers?: unknown };
    if (candidate.schemaVersion !== 1) return [];
    if (!Array.isArray(candidate.providers)) return [];
    return candidate.providers
        .filter(isProviderConfig)
        .map(normalizeProvider);
}

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function isProviderConfig(value: unknown): value is ProviderConfig {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Partial<ProviderConfig>;
    return (
        typeof record.id === "string" &&
        PROVIDER_ID_PATTERN.test(record.id) &&
        typeof record.kind === "string" &&
        PROVIDER_KINDS.includes(record.kind as ProviderKind) &&
        typeof record.label === "string" &&
        typeof record.enabled === "boolean" &&
        (record.baseUrl === undefined || typeof record.baseUrl === "string") &&
        (record.model === undefined || typeof record.model === "string")
    );
}

function normalizeProvider(provider: ProviderConfig): ProviderConfig {
    return {
        id: provider.id,
        kind: provider.kind,
        label: provider.label.trim() || provider.kind,
        enabled: provider.enabled,
        ...(provider.baseUrl === undefined || provider.baseUrl.trim() === ""
            ? {}
            : { baseUrl: provider.baseUrl.trim() }),
        ...(provider.model === undefined || provider.model.trim() === ""
            ? {}
            : { model: provider.model.trim() }),
    };
}

function isRecentWorkspace(value: unknown): value is RecentWorkspace {
    if (!value || typeof value !== "object") return false;
    const record = value as Partial<RecentWorkspace>;
    return (
        typeof record.id === "string" &&
        typeof record.path === "string" &&
        typeof record.name === "string" &&
        typeof record.openedAt === "string"
    );
}
