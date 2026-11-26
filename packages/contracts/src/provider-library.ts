/**
 * Provider 与 API Key 库的持久化契约（M9）。
 *
 * 分层：
 * - **API Key**：一个协议下的凭据；密文只存在 main 的 `secrets.bin`，这里只保存元数据与健康状态；
 * - **Provider Profile**：图里 `providerId` 指向的实例，绑定协议 + 适配器 + 密钥 + 端点 + 模型目录；
 * - **Model 目录**：从 Provider 拉取并持久化，重启后仍可用于下拉选择。
 *
 * 这些数据属于应用级配置，不进入 workspace / `.fhws`。
 */

export const PROVIDER_LIBRARY_SCHEMA_VERSION = 1 as const;

/** API Key 的协议；决定可用的适配器与验证端点。 */
export const API_KEY_PROTOCOLS = [
    "deepseek",
    "qwen",
    "minimax",
    "ollama",
] as const;
export type ApiKeyProtocol = (typeof API_KEY_PROTOCOLS)[number];

/** Provider 适配器：协议 + 能力维度（wireclaw 的具体 Provider 类）。 */
export const PROVIDER_ADAPTER_KINDS = [
    "deepseek.chat",
    "qwen.chat",
    "qwen.image",
    "minimax.chat",
    "minimax.image",
    "minimax.video",
    "ollama.chat",
] as const;
export type ProviderAdapterKind = (typeof PROVIDER_ADAPTER_KINDS)[number];

export type ProviderAdapterCapability = "chat" | "generate";

/** 适配器 → 协议；用于校验 key 是否可用、UI 按协议过滤密钥。 */
export const PROVIDER_ADAPTER_PROTOCOL: Record<
    ProviderAdapterKind,
    ApiKeyProtocol
> = {
    "deepseek.chat": "deepseek",
    "qwen.chat": "qwen",
    "qwen.image": "qwen",
    "minimax.chat": "minimax",
    "minimax.image": "minimax",
    "minimax.video": "minimax",
    "ollama.chat": "ollama",
};

/** 适配器 → 能力；用于按 Model Call 模式过滤模型/Provider。 */
export const PROVIDER_ADAPTER_CAPABILITY: Record<
    ProviderAdapterKind,
    ProviderAdapterCapability
> = {
    "deepseek.chat": "chat",
    "qwen.chat": "chat",
    "qwen.image": "generate",
    "minimax.chat": "chat",
    "minimax.image": "generate",
    "minimax.video": "generate",
    "ollama.chat": "chat",
};

/** 是否需要 API Key；本地 Ollama 不需要。 */
export const PROVIDER_ADAPTER_REQUIRES_KEY: Record<
    ProviderAdapterKind,
    boolean
> = {
    "deepseek.chat": true,
    "qwen.chat": true,
    "qwen.image": true,
    "minimax.chat": true,
    "minimax.image": true,
    "minimax.video": true,
    "ollama.chat": false,
};

/**
 * Key 健康状态。
 *
 * - `unverified`：尚未探测 / 网络不可用；
 * - `active`：最近一次探测通过；
 * - `invalid`：仅 401/403（凭据本身失效）；
 * - `quota`：402/429 等额度/限流问题，凭据仍有效；
 * - `network`：网络 / 超时 / 端点不可达，无法判断凭据。
 */
export const API_KEY_STATUSES = [
    "unverified",
    "active",
    "invalid",
    "quota",
    "network",
] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

export const API_KEY_ERROR_KINDS = [
    "auth",
    "quota",
    "network",
    "unknown",
] as const;
export type ApiKeyErrorKind = (typeof API_KEY_ERROR_KINDS)[number];

export type ApiKeyError = {
    kind: ApiKeyErrorKind;
    message: string;
    /** 有 HTTP 响应时记录状态码；网络错误没有。 */
    httpStatus?: number;
    at: string;
};

/** 密钥 / Provider 的健康投影；renderer 只读，不含明文。 */
export type ProviderHealth = {
    status: ApiKeyStatus;
    checkedAt?: string;
    error?: ApiKeyError;
};

/** API Key 的元数据；明文永远不进入这个结构。 */
export type ApiKeyRecord = {
    /** `key_` + 随机十六进制；同时作为 SecretsStore 的条目 id。 */
    id: string;
    protocol: ApiKeyProtocol;
    label: string;
    /** 可选端点；用于区域端点（如 Qwen 国内 / 国际）。 */
    baseUrl?: string;
    status: ApiKeyStatus;
    /** 不可逆指纹（SHA-256 前 12 位），用于识别，不存明文。 */
    fingerprint?: string;
    lastCheckedAt?: string;
    lastError?: ApiKeyError;
    createdAt: string;
    updatedAt: string;
};

