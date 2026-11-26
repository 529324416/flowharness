import { randomBytes } from "node:crypto";
import {
    FhError,
    PROVIDER_ADAPTER_CAPABILITY,
    PROVIDER_ADAPTER_PROTOCOL,
    PROVIDER_ADAPTER_REQUIRES_KEY,
    type ApiKeyAddRequest,
    type ApiKeyAddResult,
    type ApiKeyError,
    type ApiKeyProtocol,
    type ApiKeyRecord,
    type ApiKeyStatus,
    type ApiKeyValidation,
    type ModelCapabilitySummary,
    type ModelCatalogEntry,
    type ModelCatalogSource,
    type ProviderAdapterKind,
    type ProviderCatalogRefreshResult,
    type ProviderConfig,
    type ProviderKind,
    type ProviderLibrary,
    type ProviderLibraryView,
    type ProviderProfile,
    type ProviderProfileCreateRequest,
    type ProviderProfileDeleteRequest,
    type ProviderProfileDeleteResult,
    type ProviderProfileStatus,
    type ProviderProfileUpdateRequest,
    type ProviderStatus,
    type ProviderTestResult,
} from "@flowharness/contracts";
import {
    DeepSeekProvider,
    MiniMaxChatProvider,
    MiniMaxH3ImageProvider,
    MiniMaxH3VideoProvider,
    OllamaProvider,
    QwenChatProvider,
    QwenImageProvider,
    SessionErrorType,
    type AIProvider,
    type ModelInfo,
} from "wireclaw";
import type { SecretsStore } from "./secrets";
import { createKeyFingerprint, migrateLegacyProviders } from "./provider-library-migration";
import {
    emptyProviderLibrary,
    type ProviderLibraryStore,
} from "./provider-library-store";

export type ProviderFactory = (
    profile: ProviderProfile,
    apiKey: string | undefined,
) => AIProvider;

const DEFAULT_FACTORIES: Record<ProviderAdapterKind, ProviderFactory> = {
    "deepseek.chat": (profile, apiKey) => {
        if (apiKey === undefined) throw new Error("DeepSeek requires an API key");
        return new DeepSeekProvider({
            apiKey,
            ...withBaseUrl(profile.baseUrl),
        });
    },
    "ollama.chat": (profile) =>
        new OllamaProvider(profile.baseUrl ?? "http://127.0.0.1:11434"),
    "minimax.chat": (profile, apiKey) => {
        if (apiKey === undefined) throw new Error("MiniMax requires an API key");
        return new MiniMaxChatProvider({
            apiKey,
            ...withBaseUrl(profile.baseUrl),
            ...withModel(profile.defaultModelId),
        });
    },
    "minimax.image": (profile, apiKey) => {
        if (apiKey === undefined) throw new Error("MiniMax image requires an API key");
        return new MiniMaxH3ImageProvider({
            apiKey,
            ...withBaseUrl(profile.baseUrl),
            ...withModel(profile.defaultModelId),
        });
    },
    "minimax.video": (profile, apiKey) => {
        if (apiKey === undefined) throw new Error("MiniMax video requires an API key");
        return new MiniMaxH3VideoProvider({
            apiKey,
            ...withBaseUrl(profile.baseUrl),
            ...withModel(profile.defaultModelId),
        });
    },
    "qwen.chat": (profile, apiKey) => {
        if (apiKey === undefined) throw new Error("Qwen requires an API key");
        return new QwenChatProvider({
            apiKey,
            ...withBaseUrl(profile.baseUrl),
            ...withModel(profile.defaultModelId),
        });
    },
    "qwen.image": (profile, apiKey) => {
        if (apiKey === undefined) throw new Error("Qwen image requires an API key");
        return new QwenImageProvider({
            apiKey,
            ...withBaseUrl(profile.baseUrl),
            ...withModel(profile.defaultModelId),
        });
    },
};

/** 旧 ProviderKind → 等价适配器；迁移与旧设置页兼容使用。 */
const LEGACY_ADAPTER: Record<ProviderKind, ProviderAdapterKind> = {
    deepseek: "deepseek.chat",
    ollama: "ollama.chat",
    minimax: "minimax.chat",
    qwen: "qwen.chat",
};

/** 协议验证探针：优先用同协议的 chat 目录端点验证 key。 */
const PROBE_ADAPTER: Record<ApiKeyProtocol, ProviderAdapterKind> = {
    deepseek: "deepseek.chat",
    qwen: "qwen.chat",
    minimax: "minimax.chat",
    ollama: "ollama.chat",
};

type ProviderEntry = {
    profile: ProviderProfile;
    key?: ApiKeyRecord;
    provider?: AIProvider;
    hasKey: boolean;
    available: boolean;
    error?: string;
};

