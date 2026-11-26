import { createHash } from "node:crypto";
import {
    PROVIDER_ADAPTER_REQUIRES_KEY,
    type ApiKeyRecord,
    type ProviderAdapterKind,
    type ProviderConfig,
    type ProviderKind,
    type ProviderLibrary,
    type ProviderProfile,
} from "@flowharness/contracts";
import { emptyProviderLibrary, type ProviderLibraryStore } from "./provider-library-store";
import type { SecretsStore } from "./secrets";

/** 旧 `ProviderKind` → 等价适配器；迁移时保留 providerId，保证旧 graph 可解析。 */
const LEGACY_ADAPTER: Record<ProviderKind, ProviderAdapterKind> = {
    deepseek: "deepseek.chat",
    ollama: "ollama.chat",
    minimax: "minimax.chat",
    qwen: "qwen.chat",
};

export type LegacyProviderMigrationInput = {
    library: ProviderLibrary;
    legacyProviders: readonly ProviderConfig[];
    secrets: Pick<SecretsStore, "get" | "set">;
    now?: () => string;
};

export type LegacyProviderMigrationResult = {
    library: ProviderLibrary;
    changed: boolean;
    warnings: string[];
};

/**
 * 把旧的 `AppConfig.providers` + `SecretsStore(providerId)` 迁移成
 * Provider Profile + ApiKeyRecord。
 *
 * - profile id 保留旧 providerId，旧 graph 的 `providerId` 继续有效；
 * - 非 ollama 的密钥复制到 `key_<providerId>`，旧条目暂时保留（M9.1 影子迁移）；
 * - 幂等：已存在的 profile / key 不覆盖；
 * - 单条 key 复制失败只记录 warning，不阻塞其它 provider。
 */
export async function migrateLegacyProviders(
    input: LegacyProviderMigrationInput,
): Promise<LegacyProviderMigrationResult> {
    const now = input.now ?? (() => new Date().toISOString());
    const at = now();
    const keys = [...input.library.keys];
    const profiles = [...input.library.profiles];
    const keyById = new Map(keys.map((key) => [key.id, key]));
    const profileIds = new Set(profiles.map((profile) => profile.id));
    const warnings: string[] = [];
    let changed = false;

    for (const provider of input.legacyProviders) {
        const adapter = LEGACY_ADAPTER[provider.kind];
        if (adapter === undefined) continue;

        let apiKeyId: string | undefined;
        if (PROVIDER_ADAPTER_REQUIRES_KEY[adapter]) {
            const keyId = legacyKeyId(provider.id);
            const existingKey = keyById.get(keyId);
            if (existingKey !== undefined) {
                apiKeyId = existingKey.id;
            } else {
                let secret: string | undefined;
                try {
                    secret = await input.secrets.get(provider.id);
                } catch (error) {
                    warnings.push(
                        `cannot read legacy secret for ${provider.id}: ${errorMessage(error)}`,
                    );
                }

                if (secret !== undefined) {
                    try {
                        await input.secrets.set(keyId, secret);
                        const key: ApiKeyRecord = {
                            id: keyId,
                            protocol: provider.kind,
                            label: provider.label || provider.kind,
                            status: "unverified",
                            fingerprint: createKeyFingerprint(secret),
                            createdAt: at,
                            updatedAt: at,
                        };
                        keys.push(key);
                        keyById.set(key.id, key);
                        apiKeyId = key.id;
                        changed = true;
                    } catch (error) {
                        warnings.push(
                            `cannot copy legacy secret for ${provider.id}: ${errorMessage(error)}`,
                        );
                    }
                }
            }
        }

        if (profileIds.has(provider.id)) continue;

        const profile: ProviderProfile = {
            id: provider.id,
            label: provider.label || provider.kind,
            adapter,
            enabled: provider.enabled,
            models: [],
            createdAt: at,
            updatedAt: at,
            ...(apiKeyId === undefined ? {} : { apiKeyId }),
            ...(provider.baseUrl === undefined || provider.baseUrl.trim() === ""
                ? {}
                : { baseUrl: provider.baseUrl.trim() }),
            ...(provider.model === undefined || provider.model.trim() === ""
                ? {}
                : { defaultModelId: provider.model.trim() }),
        };
        profiles.push(profile);
        profileIds.add(profile.id);
        changed = true;
    }

    if (!changed) {
        return { library: input.library, changed: false, warnings };
    }

    return {
        library: {
            ...input.library,
            keys,
            profiles,
        },
        changed: true,
        warnings,
    };
}

/** 不可逆指纹：只用于 UI 识别，不能还原明文。 */
export function createKeyFingerprint(secret: string): string {
    return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

/** 稳定 key id；超长 providerId 退化为哈希，仍满足 id 约束。 */
export function legacyKeyId(providerId: string): string {
    const direct = `key_${providerId}`;
    if (direct.length <= 64) return direct;
    return `key_${createHash("sha256").update(providerId).digest("hex").slice(0, 16)}`;
}

export type SeedProviderLibraryResult = {
    created: boolean;
    changed: boolean;
    warnings: string[];
};

/**
 * 首次启动时从旧配置播种 Provider 库。
 *
 * 只在库文件不存在时执行；已存在时完全不动，避免覆盖新数据。
 * 这是 M9.1 的“影子迁移”：旧设置页仍走 AppConfig，库先就位供 M9.2 / M9.3 接管。
 */
export async function seedProviderLibraryFromLegacy(options: {
    store: ProviderLibraryStore;
    secrets: Pick<SecretsStore, "get" | "set">;
    legacyProviders: readonly ProviderConfig[];
    now?: () => string;
}): Promise<SeedProviderLibraryResult> {
    if (await options.store.exists()) {
        return { created: false, changed: false, warnings: [] };
    }

    const result = await migrateLegacyProviders({
        library: emptyProviderLibrary(),
        legacyProviders: options.legacyProviders,
        secrets: options.secrets,
        ...(options.now === undefined ? {} : { now: options.now }),
    });
    await options.store.save(result.library);

    return {
        created: true,
        changed: result.changed,
        warnings: result.warnings,
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