/** 模型能力的精简投影；足够 UI 过滤，不复制 wireclaw 的完整 ModelInfo。 */
export type ModelCapabilitySummary = {
    chat?: boolean;
    generate?: boolean;
    decide?: boolean;
    embed?: boolean;
    tools?: boolean;
    thinking?: boolean;
    vision?: boolean;
    inputs?: readonly string[];
    outputs?: readonly string[];
};

/** 持久化的模型目录条目。 */
export type ModelCatalogEntry = {
    id: string;
    name: string;
    size?: number;
    capabilities?: ModelCapabilitySummary;
    thinkingLevels?: readonly (string | number)[];
};

export type ModelCatalogSource = "api" | "builtin" | "manual";

/**
 * 图里的 `providerId` 指向的 Provider 实例。
 *
 * `id` 会写进 `GraphDocument`，因此迁移时保留旧 id（ollama / deepseek / …）。
 */
export type ProviderProfile = {
    id: string;
    label: string;
    adapter: ProviderAdapterKind;
    /** 引用的 API Key；本地适配器（ollama）可以为空。 */
    apiKeyId?: string;
    /** 覆盖适配器默认端点。 */
    baseUrl?: string;
    defaultModelId?: string;
    enabled: boolean;
    /** 最近一次刷新得到的模型目录；启动不联网。 */
    models: ModelCatalogEntry[];
    modelsFetchedAt?: string;
    modelsSource?: ModelCatalogSource;
    createdAt: string;
    updatedAt: string;
};

export type ProviderLibrary = {
    schemaVersion: typeof PROVIDER_LIBRARY_SCHEMA_VERSION;
    keys: ApiKeyRecord[];
    profiles: ProviderProfile[];
};

/** Provider Profile 的运行时视图；renderer 只读，不含密钥。 */
export type ProviderProfileStatus = {
    profile: ProviderProfile;
    /** 当前可用（启用、密钥就绪、Provider 构造成功）。invalid key 仍可能 available。 */
    available: boolean;
    hasKey: boolean;
    keyStatus?: ApiKeyStatus;
    keyCheckedAt?: string;
    keyError?: ApiKeyError;
    error?: string;
};

export type ProviderLibraryView = {
    keys: ApiKeyRecord[];
    profiles: ProviderProfileStatus[];
    /** 最近一次库写入失败；当前会话的修改仍在内存中生效。 */
    persistenceError?: string;
};

/** 一次密钥验证的结果；不包含明文。 */
export type ApiKeyValidation = {
    status: ApiKeyStatus;
    checkedAt: string;
    error?: ApiKeyError;
    /** 验证顺带拿到的模型目录（可选）。 */
    models?: ModelCatalogEntry[];
};

export type ApiKeyAddRequest = {
    protocol: ApiKeyProtocol;
    label: string;
    apiKey: string;
    baseUrl?: string;
};

export type ApiKeyAddResult = {
    key: ApiKeyRecord;
    validation: ApiKeyValidation;
    /** 是否已写入磁盘；受限环境可能只存在于当前内存。 */
    persisted: boolean;
    /** 未落盘时的原因（例如权限 / 只读文件系统）。 */
    persistenceError?: string;
};

export type ApiKeyRevalidateRequest = { keyId: string };
export type ApiKeyReplaceRequest = { keyId: string; apiKey: string };
export type ApiKeyDeleteRequest = { keyId: string };
export type ApiKeyDeleteResult = { deleted: boolean };

export type ProviderProfileCreateRequest = {
    label: string;
    adapter: ProviderAdapterKind;
    apiKeyId?: string;
    baseUrl?: string;
    defaultModelId?: string;
    enabled?: boolean;
};

/** 更新 profile；`null` 表示清空可选字段（apiKeyId / baseUrl / defaultModelId）。 */
export type ProviderProfileUpdateRequest = {
    id: string;
    patch: Partial<{
        label: string;
        adapter: ProviderAdapterKind;
        apiKeyId: string | null;
        baseUrl: string | null;
        defaultModelId: string | null;
        enabled: boolean;
    }>;
};

export type ProviderProfileDeleteRequest = { id: string };
export type ProviderModelsRefreshRequest = { profileId: string };

export type ProviderCatalogRefreshResult = {
    profile: ProviderProfile;
    models: ModelCatalogEntry[];
    checkedAt: string;
    error?: string;
};

export type ProviderProfileDeleteResult = { deleted: boolean };