/**
 * Provider 运行时仓库：把 Provider 库 + SecretsStore 组装成 GraphHost 可解析的 AIProvider。
 *
 * - 只存在 main；renderer 只能拿到 profile / key 元数据 / 模型目录，拿不到密钥；
 * - 启动不联网；`refreshModels` / `addKey` / `revalidateKey` 才发起网络请求；
 * - 旧 `providers:list` / `providers:test` / `secrets:*` 通过兼容方法映射到新库，供 M9.3 前旧设置页使用。
 */
export class ProviderRegistry {
    private library: ProviderLibrary = emptyProviderLibrary();
    private entries = new Map<string, ProviderEntry>();
    private persistenceError: string | undefined;

    constructor(
        private readonly store: ProviderLibraryStore,
        private readonly secrets: SecretsStore,
        private readonly factories: Record<ProviderAdapterKind, ProviderFactory> =
            DEFAULT_FACTORIES,
    ) {}

    /**
     * 加载库并构建实例。
     *
     * 库为空且仍有旧 `AppConfig.providers` 时，在内存里补一次迁移并尽力落盘；
     * 这样受限环境（无法写 AppData）也不会让运行链路失去 Provider。
     */
    async init(legacyProviders: readonly ProviderConfig[] = []): Promise<void> {
        try {
            this.library = await this.store.load();
        } catch (error) {
            if (error instanceof FhError && error.code === "E_MIGRATION") throw error;
            this.persistenceError = errorMessage(error);
            console.warn(
                "[provider-library] load failed; falling back to legacy providers",
                errorMessage(error),
            );
            this.library = emptyProviderLibrary();
        }

        if (this.library.profiles.length === 0 && legacyProviders.length > 0) {
            const migrated = await migrateLegacyProviders({
                library: this.library,
                legacyProviders,
                secrets: this.secrets,
            });
            this.library = migrated.library;
            for (const warning of migrated.warnings) {
                console.warn("[provider-library]", warning);
            }
            try {
                this.library = await this.store.save(this.library);
                this.persistenceError = undefined;
            } catch (error) {
                this.persistenceError = errorMessage(error);
                console.warn(
                    "[provider-library] cannot persist migrated library; using memory",
                    errorMessage(error),
                );
            }
        }

        await this.rebuildEntries();
    }

    /** GraphHost.resolveProvider 使用；未启用 / 缺少密钥 / 构造失败都返回 undefined。 */
    get(providerId: string): AIProvider | undefined {
        return this.entries.get(providerId)?.provider;
    }

    /** 新设置 UI 使用的只读视图；不含明文。 */
    view(): ProviderLibraryView {
        return {
            keys: this.library.keys.map((key) => ({ ...key })),
            profiles: [...this.entries.values()].map((entry) => toProfileStatus(entry)),
            ...(this.persistenceError === undefined
                ? {}
                : { persistenceError: this.persistenceError }),
        };
    }

    /** 旧设置页的 ProviderStatus 映射；M9.3 移除旧对话框后删除。 */
    list(): ProviderStatus[] {
        return [...this.entries.values()].map((entry) => {
            const profile = entry.profile;
            return {
                id: profile.id,
                kind: PROVIDER_ADAPTER_PROTOCOL[profile.adapter],
                label: profile.label,
                enabled: profile.enabled,
                hasKey: entry.hasKey,
                available: entry.available,
                models: profile.models.map((model) => model.id),
                ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
                ...(profile.defaultModelId === undefined
                    ? {}
                    : { model: profile.defaultModelId }),
                ...(entry.error === undefined ? {} : { error: entry.error }),
            };
        });
    }

    /** 旧设置页「测试连接」：刷新模型目录并更新 key 健康。 */
    async test(providerId: string): Promise<ProviderTestResult> {
        const result = await this.refreshModels(providerId);
        return {
            ok: result.error === undefined,
            models: result.models.map((model) => model.id),
            ...(result.error === undefined ? {} : { error: result.error }),
        };
    }

    /** 刷新单个 profile 的模型目录；失败时保留旧目录并把错误写回 key 健康。 */
    async refreshModels(
        providerId: string,
    ): Promise<ProviderCatalogRefreshResult> {
        const entry = this.entries.get(providerId);
        if (entry === undefined) {
            throw new FhError("E_NOT_FOUND", `provider profile not found: ${providerId}`);
        }
        if (entry.provider === undefined) {
            const checkedAt = nowIso();
            return {
                profile: entry.profile,
                models: entry.profile.models,
                checkedAt,
                error: entry.error ?? "Provider 不可用",
            };
        }

        const checkedAt = nowIso();
        try {
            const { models, source } = await readModelCatalog(
                entry.provider,
                entry.profile.adapter,
            );
            let library = this.withProfilePatch(providerId, {
                models,
                modelsFetchedAt: checkedAt,
                modelsSource: source,
            });
            // 只有真正请求了模型目录（chat / ollama）才算验证了 key；生成适配器只读内置 modelInfo。
            if (entry.key !== undefined && entry.provider.modelProvider !== null) {
                library = updateKeyHealth(library, entry.key.id, {
                    status: "active",
                    checkedAt,
                });
            }
            await this.commit(library);

            return {
                profile: this.entries.get(providerId)?.profile ?? entry.profile,
                models,
                checkedAt,
            };
        } catch (error) {
            const failure = classifyProviderError(error);
            const library =
                entry.key === undefined
                    ? this.library
                    : updateKeyHealth(this.library, entry.key.id, {
                          status: failure.status,
                          checkedAt,
                          error: failure.error,
                      });
            if (library !== this.library) {
                await this.commit(library);
            }
            return {
                profile: this.entries.get(providerId)?.profile ?? entry.profile,
                models: entry.profile.models,
                checkedAt,
                error: failure.error.message,
            };
        }
    }

