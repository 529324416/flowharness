import { useMemo, type ReactElement } from "react";
import type { ApiKeyRecord, ProviderAdapterKind } from "@flowharness/contracts";
import {
    PROVIDER_ADAPTER_PROTOCOL,
    PROVIDER_ADAPTER_REQUIRES_KEY,
} from "@flowharness/contracts";
import { Checkbox, Field, Input, Select } from "../ui";
import { ADAPTER_OPTIONS, keyOptionsForAdapter } from "./model";
import type { ProviderDraft } from "./drafts";
import styles from "./ProviderLibraryDialog.module.css";

/** Provider 名称 / 适配器 / 密钥 / 端点 / 默认模型 / 启用：属性栏与新建 Modal 共用。 */
export function ProviderFormFields({
    draft,
    onChange,
    keys,
    autoFocus = false,
}: {
    draft: ProviderDraft;
    onChange: (next: ProviderDraft) => void;
    keys: readonly ApiKeyRecord[];
    autoFocus?: boolean;
}): ReactElement {
    const keyOptions = useMemo(
        () => keyOptionsForAdapter(keys, draft.adapter),
        [draft.adapter, keys],
    );
    const requiresKey = PROVIDER_ADAPTER_REQUIRES_KEY[draft.adapter];

    const changeAdapter = (value: string): void => {
        const adapter = value as ProviderAdapterKind;
        const protocol = PROVIDER_ADAPTER_PROTOCOL[adapter];
        const current = keys.find((key) => key.id === draft.apiKeyId);
        onChange({
            ...draft,
            adapter,
            apiKeyId:
                current !== undefined && current.protocol === protocol
                    ? draft.apiKeyId
                    : "",
        });
    };

    return (
        <div className={styles.formGrid}>
            <Input
                label="名称"
                autoFocus={autoFocus}
                value={draft.label}
                placeholder="例如：DeepSeek 主账号"
                onChange={(event) => onChange({ ...draft, label: event.target.value })}
            />
            <Field label="适配器" htmlFor="provider-form-adapter">
                <Select
                    id="provider-form-adapter"
                    value={draft.adapter}
                    options={ADAPTER_OPTIONS}
                    onChange={changeAdapter}
                    aria-label="Provider 适配器"
                />
            </Field>
            <Field
                label="API 密钥"
                htmlFor="provider-form-key"
                hint={
                    requiresKey && keyOptions.length === 0
                        ? "没有同协议密钥；先到「API 密钥」添加。"
                        : undefined
                }
            >
                <Select
                    id="provider-form-key"
                    value={draft.apiKeyId.length === 0 ? "__none__" : draft.apiKeyId}
                    options={[
                        {
                            value: "__none__",
                            label: requiresKey
                                ? "不使用密钥（稍后绑定）"
                                : "无需密钥",
                        },
                        ...keyOptions,
                    ]}
                    onChange={(value) =>
                        onChange({
                            ...draft,
                            apiKeyId: value === "__none__" ? "" : value,
                        })
                    }
                    placeholder="选择 API 密钥"
                    aria-label="Provider 密钥"
                />
            </Field>
            <Input
                label="Base URL（可选）"
                value={draft.baseUrl}
                placeholder="使用适配器默认端点"
                onChange={(event) =>
                    onChange({ ...draft, baseUrl: event.target.value })
                }
            />
            <Input
                label="默认模型（可选）"
                value={draft.defaultModelId}
                placeholder="模型 ID；节点仍可单独选择"
                onChange={(event) =>
                    onChange({ ...draft, defaultModelId: event.target.value })
                }
            />
            <div className={styles.formWide}>
                <Checkbox
                    checked={draft.enabled}
                    onChange={(enabled) => onChange({ ...draft, enabled })}
                    label="启用"
                />
            </div>
        </div>
    );
}
