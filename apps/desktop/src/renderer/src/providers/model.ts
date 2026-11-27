import type {
    ApiKeyError,
    ApiKeyRecord,
    ApiKeyStatus,
    ModelCatalogEntry,
    ProviderAdapterKind,
    ProviderLibraryView,
    ProviderProfileStatus,
} from "@flowharness/contracts";
import {
    PROVIDER_ADAPTER_CAPABILITY,
    PROVIDER_ADAPTER_PROTOCOL,
    PROVIDER_ADAPTER_REQUIRES_KEY,
} from "@flowharness/contracts";

export const PROTOCOL_LABELS = {
    deepseek: "DeepSeek",
    qwen: "Qwen / DashScope",
    minimax: "MiniMax",
    ollama: "Ollama（本地）",
} as const;

export const ADAPTER_LABELS: Record<ProviderAdapterKind, string> = {
    "deepseek.chat": "DeepSeek · 对话",
    "qwen.chat": "Qwen · 对话",
    "qwen.image": "Qwen · 生图",
    "minimax.chat": "MiniMax · 对话",
    "minimax.image": "MiniMax · 生图",
    "minimax.video": "MiniMax · 视频",
    "ollama.chat": "Ollama · 对话",
};

export const ADAPTER_OPTIONS = Object.entries(ADAPTER_LABELS).map(
    ([value, label]) => ({ value, label }),
);

export const PROTOCOL_OPTIONS = Object.entries(PROTOCOL_LABELS).map(
    ([value, label]) => ({ value, label }),
);

export type ProviderHealthTone = "success" | "warning" | "danger" | "neutral";

export function profileHealth(status: ProviderProfileStatus): {
    label: string;
    tone: ProviderHealthTone;
    detail?: string;
} {
    const { profile } = status;
    if (!profile.enabled) return { label: "已禁用", tone: "neutral" };
    if (status.error !== undefined) {
        return { label: "不可用", tone: "danger", detail: status.error };
    }
    if (status.keyStatus === "invalid") {
        return {
            label: "密钥失效",
            tone: "danger",
            detail: status.keyError?.message,
        };
    }
    if (status.keyStatus === "quota") {
        return {
            label: "额度 / 限流",
            tone: "warning",
            detail: status.keyError?.message,
        };
    }
    if (PROVIDER_ADAPTER_REQUIRES_KEY[profile.adapter] && !status.hasKey) {
        return { label: "缺少密钥", tone: "warning" };
    }
    if (status.keyStatus === "unverified") {
        return { label: "未验证", tone: "warning" };
    }
    if (status.keyStatus === "network") {
        return {
            label: "网络异常",
            tone: "warning",
            detail: status.keyError?.message,
        };
    }
    return { label: "可用", tone: "success" };
}

export function keyStatusMeta(status: ApiKeyStatus): {
    label: string;
    tone: ProviderHealthTone;
} {
    switch (status) {
        case "active":
            return { label: "可用", tone: "success" };
        case "invalid":
            return { label: "已失效", tone: "danger" };
        case "quota":
            return { label: "额度 / 限流", tone: "warning" };
        case "network":
            return { label: "网络异常", tone: "warning" };
        case "unverified":
            return { label: "未验证", tone: "neutral" };
    }
}

export function maskFingerprint(fingerprint: string | undefined): string {
    if (fingerprint === undefined || fingerprint.length === 0) return "无指纹";
    return `fp ${fingerprint.slice(0, 6)}…`;
}

/** 统一展示时间；缺失时返回破折号，由调用方按语义补「未验证」等文案。 */
export function formatTime(value: string | undefined): string {
    if (value === undefined || value.length === 0) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function keyErrorText(error: ApiKeyError | undefined): string | undefined {
    if (error === undefined) return undefined;
    const status = error.httpStatus === undefined ? "" : ` (HTTP ${String(error.httpStatus)})`;
    return `${error.message}${status}`;
}

export function keyOptionsForAdapter(
    keys: readonly ApiKeyRecord[],
    adapter: ProviderAdapterKind,
): { value: string; label: string }[] {
    const protocol = PROVIDER_ADAPTER_PROTOCOL[adapter];
    return keys
        .filter((key) => key.protocol === protocol)
        .map((key) => ({
            value: key.id,
            label: `${key.label} · ${maskFingerprint(key.fingerprint)}`,
        }));
}

export function keysForAdapter(
    view: ProviderLibraryView,
    adapter: ProviderAdapterKind,
): { value: string; label: string }[] {
    return keyOptionsForAdapter(view.keys, adapter);
}

export function profilesForCapability(
    view: ProviderLibraryView,
    capability: "chat" | "generate",
): ProviderProfileStatus[] {
    return view.profiles.filter(
        (status) =>
            PROVIDER_ADAPTER_CAPABILITY[status.profile.adapter] === capability,
    );
}

export function modelOptions(
    models: readonly ModelCatalogEntry[],
): { value: string; label: string }[] {
    return models.map((model) => ({
        value: model.id,
        label: model.capabilities?.vision === true ? `${model.name}（视觉）` : model.name,
    }));
}

export function profileOptionLabel(status: ProviderProfileStatus): string {
    return `${status.profile.label} · ${ADAPTER_LABELS[status.profile.adapter]}`;
}