    // ---- 密钥 ----

    async addKey(request: ApiKeyAddRequest): Promise<ApiKeyAddResult> {
        const protocol = readProtocol(request.protocol);
        const apiKey = requireSecret(request.apiKey);
        const label = normalizeLabel(request.label, protocol);
        const baseUrl = normalizeBaseUrl(request.baseUrl);
        const validation = await this.validateCredential(protocol, apiKey, baseUrl);
        const keyId = uniqueKeyId(new Set(this.library.keys.map((key) => key.id)));
        const secretWrite = await this.secrets.set(keyId, apiKey);

        const at = nowIso();
        const key: ApiKeyRecord = {
            id: keyId,
            protocol,
            label,
            status: validation.status,
            fingerprint: createKeyFingerprint(apiKey),
            lastCheckedAt: validation.checkedAt,
            createdAt: at,
            updatedAt: at,
            ...(baseUrl === undefined ? {} : { baseUrl }),
            ...(validation.error === undefined ? {} : { lastError: validation.error }),
        };
        const commit = await this.commit(
            {
                ...this.library,
                keys: [...this.library.keys, key],
            },
            true,
        );
        const secretPersisted = secretWrite?.persisted ?? true;
        const secretError = secretWrite?.error;
        if (!secretPersisted) {
            this.persistenceError = [this.persistenceError, secretError]
                .filter(Boolean)
                .join("；");
        }
        const persistenceError =
            secretPersisted && commit.persisted
                ? undefined
                : [secretError, commit.error].filter(Boolean).join("；");
        return {
            key,
            validation,
            persisted: secretPersisted && commit.persisted,
            ...(persistenceError === undefined
                ? {}
                : { persistenceError }),
        };
    }

    async revalidateKey(
        keyId: string,
    ): Promise<ApiKeyAddResult> {
        const key = this.requireKey(keyId);
        const secret = await this.secrets.get(key.id);
        if (secret === undefined) {
            throw new FhError("E_NOT_FOUND", `secret not found for key: ${key.id}`);
        }
        const validation = await this.validateCredential(
            key.protocol,
            secret,
            key.baseUrl,
        );
        const updated = applyValidation(key, validation);
        const library = {
            ...this.library,
            keys: this.library.keys.map((item) => (item.id === key.id ? updated : item)),
        };
        const commit = await this.commit(library);
        return {
            key: updated,
            validation,
            persisted: commit.persisted,
            ...(commit.error === undefined
                ? {}
                : { persistenceError: commit.error }),
        };
    }

    async replaceKey(
        keyId: string,
        apiKey: string,
    ): Promise<ApiKeyAddResult> {
        const key = this.requireKey(keyId);
        const secret = requireSecret(apiKey);
        const validation = await this.validateCredential(
            key.protocol,
            secret,
            key.baseUrl,
        );
        const secretWrite = await this.secrets.set(key.id, secret);
        const updated = applyValidation(
            { ...key, fingerprint: createKeyFingerprint(secret) },
            validation,
        );
        const library = {
            ...this.library,
            keys: this.library.keys.map((item) => (item.id === key.id ? updated : item)),
        };
        const commit = await this.commit(library);
        const secretPersisted = secretWrite?.persisted ?? true;
        const secretError = secretWrite?.error;
        if (!secretPersisted) {
            this.persistenceError = [this.persistenceError, secretError]
                .filter(Boolean)
                .join("；");
        }
        const persistenceError =
            secretPersisted && commit.persisted
                ? undefined
                : [secretError, commit.error].filter(Boolean).join("；");
        return {
            key: updated,
            validation,
            persisted: secretPersisted && commit.persisted,
            ...(persistenceError === undefined
                ? {}
                : { persistenceError }),
        };
    }

    async deleteKey(keyId: string): Promise<{ deleted: boolean }> {
        const key = this.library.keys.find((item) => item.id === keyId);
        if (key === undefined) return { deleted: false };

        const referenced = this.library.profiles.filter(
            (profile) => profile.apiKeyId === keyId,
        );
        if (referenced.length > 0) {
            throw new FhError(
                "E_CONFLICT",
                `key ${keyId} is used by ${referenced.map((profile) => profile.id).join(", ")}`,
            );
        }

        await this.secrets.delete(keyId);
        await this.commit({
            ...this.library,
            keys: this.library.keys.filter((item) => item.id !== keyId),
        });
        return { deleted: true };
    }

