import type {
    ApiKeyProtocol,
    ProviderAdapterKind,
    ProviderProfile,
} from "@flowharness/contracts";

/** 新增 API Key 的表单草稿；提交前只保留可读字段，明文不进入状态以外的地方。 */
export type KeyDraft = {
    protocol: ApiKeyProtocol;
    label: string;
    apiKey: string;
    baseUrl: string;
};

export function emptyKeyDraft(): KeyDraft {
    return { protocol: "deepseek", label: "", apiKey: "", baseUrl: "" };
}

/** Provider 表单草稿；编辑属性栏与新建 Modal 共用。 */
export type ProviderDraft = {
    label: string;
    adapter: ProviderAdapterKind;
    apiKeyId: string;
    baseUrl: string;
    defaultModelId: string;
    enabled: boolean;
};

export function emptyProviderDraft(): ProviderDraft {
    return {
        label: "",
        adapter: "deepseek.chat",
        apiKeyId: "",
        baseUrl: "",
        defaultModelId: "",
        enabled: true,
    };
}

export function providerDraftFromProfile(profile: ProviderProfile): ProviderDraft {
    return {
        label: profile.label,
        adapter: profile.adapter,
        apiKeyId: profile.apiKeyId ?? "",
        baseUrl: profile.baseUrl ?? "",
        defaultModelId: profile.defaultModelId ?? "",
        enabled: profile.enabled,
    };
}

export function isProviderDraftDirty(
    draft: ProviderDraft,
    profile: ProviderProfile,
): boolean {
    return (
        draft.label !== profile.label ||
        draft.adapter !== profile.adapter ||
        draft.apiKeyId !== (profile.apiKeyId ?? "") ||
        draft.baseUrl !== (profile.baseUrl ?? "") ||
        draft.defaultModelId !== (profile.defaultModelId ?? "") ||
        draft.enabled !== profile.enabled
    );
}
