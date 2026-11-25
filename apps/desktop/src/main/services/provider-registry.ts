import {
    DeepSeekProvider,
    MiniMaxChatProvider,
    OllamaProvider,
    QwenChatProvider,
    type AIProvider,
} from "wireclaw";
import type {
    ProviderConfig,
    ProviderKind,
    ProviderStatus,
    ProviderTestResult,
} from "@flowharness/contracts";
import type { SecretsStore } from "./secrets";

export type ProviderFactory = (
    config: ProviderConfig,
    secret: string | undefined,
) => AIProvider;

const DEFAULT_FACTORIES: Record<ProviderKind, ProviderFactory> = {
    deepseek: (config, secret) => {
        if (secret === undefined) throw new Error("DeepSeek requires an API key");
        return new DeepSeekProvider({
            apiKey: secret,
            ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
        });
    },
    ollama: (config) =>
        new OllamaProvider(config.baseUrl ?? "http://127.0.0.1:11434"),
    minimax: (config, secret) => {
        if (secret === undefined) throw new Error("MiniMax requires an API key");
        return new MiniMaxChatProvider({
            apiKey: secret,
            ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
            ...(config.model === undefined ? {} : { model: config.model }),
        });
    },
    qwen: (config, secret) => {
        if (secret === undefined) throw new Error("Qwen requires an API key");
        return new QwenChatProvider({
            apiKey: secret,
            ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
            ...(config.model === undefined ? {} : { model: config.model }),
        });
    },
};

type ProviderEntry = {
    config: ProviderConfig;
    provider?: AIProvider;
    hasKey: boolean;
    models: string[];
    error?: string;
};

function requiresKey(kind: ProviderKind): boolean {
    return kind !== "ollama";
}

/**
 * Provider 实例仓库：把非敏感配置 + SecretsStore 组装成 GraphHost 可解析的 AIProvider。
 *
 * - 只存在 main；renderer 只能拿到状态，拿不到密钥；
 * - 配置/密钥变化后调用 reload，重建实例；
 * - `test()` 才发起网络请求，启动时不做联网校验。
 */
export class ProviderRegistry {
    private entries = new Map<string, ProviderEntry>();

    constructor(
        private readonly secrets: SecretsStore,
        private readonly factories: Record<ProviderKind, ProviderFactory> =
            DEFAULT_FACTORIES,
    ) {}

    async reload(configs: readonly ProviderConfig[]): Promise<void> {
        const next = new Map<string, ProviderEntry>();

        for (const config of configs) {
            const hasKey = requiresKey(config.kind)
                ? await this.secrets.has(config.id).catch(() => false)
                : true;
            const entry: ProviderEntry = {
                config,
                hasKey,
                models: [],
            };

            if (!config.enabled) {
                next.set(config.id, entry);
                continue;
            }

            if (requiresKey(config.kind) && !hasKey) {
                entry.error = "缺少 API Key";
                next.set(config.id, entry);
                continue;
            }

            try {
                const secret = requiresKey(config.kind)
                    ? await this.secrets.get(config.id)
                    : undefined;
                entry.provider = this.factories[config.kind](config, secret);
            } catch (error) {
                entry.error = errorMessage(error);
            }

            next.set(config.id, entry);
        }

        this.entries = next;
    }

    /** GraphHost.resolveProvider 使用；未启用 / 缺少密钥 / 构造失败都返回 undefined。 */
    get(providerId: string): AIProvider | undefined {
        return this.entries.get(providerId)?.provider;
    }

    list(): ProviderStatus[] {
        return [...this.entries.values()].map((entry) => ({
            ...entry.config,
            hasKey: entry.hasKey,
            available: entry.provider !== undefined,
            models: [...entry.models],
            ...(entry.error === undefined ? {} : { error: entry.error }),
        }));
    }

    async test(providerId: string): Promise<ProviderTestResult> {
        const entry = this.entries.get(providerId);
        if (entry === undefined) {
            return { ok: false, models: [], error: "Provider 不存在" };
        }
        if (entry.provider === undefined) {
            return {
                ok: false,
                models: [],
                error: entry.error ?? "Provider 不可用",
            };
        }

        const modelProvider = entry.provider.modelProvider;
        if (modelProvider === null) {
            return { ok: false, models: [], error: "Provider 不提供模型目录" };
        }

        try {
            const models = modelProvider.availableModels ?? await modelProvider.initModels();
            entry.models = models.map((model) => model.id);
            entry.error = undefined;
            return { ok: true, models: [...entry.models] };
        } catch (error) {
            entry.error = errorMessage(error);
            return { ok: false, models: [], error: entry.error };
        }
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