    // ---- Provider Profile ----

    async createProfile(
        request: ProviderProfileCreateRequest,
    ): Promise<ProviderProfile> {
        const adapter = readAdapter(request.adapter);
        const protocol = PROVIDER_ADAPTER_PROTOCOL[adapter];
        const label = normalizeLabel(request.label, adapter);
        const apiKeyId = normalizeOptionalId(request.apiKeyId);
        if (apiKeyId !== undefined) {
            this.assertKeyMatches(apiKeyId, protocol);
        }

        const at = nowIso();
        const profile: ProviderProfile = {
            id: uniqueProfileId(
                new Set(this.library.profiles.map((item) => item.id)),
            ),
            label,
            adapter,
            enabled: request.enabled ?? true,
            models: [],
            createdAt: at,
            updatedAt: at,
            ...(apiKeyId === undefined ? {} : { apiKeyId }),
            ...(normalizeBaseUrl(request.baseUrl) === undefined
                ? {}
                : { baseUrl: normalizeBaseUrl(request.baseUrl) }),
            ...(normalizeOptional(request.defaultModelId) === undefined
                ? {}
                : { defaultModelId: normalizeOptional(request.defaultModelId) }),
        };
        await this.commit({
            ...this.library,
            profiles: [...this.library.profiles, profile],
        });
        return profile;
    }

    async updateProfile(
        request: ProviderProfileUpdateRequest,
    ): Promise<ProviderProfile> {
        const current = this.requireProfile(request.id);
        const patch = request.patch;
        const adapter =
            patch.adapter === undefined ? current.adapter : readAdapter(patch.adapter);
        const protocol = PROVIDER_ADAPTER_PROTOCOL[adapter];

        let apiKeyId = current.apiKeyId;
        if (patch.apiKeyId === null) apiKeyId = undefined;
        else if (patch.apiKeyId !== undefined) {
            apiKeyId = normalizeOptionalId(patch.apiKeyId);
        }
        if (apiKeyId !== undefined) {
            apiKeyId = this.assertKeyMatches(apiKeyId, protocol);
        }

        const label =
            patch.label === undefined
                ? current.label
                : normalizeLabel(patch.label, adapter);

        const next: ProviderProfile = {
            ...current,
            label,
            adapter,
            ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
            updatedAt: nowIso(),
        };
        if (apiKeyId === undefined) delete next.apiKeyId;
        else next.apiKeyId = apiKeyId;

        if (patch.baseUrl !== undefined) {
            const baseUrl =
                patch.baseUrl === null ? undefined : normalizeBaseUrl(patch.baseUrl);
            if (baseUrl === undefined) delete next.baseUrl;
            else next.baseUrl = baseUrl;
        }
        if (patch.defaultModelId !== undefined) {
            const defaultModelId =
                patch.defaultModelId === null
                    ? undefined
                    : normalizeOptional(patch.defaultModelId);
            if (defaultModelId === undefined) delete next.defaultModelId;
            else next.defaultModelId = defaultModelId;
        }

        const library = {
            ...this.library,
            profiles: this.library.profiles.map((profile) =>
                profile.id === current.id ? next : profile,
            ),
        };
        await this.commit(library);
        return next;
    }

    async deleteProfile(
        request: ProviderProfileDeleteRequest,
    ): Promise<ProviderProfileDeleteResult> {
        const exists = this.library.profiles.some(
            (profile) => profile.id === request.id,
        );
        if (!exists) return { deleted: false };

        await this.commit({
            ...this.library,
            profiles: this.library.profiles.filter(
                (profile) => profile.id !== request.id,
            ),
        });
        return { deleted: true };
    }

    /** 运行期 auth / quota 失败时更新 key 健康；只处理 401/403/402/429。 */
    async recordRuntimeProviderError(
        providerId: string,
        httpStatus: number | undefined,
    ): Promise<boolean> {
        const entry = this.entries.get(providerId);
        if (entry?.key === undefined) return false;

        const classification = classifyHttpStatus(httpStatus, "provider request failed");
        if (classification === undefined) return false;

        const library = updateKeyHealth(this.library, entry.key.id, {
            status: classification.status,
            checkedAt: nowIso(),
            error: classification.error,
        });
        await this.commit(library);
        return true;
    }

    // ---- 旧设置页兼容（M9.3 切换后删除） ----

