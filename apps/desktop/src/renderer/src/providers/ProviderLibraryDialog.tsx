import { useEffect, useMemo, useState, type ReactElement } from "react";
import type {
    ApiKeyRecord,
    ProviderAdapterKind,
    ProviderProfileStatus,
} from "@flowharness/contracts";
import {
    PROVIDER_ADAPTER_PROTOCOL,
    PROVIDER_ADAPTER_REQUIRES_KEY,
} from "@flowharness/contracts";
import {
    Badge,
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    Input,
    Select,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../ui";
import { useProviderLibrary } from "./context";
import {
    ADAPTER_OPTIONS,
    PROTOCOL_OPTIONS,
    keyErrorText,
    keyStatusMeta,
    keysForAdapter,
    maskFingerprint,
    profileHealth,
    profileOptionLabel,
} from "./model";
import styles from "./ProviderLibraryDialog.module.css";

type KeyDraft = {
    protocol: ApiKeyRecord["protocol"];
    label: string;
    apiKey: string;
    baseUrl: string;
};

type ProfileDraft = {
    label: string;
    adapter: ProviderAdapterKind;
    apiKeyId: string;
    baseUrl: string;
    defaultModelId: string;
    enabled: boolean;
};

function emptyKeyDraft(): KeyDraft {
    return { protocol: "deepseek", label: "", apiKey: "", baseUrl: "" };
}

function emptyProfileDraft(): ProfileDraft {
    return {
        label: "",
        adapter: "deepseek.chat",
        apiKeyId: "",
        baseUrl: "",
        defaultModelId: "",
        enabled: true,
    };
}

function formatTime(value: string | undefined): string {
    if (value === undefined || value.length === 0) return "未验证";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
}

/** Provider 与 API Key 库：设置页的 M9.3 实现。 */
export function ProviderLibraryDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}): ReactElement {
    const { view, status, error: loadError, refresh } = useProviderLibrary();
    const [tab, setTab] = useState<"keys" | "providers">("keys");
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [keyDraft, setKeyDraft] = useState<KeyDraft>(emptyKeyDraft);
    const [replaceKeyId, setReplaceKeyId] = useState<string | null>(null);
    const [replaceValue, setReplaceValue] = useState("");

    const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfileDraft);
    const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setMessage(null);
        setReplaceKeyId(null);
        setReplaceValue("");
        setEditingProfileId(null);
        setProfileDraft(emptyProfileDraft());
        setKeyDraft(emptyKeyDraft());
    }, [open]);

    const run = async (label: string, action: () => Promise<void>): Promise<void> => {
        setBusy(label);
        setError(null);
        setMessage(null);
        try {
            await action();
            await refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(null);
        }
    };

    const adapterKeyOptions = useMemo(
        () => keysForAdapter(view, profileDraft.adapter),
        [profileDraft.adapter, view],
    );

    const addKey = (): void => {
        const apiKey = keyDraft.apiKey.trim();
        if (apiKey.length === 0) {
            setError("请输入 API Key");
            return;
        }
        void run("add-key", async () => {
            const data = unwrap(
                await window.flowharness.addProviderKey({
                    protocol: keyDraft.protocol,
                    label: keyDraft.label.trim() || keyDraft.protocol,
                    apiKey,
                    ...(keyDraft.baseUrl.trim().length === 0
                        ? {}
                        : { baseUrl: keyDraft.baseUrl.trim() }),
                }),
            );
            const meta = keyStatusMeta(data.validation.status);
            const detail = keyErrorText(data.validation.error);
            setMessage(
                `密钥已保存（${meta.label}）${detail === undefined ? "" : `：${detail}`}`,
            );
            setKeyDraft((current) => ({
                ...current,
                label: "",
                apiKey: "",
            }));
        });
    };

    const revalidateKey = (key: ApiKeyRecord): void => {
        void run(`revalidate:${key.id}`, async () => {
            const data = unwrap(
                await window.flowharness.revalidateProviderKey({ keyId: key.id }),
            );
            const meta = keyStatusMeta(data.validation.status);
            const detail = keyErrorText(data.validation.error);
            setMessage(
                `${key.label} 验证结果：${meta.label}${detail === undefined ? "" : `（${detail}）`}`,
            );
        });
    };

    const replaceKey = (key: ApiKeyRecord): void => {
        const value = replaceValue.trim();
        if (value.length === 0) {
            setError("请输入新的 API Key");
            return;
        }
        void run(`replace:${key.id}`, async () => {
            const data = unwrap(
                await window.flowharness.replaceProviderKey({
                    keyId: key.id,
                    apiKey: value,
                }),
            );
            const meta = keyStatusMeta(data.validation.status);
            setMessage(`${key.label} 已替换（${meta.label}）`);
            setReplaceKeyId(null);
            setReplaceValue("");
        });
    };

    const deleteKey = (key: ApiKeyRecord): void => {
        if (!window.confirm(`删除密钥「${key.label}」？`)) return;
        void run(`delete-key:${key.id}`, async () => {
            unwrap(await window.flowharness.deleteProviderKey({ keyId: key.id }));
            setMessage(`已删除密钥「${key.label}」`);
        });
    };

    const editProfile = (statusValue: ProviderProfileStatus): void => {
        setEditingProfileId(statusValue.profile.id);
        setProfileDraft({
            label: statusValue.profile.label,
            adapter: statusValue.profile.adapter,
            apiKeyId: statusValue.profile.apiKeyId ?? "",
            baseUrl: statusValue.profile.baseUrl ?? "",
            defaultModelId: statusValue.profile.defaultModelId ?? "",
            enabled: statusValue.profile.enabled,
        });
        setTab("providers");
    };

    const resetProfileForm = (): void => {
        setEditingProfileId(null);
        setProfileDraft(emptyProfileDraft());
    };

    const saveProfile = (): void => {
        const label = profileDraft.label.trim();
        if (label.length === 0) {
            setError("请输入 Provider 名称");
            return;
        }
        const baseUrl = profileDraft.baseUrl.trim();
        const defaultModelId = profileDraft.defaultModelId.trim();
        const apiKeyId = profileDraft.apiKeyId.length === 0 ? null : profileDraft.apiKeyId;
        const labelKey = editingProfileId === null ? "create-profile" : "update-profile";

        void run(labelKey, async () => {
            if (editingProfileId === null) {
                unwrap(
                    await window.flowharness.createProviderProfile({
                        label,
                        adapter: profileDraft.adapter,
                        ...(apiKeyId === null ? {} : { apiKeyId }),
                        ...(baseUrl.length === 0 ? {} : { baseUrl }),
                        ...(defaultModelId.length === 0 ? {} : { defaultModelId }),
                        enabled: profileDraft.enabled,
                    }),
                );
                setMessage(`Provider「${label}」已创建`);
            } else {
                unwrap(
                    await window.flowharness.updateProviderProfile({
                        id: editingProfileId,
                        patch: {
                            label,
                            adapter: profileDraft.adapter,
                            apiKeyId,
                            baseUrl: baseUrl.length === 0 ? null : baseUrl,
                            defaultModelId:
                                defaultModelId.length === 0 ? null : defaultModelId,
                            enabled: profileDraft.enabled,
                        },
                    }),
                );
                setMessage(`Provider「${label}」已更新`);
            }
            resetProfileForm();
        });
    };

    const toggleProfile = (statusValue: ProviderProfileStatus, enabled: boolean): void => {
        void run(`toggle:${statusValue.profile.id}`, async () => {
            unwrap(
                await window.flowharness.updateProviderProfile({
                    id: statusValue.profile.id,
                    patch: { enabled },
                }),
            );
        });
    };

    const refreshModels = (statusValue: ProviderProfileStatus): void => {
        void run(`refresh:${statusValue.profile.id}`, async () => {
            const data = unwrap(
                await window.flowharness.refreshProviderModels({
                    profileId: statusValue.profile.id,
                }),
            );
            setMessage(
                data.error === undefined
                    ? `已刷新 ${String(data.models.length)} 个模型`
                    : `刷新失败：${data.error}`,
            );
        });
    };

    const deleteProfile = (statusValue: ProviderProfileStatus): void => {
        if (!window.confirm(`删除 Provider「${statusValue.profile.label}」？`)) return;
        void run(`delete-profile:${statusValue.profile.id}`, async () => {
            unwrap(
                await window.flowharness.deleteProviderProfile({
                    id: statusValue.profile.id,
                }),
            );
            setMessage(`已删除 Provider「${statusValue.profile.label}」`);
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                title="Provider 与 API 密钥"
                description="密钥只保存在 main 的安全存储中；Provider 负责把协议、密钥与模型目录组合成可运行的实例。"
                className={styles.dialog}
                footer={
                    <>
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null}
                            onClick={() => onOpenChange(false)}
                        >
                            关闭
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() => void refresh()}
                        >
                            刷新
                        </Button>
                    </>
                }
            >
                {status === "error" ? (
                    <p className={styles.error}>{loadError ?? "Provider 库加载失败"}</p>
                ) : null}
                {view.persistenceError === undefined ? null : (
                    <p className={styles.warning}>
                        无法写入磁盘，当前修改只在本次会话生效：{view.persistenceError}
                    </p>
                )}
                {error === null ? null : <p className={styles.error}>{error}</p>}
                {message === null ? null : <p className={styles.message}>{message}</p>}

                <Tabs
                    value={tab}
                    onValueChange={(value) => setTab(value as "keys" | "providers")}
                    className={styles.tabs}
                >
                    <TabsList className={styles.tabsList}>
                        <TabsTrigger value="keys">API 密钥</TabsTrigger>
                        <TabsTrigger value="providers">Provider</TabsTrigger>
                    </TabsList>

                    <TabsContent value="keys" className={styles.tabContent}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}>新增 API 密钥</span>
                                <span className={styles.sectionHint}>
                                    添加时会用协议端点验证；失效密钥仍会保存并标记
                                </span>
                            </div>
                            <div className={styles.formGrid}>
                                <div className={styles.fieldGroup}>
                                    <span className={styles.fieldLabel}>协议</span>
                                    <Select
                                        value={keyDraft.protocol}
                                        options={PROTOCOL_OPTIONS}
                                        onChange={(protocol) =>
                                            setKeyDraft((current) => ({
                                                ...current,
                                                protocol: protocol as KeyDraft["protocol"],
                                            }))
                                        }
                                        aria-label="密钥协议"
                                    />
                                </div>
                                <Input
                                    label="名称"
                                    value={keyDraft.label}
                                    placeholder="例如：DeepSeek 主账号"
                                    onChange={(event) =>
                                        setKeyDraft((current) => ({
                                            ...current,
                                            label: event.target.value,
                                        }))
                                    }
                                />
                                <Input
                                    label="API Key"
                                    type="password"
                                    autoComplete="off"
                                    value={keyDraft.apiKey}
                                    placeholder="sk-…"
                                    onChange={(event) =>
                                        setKeyDraft((current) => ({
                                            ...current,
                                            apiKey: event.target.value,
                                        }))
                                    }
                                />
                                <Input
                                    label="Base URL（可选）"
                                    value={keyDraft.baseUrl}
                                    placeholder="使用协议默认端点"
                                    onChange={(event) =>
                                        setKeyDraft((current) => ({
                                            ...current,
                                            baseUrl: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className={styles.formActions}>
                                <Button
                                    size="sm"
                                    variant="primary"
                                    disabled={busy !== null}
                                    onClick={addKey}
                                >
                                    {busy === "add-key" ? "验证中…" : "验证并保存"}
                                </Button>
                            </div>
                        </section>

                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}>密钥库</span>
                                <Badge variant="neutral">{view.keys.length}</Badge>
                            </div>
                            {view.keys.length === 0 ? (
                                <p className={styles.empty}>还没有 API 密钥。</p>
                            ) : (
                                <div className={styles.list}>
                                    {view.keys.map((key) => {
                                        const meta = keyStatusMeta(key.status);
                                        const detail = keyErrorText(key.lastError);
                                        return (
                                            <article key={key.id} className={styles.card}>
                                                <div className={styles.cardHeader}>
                                                    <span className={styles.cardTitle}>
                                                        {key.label}
                                                    </span>
                                                    <Badge variant="neutral">
                                                        {key.protocol}
                                                    </Badge>
                                                    <Badge variant={meta.tone}>
                                                        {meta.label}
                                                    </Badge>
                                                    <span className={styles.meta}>
                                                        {maskFingerprint(key.fingerprint)}
                                                    </span>
                                                    <span className={styles.meta}>
                                                        {formatTime(key.lastCheckedAt)}
                                                    </span>
                                                </div>
                                                {detail === undefined ? null : (
                                                    <span className={styles.errorText}>
                                                        {detail}
                                                    </span>
                                                )}
                                                <div className={styles.actions}>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy !== null}
                                                        onClick={() => revalidateKey(key)}
                                                    >
                                                        {busy === `revalidate:${key.id}`
                                                            ? "验证中…"
                                                            : "重新验证"}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy !== null}
                                                        onClick={() => {
                                                            setReplaceKeyId(key.id);
                                                            setReplaceValue("");
                                                        }}
                                                    >
                                                        替换
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy !== null}
                                                        onClick={() => deleteKey(key)}
                                                    >
                                                        删除
                                                    </Button>
                                                </div>
                                                {replaceKeyId === key.id ? (
                                                    <div className={styles.replaceRow}>
                                                        <Input
                                                            label="新 API Key"
                                                            type="password"
                                                            autoComplete="off"
                                                            value={replaceValue}
                                                            onChange={(event) =>
                                                                setReplaceValue(
                                                                    event.target.value,
                                                                )
                                                            }
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="primary"
                                                            disabled={busy !== null}
                                                            onClick={() => replaceKey(key)}
                                                        >
                                                            保存
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setReplaceKeyId(null);
                                                                setReplaceValue("");
                                                            }}
                                                        >
                                                            取消
                                                        </Button>
                                                    </div>
                                                ) : null}
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </TabsContent>

                    <TabsContent value="providers" className={styles.tabContent}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}>
                                    {editingProfileId === null ? "新建 Provider" : "编辑 Provider"}
                                </span>
                                <span className={styles.sectionHint}>
                                    协议 + 适配器 + 密钥 + 端点 + 模型目录
                                </span>
                            </div>
                            <div className={styles.formGrid}>
                                <Input
                                    label="名称"
                                    value={profileDraft.label}
                                    placeholder="例如：DeepSeek 主账号"
                                    onChange={(event) =>
                                        setProfileDraft((current) => ({
                                            ...current,
                                            label: event.target.value,
                                        }))
                                    }
                                />
                                <div className={styles.fieldGroup}>
                                    <span className={styles.fieldLabel}>适配器</span>
                                    <Select
                                        value={profileDraft.adapter}
                                        options={ADAPTER_OPTIONS}
                                        onChange={(adapter) => {
                                            const nextAdapter = adapter as ProviderAdapterKind;
                                            const protocol =
                                                PROVIDER_ADAPTER_PROTOCOL[nextAdapter];
                                            setProfileDraft((current) => {
                                                const key = view.keys.find(
                                                    (item) => item.id === current.apiKeyId,
                                                );
                                                return {
                                                    ...current,
                                                    adapter: nextAdapter,
                                                    apiKeyId:
                                                        key !== undefined &&
                                                        key.protocol === protocol
                                                            ? current.apiKeyId
                                                            : "",
                                                };
                                            });
                                        }}
                                        aria-label="Provider 适配器"
                                    />
                                </div>
                                <div className={styles.fieldGroup}>
                                    <span className={styles.fieldLabel}>API 密钥</span>
                                    <Select
                                        value={
                                            profileDraft.apiKeyId.length === 0
                                                ? "__none__"
                                                : profileDraft.apiKeyId
                                        }
                                        options={[
                                            {
                                                value: "__none__",
                                                label: PROVIDER_ADAPTER_REQUIRES_KEY[
                                                    profileDraft.adapter
                                                ]
                                                    ? "不使用密钥（稍后绑定）"
                                                    : "无需密钥",
                                            },
                                            ...adapterKeyOptions,
                                        ]}
                                        onChange={(value) =>
                                            setProfileDraft((current) => ({
                                                ...current,
                                                apiKeyId:
                                                    value === "__none__" ? "" : value,
                                            }))
                                        }
                                        placeholder="选择 API 密钥"
                                        aria-label="Provider 密钥"
                                    />
                                </div>
                                <Input
                                    label="Base URL（可选）"
                                    value={profileDraft.baseUrl}
                                    placeholder="使用适配器默认端点"
                                    onChange={(event) =>
                                        setProfileDraft((current) => ({
                                            ...current,
                                            baseUrl: event.target.value,
                                        }))
                                    }
                                />
                                <Input
                                    label="默认模型（可选）"
                                    value={profileDraft.defaultModelId}
                                    placeholder="模型 ID；节点仍可单独选择"
                                    onChange={(event) =>
                                        setProfileDraft((current) => ({
                                            ...current,
                                            defaultModelId: event.target.value,
                                        }))
                                    }
                                />
                                <div className={styles.formGridWide}>
                                    <Checkbox
                                        checked={profileDraft.enabled}
                                        onChange={(enabled) =>
                                            setProfileDraft((current) => ({
                                                ...current,
                                                enabled,
                                            }))
                                        }
                                        label="启用"
                                    />
                                </div>
                            </div>
                            <div className={styles.formActions}>
                                <Button
                                    size="sm"
                                    variant="primary"
                                    disabled={busy !== null}
                                    onClick={saveProfile}
                                >
                                    {editingProfileId === null ? "创建 Provider" : "保存"}
                                </Button>
                                {editingProfileId === null ? null : (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={resetProfileForm}
                                    >
                                        取消编辑
                                    </Button>
                                )}
                                {profileDraft.adapter === "ollama.chat" ? null : (
                                    <span className={styles.sectionHint}>
                                        没有可选密钥？先到「API 密钥」添加同协议密钥。
                                    </span>
                                )}
                            </div>
                        </section>

                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <span className={styles.sectionTitle}>Provider 列表</span>
                                <Badge variant="neutral">{view.profiles.length}</Badge>
                            </div>
                            {view.profiles.length === 0 ? (
                                <p className={styles.empty}>还没有 Provider。</p>
                            ) : (
                                <div className={styles.list}>
                                    {view.profiles.map((item) => {
                                        const health = profileHealth(item);
                                        const key =
                                            item.profile.apiKeyId === undefined
                                                ? undefined
                                                : view.keys.find(
                                                      (candidate) =>
                                                          candidate.id ===
                                                          item.profile.apiKeyId,
                                                  );
                                        const models = item.profile.models;
                                        return (
                                            <article
                                                key={item.profile.id}
                                                className={styles.card}
                                            >
                                                <div className={styles.cardHeader}>
                                                    <span className={styles.cardTitle}>
                                                        {profileOptionLabel(item)}
                                                    </span>
                                                    <Badge variant={health.tone}>
                                                        {health.label}
                                                    </Badge>
                                                    <span className={styles.meta}>
                                                        {key === undefined
                                                            ? "未绑定密钥"
                                                            : `${key.label} · ${
                                                                  keyStatusMeta(
                                                                      key.status,
                                                                  ).label
                                                              }`}
                                                    </span>
                                                    <span className={styles.meta}>
                                                        {String(models.length)} 个模型
                                                    </span>
                                                </div>
                                                {item.profile.baseUrl === undefined ? null : (
                                                    <span className={styles.meta}>
                                                        {item.profile.baseUrl}
                                                    </span>
                                                )}
                                                {health.detail === undefined ? null : (
                                                    <span className={styles.errorText}>
                                                        {health.detail}
                                                    </span>
                                                )}
                                                {models.length === 0 ? null : (
                                                    <div className={styles.models}>
                                                        {models.slice(0, 8).map((model) => (
                                                            <span
                                                                key={model.id}
                                                                className={styles.modelChip}
                                                            >
                                                                {model.id}
                                                            </span>
                                                        ))}
                                                        {models.length > 8 ? (
                                                            <span className={styles.modelChip}>
                                                                +{models.length - 8}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                )}
                                                <div className={styles.actions}>
                                                    <Checkbox
                                                        checked={item.profile.enabled}
                                                        onChange={(enabled) =>
                                                            toggleProfile(item, enabled)
                                                        }
                                                        label="启用"
                                                    />
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy !== null}
                                                        onClick={() => editProfile(item)}
                                                    >
                                                        编辑
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy !== null}
                                                        onClick={() => refreshModels(item)}
                                                    >
                                                        {busy === `refresh:${item.profile.id}`
                                                            ? "刷新中…"
                                                            : "刷新模型"}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy !== null}
                                                        onClick={() => deleteProfile(item)}
                                                    >
                                                        删除
                                                    </Button>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
