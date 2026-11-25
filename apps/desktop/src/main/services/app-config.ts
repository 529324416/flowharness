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

export const APP_CONFIG_SCHEMA_VERSION = 1;

const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"];
const LANGUAGES: readonly AppConfig["language"][] = ["zh-CN", "en-US"];
const PROVIDER_KINDS: readonly ProviderKind[] = [
    "deepseek",
    "ollama",
    "minimax",
    "qwen",
];

function defaultProviders(): ProviderConfig[] {
    return [
        {
            id: "ollama",
            kind: "ollama",
            label: "Ollama",
            enabled: true,
            baseUrl: "http://127.0.0.1:11434",
        },
        {
            id: "deepseek",
            kind: "deepseek",
            label: "DeepSeek",
            enabled: false,
        },
        {
            id: "minimax",
            kind: "minimax",
            label: "MiniMax",
            enabled: false,
        },
        {
            id: "qwen",
            kind: "qwen",
            label: "Qwen",
            enabled: false,
        },
    ];
}

export function createDefaultAppConfig(workspaceRoot: string): AppConfig {
    return {
        schemaVersion: APP_CONFIG_SCHEMA_VERSION,
        theme: "dark",
        workspaceRoot,
        recentWorkspaces: [],
        language: "zh-CN",
        devtools: true,
        providers: defaultProviders(),
    };
}

/**
 * 应用级配置：`%APPDATA%/FlowHarness/config.json`。
 *
 * - 读取时宽容（坏字段回退默认值，坏文件备份后重建）；
 * - 更新时严格（非法字段直接拒绝，绝不静默写坏）；
 * - 与工作区设置、Provider 密钥完全分离。
 */
export class AppConfigStore {
    private current?: AppConfig;
    private readonly defaults: AppConfig;

    constructor(
        private readonly filePath: string,
        defaults: AppConfig,
    ) {
        this.defaults = structuredClone(defaults);
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
        return next;
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

        const migrated = migrateConfig(raw);
        const coerced = coerceConfig(migrated, this.defaults);

        if (JSON.stringify(migrated) !== JSON.stringify(coerced)) {
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
        providers: Array.isArray(candidate.providers)
            ? candidate.providers.filter(isProviderConfig).map(normalizeProvider)
            : defaults.providers,
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

    let providers = current.providers;
    if (patch.providers !== undefined) {
        if (!Array.isArray(patch.providers)) {
            throw new FhError("E_INVALID_ARGUMENT", "providers must be an array");
        }
        providers = validateProviders(patch.providers);
    }

    return {
        ...current,
        theme: patch.theme ?? current.theme,
        workspaceRoot: patch.workspaceRoot ?? current.workspaceRoot,
        language: patch.language ?? current.language,
        devtools: patch.devtools ?? current.devtools,
        providers,
    };
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

function validateProviders(value: unknown[]): ProviderConfig[] {
    const seen = new Set<string>();
    return value.map((item, index) => {
        if (!isProviderConfig(item)) {
            throw new FhError(
                "E_INVALID_ARGUMENT",
                `providers[${String(index)}] is invalid`,
            );
        }
        if (seen.has(item.id)) {
            throw new FhError(
                "E_INVALID_ARGUMENT",
                `duplicate provider id: ${item.id}`,
            );
        }
        seen.add(item.id);
        return normalizeProvider(item);
    });
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