    /** 把旧 AppConfig.providers 的字段变化同步到库；不删除新库中的额外 profile。 */
    async applyLegacyProviders(
        configs: readonly ProviderConfig[],
    ): Promise<void> {
        const profiles = [...this.library.profiles];
        const at = nowIso();
        let changed = false;

        for (const config of configs) {
            const adapter = LEGACY_ADAPTER[config.kind];
            if (adapter === undefined) continue;

            const index = profiles.findIndex((profile) => profile.id === config.id);
            if (index === -1) {
                profiles.push({
                    id: config.id,
                    label: config.label || config.kind,
                    adapter,
                    enabled: config.enabled,
                    models: [],
                    createdAt: at,
                    updatedAt: at,
                    ...(normalizeBaseUrl(config.baseUrl) === undefined
                        ? {}
                        : { baseUrl: normalizeBaseUrl(config.baseUrl) }),
                    ...(normalizeOptional(config.model) === undefined
                        ? {}
                        : { defaultModelId: normalizeOptional(config.model) }),
                });
                changed = true;
                continue;
            }

            const current = profiles[index]!;
            const next: ProviderProfile = {
                ...current,
                label: config.label || current.label,
                enabled: config.enabled,
                updatedAt: at,
                ...(normalizeBaseUrl(config.baseUrl) === undefined
                    ? { baseUrl: undefined }
                    : { baseUrl: normalizeBaseUrl(config.baseUrl) }),
                ...(normalizeOptional(config.model) === undefined
                    ? { defaultModelId: undefined }
                    : { defaultModelId: normalizeOptional(config.model) }),
            };
            if (next.baseUrl === undefined) delete next.baseUrl;
            if (next.defaultModelId === undefined) delete next.defaultModelId;

            if (JSON.stringify(next) !== JSON.stringify(current)) {
                profiles[index] = next;
                changed = true;
            }
        }

        if (changed) {
            await this.commit({ ...this.library, profiles });
        }
    }

    async legacyHasKey(providerId: string): Promise<boolean> {
        const profile = this.library.profiles.find((item) => item.id === providerId);
        if (profile?.apiKeyId === undefined) return false;
        return this.secrets.has(profile.apiKeyId).catch(() => false);
    }

    /**
     * M9.3 收口：删除 v1 时代以 providerId 为键的旧 secrets 镜像。
     *
     * 只有新 key 的 secret 确实存在时才删除旧条目，避免迁移失败时丢密钥。
     */
    async removeLegacySecrets(
        legacyProviders: readonly ProviderConfig[],
    ): Promise<void> {
        for (const legacy of legacyProviders) {
            const profile = this.library.profiles.find(
                (item) => item.id === legacy.id,
            );
            if (profile?.apiKeyId === undefined) continue;
            if (profile.apiKeyId === legacy.id) continue;

            const newSecretExists = await this.secrets
                .has(profile.apiKeyId)
                .catch(() => false);
            if (!newSecretExists) continue;

            const legacySecretExists = await this.secrets
                .has(legacy.id)
                .catch(() => false);
            if (!legacySecretExists) continue;

            await this.secrets.delete(legacy.id);
        }
    }

    /** 旧设置页保存密钥：写入库与 secrets，不发起网络验证（由「测试连接」负责）。 */
    async setLegacySecret(providerId: string, value: string): Promise<void> {
        const profile = this.requireProfile(providerId);
        const secret = requireSecret(value);
        const protocol = PROVIDER_ADAPTER_PROTOCOL[profile.adapter];
        const at = nowIso();

        let keyId = profile.apiKeyId;
        let key =
            keyId === undefined
                ? undefined
                : this.library.keys.find((item) => item.id === keyId);
        if (key !== undefined && key.protocol !== protocol) {
            throw new FhError(
                "E_CONFLICT",
                `key ${key.id} protocol ${key.protocol} does not match ${profile.adapter}`,
            );
        }

        if (key === undefined) {
            keyId = uniqueKeyId(new Set(this.library.keys.map((item) => item.id)));
            key = {
                id: keyId,
                protocol,
                label: profile.label,
                status: "unverified",
                createdAt: at,
                updatedAt: at,
            };
        }

        await this.secrets.set(key.id, secret);
        const updatedKey: ApiKeyRecord = {
            ...key,
            fingerprint: createKeyFingerprint(secret),
            status: "unverified",
            updatedAt: at,
            ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
        };
        delete updatedKey.lastCheckedAt;
        delete updatedKey.lastError;

        const keys = this.library.keys.some((item) => item.id === updatedKey.id)
            ? this.library.keys.map((item) =>
                  item.id === updatedKey.id ? updatedKey : item,
              )
            : [...this.library.keys, updatedKey];
        const profiles = this.library.profiles.map((item) =>
            item.id === profile.id
                ? { ...item, apiKeyId: updatedKey.id, updatedAt: at }
                : item,
        );
        await this.commit({ ...this.library, keys, profiles });
    }

