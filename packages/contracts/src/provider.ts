/** 支持的模型服务类型。 */
export type ProviderKind = "deepseek" | "ollama" | "minimax" | "qwen";

/**
 * Provider 的非敏感配置；密钥单独存放在 main 的 SecretsStore，renderer 不可见。
 *
 * `id` 是 Graph 里 `core.model` 使用的 providerId；同一个 kind 可以配置多个 id。
 */
export type ProviderConfig = {
    id: string;
    kind: ProviderKind;
    label: string;
    enabled: boolean;
    /** 自定义端点；为空时使用平台默认。 */
    baseUrl?: string;
    /** 可选默认模型；模型节点仍以 graph 里的 modelId 为准。 */
    model?: string;
};

/** 给设置页展示的 Provider 状态；不包含密钥。 */
export type ProviderStatus = ProviderConfig & {
    hasKey: boolean;
    available: boolean;
    models: string[];
    error?: string;
};

export type ProviderTestResult = {
    ok: boolean;
    models: string[];
    error?: string;
};