    async deleteLegacySecret(providerId: string): Promise<void> {
        const profile = this.requireProfile(providerId);
        const keyId = profile.apiKeyId;
        if (keyId === undefined) return;

        await this.secrets.delete(keyId);
        const at = nowIso();
        const profiles = this.library.profiles.map((item) => {
            if (item.apiKeyId !== keyId) return item;
            const next = { ...item, updatedAt: at };
            delete next.apiKeyId;
            return next;
        });
        await this.commit({
            ...this.library,
            profiles,
            keys: this.library.keys.filter((key) => key.id !== keyId),
        });
    }

    // ---- 内部 ----

    private async commit(
        library: ProviderLibrary,
        allowUnpersisted = true,
    ): Promise<{ persisted: boolean; error?: string }> {
        let persisted = true;
        let error: string | undefined;
        try {
            this.library = await this.store.save(library);
            this.persistenceError = undefined;
        } catch (cause) {
            const recoverable =
                cause instanceof FhError &&
                (cause.code === "E_IO" || cause.code === "E_PERMISSION");
            if (!allowUnpersisted || !recoverable) throw cause;
            // 受限环境（只读 / 权限）下允许当前会话继续使用；UI 会提示未落盘。
            persisted = false;
            error = errorMessage(cause);
            this.persistenceError = error;
            this.library = library;
        }
        await this.rebuildEntries();
        return {
            persisted,
            ...(error === undefined ? {} : { error }),
        };
    }

    private async rebuildEntries(): Promise<void> {
        const entries = new Map<string, ProviderEntry>();

        for (const profile of this.library.profiles) {
            const key =
                profile.apiKeyId === undefined
                    ? undefined
                    : this.library.keys.find((item) => item.id === profile.apiKeyId);
            const requiresKey = PROVIDER_ADAPTER_REQUIRES_KEY[profile.adapter];
            const hasKey = requiresKey
                ? key !== undefined && (await this.secrets.has(key.id).catch(() => false))
                : true;

            let provider: AIProvider | undefined;
            let error: string | undefined;

            if (!profile.enabled) {
                error = "已禁用";
            } else if (requiresKey && (key === undefined || !hasKey)) {
                error = "缺少 API Key";
            } else {
                try {
                    const secret =
                        key === undefined
                            ? undefined
                            : await this.secrets.get(key.id);
                    provider = this.factories[profile.adapter](profile, secret);
                } catch (cause) {
                    error = errorMessage(cause);
                }
            }

            entries.set(profile.id, {
                profile,
                ...(key === undefined ? {} : { key }),
                ...(provider === undefined ? {} : { provider }),
                hasKey,
                available: provider !== undefined,
                ...(error === undefined ? {} : { error }),
            });
        }

        this.entries = entries;
    }

    private withProfilePatch(
        providerId: string,
        patch: Partial<ProviderProfile>,
    ): ProviderLibrary {
        return {
            ...this.library,
            profiles: this.library.profiles.map((profile) =>
                profile.id === providerId
                    ? { ...profile, ...patch, updatedAt: nowIso() }
                    : profile,
            ),
        };
    }

    private requireProfile(providerId: string): ProviderProfile {
        const profile = this.library.profiles.find((item) => item.id === providerId);
        if (profile === undefined) {
            throw new FhError("E_NOT_FOUND", `provider profile not found: ${providerId}`);
        }
        return profile;
    }

    private requireKey(keyId: string): ApiKeyRecord {
        const key = this.library.keys.find((item) => item.id === keyId);
        if (key === undefined) {
            throw new FhError("E_NOT_FOUND", `api key not found: ${keyId}`);
        }
        return key;
    }

    private assertKeyMatches(keyId: string, protocol: ApiKeyProtocol): string {
        const key = this.requireKey(keyId);
        if (key.protocol !== protocol) {
            throw new FhError(
                "E_INVALID_ARGUMENT",
                `key ${keyId} protocol ${key.protocol} does not match ${protocol}`,
            );
        }
        return keyId;
    }

    /**
     * 协议级验证：用同协议 chat 适配器拉模型目录。
     * 401/403 → invalid；402/429 → quota；网络 → network；无目录 → unverified。
     */
    private async validateCredential(
        protocol: ApiKeyProtocol,
        apiKey: string | undefined,
        baseUrl: string | undefined,
    ): Promise<ApiKeyValidation> {
        const checkedAt = nowIso();
        const adapter = PROBE_ADAPTER[protocol];
        const profile: ProviderProfile = {
            id: `probe_${protocol}`,
            label: protocol,
            adapter,
            enabled: true,
            models: [],
            createdAt: checkedAt,
            updatedAt: checkedAt,
            ...(baseUrl === undefined ? {} : { baseUrl }),
        };

        let provider: AIProvider;
        try {
            provider = this.factories[adapter](profile, apiKey);
        } catch (error) {
            const failure = classifyProviderError(error);
            return {
                status: failure.status,
                checkedAt,
                error: failure.error,
            };
        }

        const modelProvider = provider.modelProvider;
        if (modelProvider === null) {
            return { status: "unverified", checkedAt };
        }

        try {
            const models =
                modelProvider.availableModels ?? (await modelProvider.initModels());
            return {
                status: "active",
                checkedAt,
                models: models.map(toCatalogEntry),
            };
        } catch (error) {
            const failure = classifyProviderError(error);
            return {
                status: failure.status,
                checkedAt,
                error: failure.error,
            };
        }
    }
}

/* ---------------------------------------------------------------------------
 * 模型目录 / 健康分类 / 查询辅助
 * ------------------------------------------------------------------------- */

async function readModelCatalog(
    provider: AIProvider,
    adapter: ProviderAdapterKind,
): Promise<{ models: ModelCatalogEntry[]; source: ModelCatalogSource }> {
    const modelProvider = provider.modelProvider;
    if (modelProvider !== null) {
        const models =
            modelProvider.availableModels ?? (await modelProvider.initModels());
        return {
            models: models.map(toCatalogEntry),
            source: "api",
        };
    }

    const info = (provider as AIProvider & { modelInfo?: ModelInfo }).modelInfo;
    if (info !== undefined) {
        return { models: [toCatalogEntry(info)], source: "builtin" };
    }

    return {
        models: [],
        source: PROVIDER_ADAPTER_CAPABILITY[adapter] === "generate" ? "builtin" : "manual",
    };
}

function toCatalogEntry(info: ModelInfo): ModelCatalogEntry {
    const capabilities = info.capabilities;
    const inputs = new Set<string>();
    const outputs = new Set<string>();
    for (const value of capabilities?.chat?.input ?? []) inputs.add(value);
    for (const value of capabilities?.generate?.input ?? []) inputs.add(value);
    for (const value of capabilities?.chat?.output ?? []) outputs.add(value);
    for (const value of capabilities?.generate?.output ?? []) outputs.add(value);

    const summary: ModelCapabilitySummary = {
        ...(capabilities?.chat === undefined ? {} : { chat: true }),
        ...(capabilities?.generate === undefined ? {} : { generate: true }),
        ...(capabilities?.decide === undefined ? {} : { decide: true }),
        ...(capabilities?.embed === undefined ? {} : { embed: true }),
        ...(capabilities?.chat?.tools === true ? { tools: true } : {}),
        ...(capabilities?.chat?.thinking === true ||
        (info.thinkingLevels?.length ?? 0) > 0
            ? { thinking: true }
            : {}),
        ...(capabilities?.chat?.input.includes("image") === true ||
        info.isVisionModel
            ? { vision: true }
            : {}),
        ...(inputs.size === 0 ? {} : { inputs: [...inputs] }),
        ...(outputs.size === 0 ? {} : { outputs: [...outputs] }),
    };

    return {
        id: info.id,
        name: info.name || info.id,
        ...(info.size === undefined ? {} : { size: info.size }),
        ...(Object.keys(summary).length === 0 ? {} : { capabilities: summary }),
        ...(info.thinkingLevels === undefined
            ? {}
            : { thinkingLevels: info.thinkingLevels }),
    };
}

function classifyProviderError(error: unknown): {
    status: ApiKeyStatus;
    error: ApiKeyError;
} {
    const failure = readFailure(error);
    const checkedAt = nowIso();

    if (failure.httpStatus === 401 || failure.httpStatus === 403) {
        return {
            status: "invalid",
            error: {
                kind: "auth",
                message: failure.message,
                httpStatus: failure.httpStatus,
                at: checkedAt,
            },
        };
    }
    if (failure.httpStatus === 402 || failure.httpStatus === 429) {
        return {
            status: "quota",
            error: {
                kind: "quota",
                message: failure.message,
                httpStatus: failure.httpStatus,
                at: checkedAt,
            },
        };
    }
    if (
        failure.type === SessionErrorType.NetworkError ||
        failure.httpStatus === 404 ||
        failure.httpStatus === 408 ||
        (failure.httpStatus !== undefined && failure.httpStatus >= 500) ||
        /fetch failed|ECONN|ETIMEDOUT|network/i.test(failure.message)
    ) {
        return {
            status: "network",
            error: {
                kind: "network",
                message: failure.message,
                ...(failure.httpStatus === undefined
                    ? {}
                    : { httpStatus: failure.httpStatus }),
                at: checkedAt,
            },
        };
    }

    return {
        status: "unverified",
        error: {
            kind: "unknown",
            message: failure.message,
            ...(failure.httpStatus === undefined
                ? {}
                : { httpStatus: failure.httpStatus }),
            at: checkedAt,
        },
    };
}

function classifyHttpStatus(
    httpStatus: number | undefined,
    message: string,
): { status: ApiKeyStatus; error: ApiKeyError } | undefined {
    if (httpStatus === 401 || httpStatus === 403) {
        return {
            status: "invalid",
            error: { kind: "auth", message, httpStatus, at: nowIso() },
        };
    }
    if (httpStatus === 402 || httpStatus === 429) {
        return {
            status: "quota",
            error: { kind: "quota", message, httpStatus, at: nowIso() },
        };
    }
    return undefined;
}

function readFailure(error: unknown): {
    httpStatus?: number;
    type?: string;
    message: string;
} {
    let current: unknown = error;
    let httpStatus: number | undefined;
    let type: string | undefined;
    let message = errorMessage(error);

    for (let depth = 0; depth < 6; depth += 1) {
        if (typeof current !== "object" || current === null) break;
        const record = current as {
            httpStatus?: unknown;
            type?: unknown;
            message?: unknown;
            origin?: unknown;
        };
        if (httpStatus === undefined && typeof record.httpStatus === "number") {
            httpStatus = record.httpStatus;
        }
        if (type === undefined && typeof record.type === "string") {
            type = record.type;
        }
        if (typeof record.message === "string" && record.message.length > 0) {
            message = record.message;
        }
        current = record.origin;
    }

    if (httpStatus === undefined && type === undefined) {
        const match = /HTTP\s+(401|402|403|429|5\d\d)\b/.exec(message);
        if (match !== null) httpStatus = Number(match[1]);
    }

    return {
        ...(httpStatus === undefined ? {} : { httpStatus }),
        ...(type === undefined ? {} : { type }),
        message: message.slice(0, 500),
    };
}

function applyValidation(
    key: ApiKeyRecord,
    validation: ApiKeyValidation,
): ApiKeyRecord {
    const next: ApiKeyRecord = {
        ...key,
        status: validation.status,
        lastCheckedAt: validation.checkedAt,
        updatedAt: nowIso(),
    };
    if (validation.error === undefined) delete next.lastError;
    else next.lastError = validation.error;
    return next;
}

function updateKeyHealth(
    library: ProviderLibrary,
    keyId: string,
    health: {
        status: ApiKeyStatus;
        checkedAt: string;
        error?: ApiKeyError;
    },
): ProviderLibrary {
    return {
        ...library,
        keys: library.keys.map((key) => {
            if (key.id !== keyId) return key;
            const next: ApiKeyRecord = {
                ...key,
                status: health.status,
                lastCheckedAt: health.checkedAt,
                updatedAt: nowIso(),
            };
            if (health.error === undefined) delete next.lastError;
            else next.lastError = health.error;
            return next;
        }),
    };
}

function toProfileStatus(entry: ProviderEntry): ProviderProfileStatus {
    return {
        profile: entry.profile,
        available: entry.available,
        hasKey: entry.hasKey,
        ...(entry.key === undefined
            ? {}
            : {
                  keyStatus: entry.key.status,
                  ...(entry.key.lastCheckedAt === undefined
                      ? {}
                      : { keyCheckedAt: entry.key.lastCheckedAt }),
                  ...(entry.key.lastError === undefined
                      ? {}
                      : { keyError: entry.key.lastError }),
              }),
        ...(entry.error === undefined ? {} : { error: entry.error }),
    };
}

function readProtocol(value: ApiKeyProtocol): ApiKeyProtocol {
    if (
        value !== "deepseek" &&
        value !== "qwen" &&
        value !== "minimax" &&
        value !== "ollama"
    ) {
        throw new FhError("E_INVALID_ARGUMENT", `unknown protocol: ${String(value)}`);
    }
    return value;
}

function readAdapter(value: ProviderAdapterKind): ProviderAdapterKind {
    if (!(value in PROVIDER_ADAPTER_PROTOCOL)) {
        throw new FhError("E_INVALID_ARGUMENT", `unknown provider adapter: ${String(value)}`);
    }
    return value;
}

function requireSecret(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        throw new FhError("E_INVALID_ARGUMENT", "api key must be a non-empty string");
    }
    return trimmed;
}

function normalizeLabel(value: string, fallback: string): string {
    const trimmed = value.trim();
    return trimmed.length === 0 ? fallback : trimmed;
}

function normalizeOptional(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
    return normalizeOptional(value);
}

function normalizeOptionalId(value: string | undefined): string | undefined {
    return normalizeOptional(value);
}

function uniqueKeyId(existing: ReadonlySet<string>): string {
    for (;;) {
        const id = `key_${randomBytes(6).toString("hex")}`;
        if (!existing.has(id)) return id;
    }
}

function uniqueProfileId(existing: ReadonlySet<string>): string {
    for (;;) {
        const id = `prv_${randomBytes(5).toString("hex")}`;
        if (!existing.has(id)) return id;
    }
}

function withBaseUrl(
    baseUrl: string | undefined,
): { baseUrl?: string } {
    return baseUrl === undefined ? {} : { baseUrl };
}

function withModel(
    model: string | undefined,
): { model?: string } {
    return model === undefined ? {} : { model };
}

function nowIso(): string {
    return new Date().toISOString();
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
