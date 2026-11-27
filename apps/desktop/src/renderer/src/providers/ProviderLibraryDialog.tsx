import { useEffect, useState, type ReactElement } from "react";
import type { ApiKeyRecord, ProviderProfileStatus } from "@flowharness/contracts";
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    EmptyState,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../ui";
import { useProviderLibrary } from "./context";
import {
    ADAPTER_LABELS,
    PROTOCOL_LABELS,
    keyErrorText,
    keyStatusMeta,
    maskFingerprint,
    profileHealth,
} from "./model";
import type { KeyDraft, ProviderDraft } from "./drafts";
import { CreateKeyDialog } from "./CreateKeyDialog";
import { CreateProviderDialog } from "./CreateProviderDialog";
import { KeyDetailPanel } from "./KeyDetailPanel";
import { ProviderDetailPanel } from "./ProviderDetailPanel";
import styles from "./ProviderLibraryDialog.module.css";

function describeError(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

function unwrap<T>(
    result: { ok: true; data: T } | { ok: false; error: { message: string } },
): T {
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
}

/**
 * Provider 与 API Key 库。
 *
 * 每个页签都是「左侧列表 + 右侧属性栏」：新增表单不再占用列表区域，
 * 而是由列表头部的「新增」按钮打开独立 Modal。
 */
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
    const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
        null,
    );
    const [createKeyOpen, setCreateKeyOpen] = useState(false);
    const [createProfileOpen, setCreateProfileOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setMessage(null);
        setCreateKeyOpen(false);
        setCreateProfileOpen(false);
    }, [open]);

    // 选中项跟随库刷新：保留仍然存在的选择，否则回退到第一条。
    useEffect(() => {
        if (!open) return;
        setSelectedKeyId((current) =>
            current !== null && view.keys.some((key) => key.id === current)
                ? current
                : (view.keys[0]?.id ?? null),
        );
    }, [open, view.keys]);

    useEffect(() => {
        if (!open) return;
        setSelectedProfileId((current) =>
            current !== null &&
            view.profiles.some((item) => item.profile.id === current)
                ? current
                : (view.profiles[0]?.profile.id ?? null),
        );
    }, [open, view.profiles]);

    const perform = async (
        label: string,
        action: () => Promise<void>,
    ): Promise<void> => {
        setBusy(label);
        setError(null);
        setMessage(null);
        try {
            await action();
            await refresh();
        } finally {
            setBusy(null);
        }
    };

    const run = async (
        label: string,
        action: () => Promise<void>,
    ): Promise<void> => {
        try {
            await perform(label, action);
        } catch (cause) {
            setError(describeError(cause));
        }
    };

    const createKey = async (draft: KeyDraft): Promise<void> => {
        await perform("add-key", async () => {
            const data = unwrap(
                await window.flowharness.addProviderKey({
                    protocol: draft.protocol,
                    label: draft.label.length === 0 ? draft.protocol : draft.label,
                    apiKey: draft.apiKey,
                    ...(draft.baseUrl.length === 0
                        ? {}
                        : { baseUrl: draft.baseUrl }),
                }),
            );
            const meta = keyStatusMeta(data.validation.status);
            const detail = keyErrorText(data.validation.error);
            setMessage(
                `密钥已保存（${meta.label}）${detail === undefined ? "" : `：${detail}`}`,
            );
            setSelectedKeyId(data.key.id);
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

    const replaceKey = async (
        key: ApiKeyRecord,
        apiKey: string,
    ): Promise<boolean> => {
        try {
            await perform(`replace:${key.id}`, async () => {
                const data = unwrap(
                    await window.flowharness.replaceProviderKey({
                        keyId: key.id,
                        apiKey,
                    }),
                );
                const meta = keyStatusMeta(data.validation.status);
                setMessage(`${key.label} 已替换（${meta.label}）`);
            });
            return true;
        } catch (cause) {
            setError(describeError(cause));
            return false;
        }
    };

    const deleteKey = (key: ApiKeyRecord): void => {
        if (!window.confirm(`删除密钥「${key.label}」？`)) return;
        void run(`delete-key:${key.id}`, async () => {
            unwrap(await window.flowharness.deleteProviderKey({ keyId: key.id }));
            setMessage(`已删除密钥「${key.label}」`);
            setSelectedKeyId((current) => (current === key.id ? null : current));
        });
    };

    const createProfile = async (draft: ProviderDraft): Promise<void> => {
        await perform("create-profile", async () => {
            const baseUrl = draft.baseUrl.trim();
            const defaultModelId = draft.defaultModelId.trim();
            const created = unwrap(
                await window.flowharness.createProviderProfile({
                    label: draft.label,
                    adapter: draft.adapter,
                    ...(draft.apiKeyId.length === 0
                        ? {}
                        : { apiKeyId: draft.apiKeyId }),
                    ...(baseUrl.length === 0 ? {} : { baseUrl }),
                    ...(defaultModelId.length === 0 ? {} : { defaultModelId }),
                    enabled: draft.enabled,
                }),
            );
            setMessage(`Provider「${created.label}」已创建`);
            setSelectedProfileId(created.id);
        });
    };

    const saveProfile = (draft: ProviderDraft): void => {
        if (selectedProfileId === null) return;
        const label = draft.label.trim();
        if (label.length === 0) {
            setError("请输入 Provider 名称");
            return;
        }
        const baseUrl = draft.baseUrl.trim();
        const defaultModelId = draft.defaultModelId.trim();
        void run(`save-profile:${selectedProfileId}`, async () => {
            unwrap(
                await window.flowharness.updateProviderProfile({
                    id: selectedProfileId,
                    patch: {
                        label,
                        adapter: draft.adapter,
                        apiKeyId:
                            draft.apiKeyId.length === 0 ? null : draft.apiKeyId,
                        baseUrl: baseUrl.length === 0 ? null : baseUrl,
                        defaultModelId:
                            defaultModelId.length === 0 ? null : defaultModelId,
                        enabled: draft.enabled,
                    },
                }),
            );
            setMessage(`Provider「${label}」已更新`);
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
            setSelectedProfileId((current) =>
                current === statusValue.profile.id ? null : current,
            );
        });
    };

    const selectedKey =
        view.keys.find((key) => key.id === selectedKeyId) ?? null;
    const selectedProfile =
        view.profiles.find((item) => item.profile.id === selectedProfileId) ??
        null;

    return (
        <>
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
                        <p className={styles.error}>
                            {loadError ?? "Provider 库加载失败"}
                        </p>
                    ) : null}
                    {view.persistenceError === undefined ? null : (
                        <p className={styles.warning}>
                            无法写入磁盘，当前修改只在本次会话生效：
                            {view.persistenceError}
                        </p>
                    )}
                    {error === null ? null : (
                        <p className={styles.error}>{error}</p>
                    )}
                    {message === null ? null : (
                        <p className={styles.message}>{message}</p>
                    )}

                    <Tabs
                        value={tab}
                        onValueChange={(value) =>
                            setTab(value as "keys" | "providers")
                        }
                        className={styles.tabs}
                    >
                        <TabsList className={styles.tabsList}>
                            <TabsTrigger value="keys">API 密钥</TabsTrigger>
                            <TabsTrigger value="providers">Provider</TabsTrigger>
                        </TabsList>

                        <TabsContent value="keys" className={styles.tabContent}>
                            <div className={styles.layout}>
                                <aside className={styles.sidebar}>
                                    <div className={styles.sidebarHeader}>
                                        <span
                                            className={styles.sidebarTitle}
                                        >
                                            API 密钥
                                        </span>
                                        <Badge variant="neutral">
                                            {view.keys.length}
                                        </Badge>
                                        <Button
                                            size="sm"
                                            variant="primary"
                                            onClick={() => setCreateKeyOpen(true)}
                                        >
                                            新增
                                        </Button>
                                    </div>
                                    <div className={styles.list}>
                                        {view.keys.length === 0 ? (
                                            <p className={styles.empty}>
                                                还没有 API 密钥。
                                            </p>
                                        ) : (
                                            view.keys.map((key) => {
                                                const meta = keyStatusMeta(
                                                    key.status,
                                                );
                                                return (
                                                    <button
                                                        key={key.id}
                                                        type="button"
                                                        className={styles.row}
                                                        data-key-id={key.id}
                                                        data-selected={
                                                            selectedKeyId ===
                                                            key.id
                                                        }
                                                        aria-pressed={
                                                            selectedKeyId ===
                                                            key.id
                                                        }
                                                        onClick={() =>
                                                            setSelectedKeyId(
                                                                key.id,
                                                            )
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                styles.rowMain
                                                            }
                                                        >
                                                            <span
                                                                className={
                                                                    styles.rowTitle
                                                                }
                                                            >
                                                                {key.label}
                                                            </span>
                                                            <span
                                                                className={
                                                                    styles.rowMeta
                                                                }
                                                            >
                                                                {
                                                                    PROTOCOL_LABELS[
                                                                        key
                                                                            .protocol
                                                                    ]
                                                                }{" "}
                                                                ·{" "}
                                                                {maskFingerprint(
                                                                    key.fingerprint,
                                                                )}
                                                            </span>
                                                        </span>
                                                        <Badge
                                                            variant={meta.tone}
                                                            className={
                                                                styles.rowBadge
                                                            }
                                                        >
                                                            {meta.label}
                                                        </Badge>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </aside>
                                <section className={styles.detail}>
                                    {selectedKey === null ? (
                                        <EmptyState
                                            title="选择左侧的 API 密钥"
                                            description="选中后可查看指纹、端点与验证状态，并执行重新验证 / 替换 / 删除。"
                                        />
                                    ) : (
                                        <KeyDetailPanel
                                            key={selectedKey.id}
                                            record={selectedKey}
                                            busy={busy}
                                            onRevalidate={() =>
                                                revalidateKey(selectedKey)
                                            }
                                            onReplace={(apiKey) =>
                                                replaceKey(selectedKey, apiKey)
                                            }
                                            onDelete={() =>
                                                deleteKey(selectedKey)
                                            }
                                        />
                                    )}
                                </section>
                            </div>
                        </TabsContent>

                        <TabsContent
                            value="providers"
                            className={styles.tabContent}
                        >
                            <div className={styles.layout}>
                                <aside className={styles.sidebar}>
                                    <div className={styles.sidebarHeader}>
                                        <span
                                            className={styles.sidebarTitle}
                                        >
                                            Provider
                                        </span>
                                        <Badge variant="neutral">
                                            {view.profiles.length}
                                        </Badge>
                                        <Button
                                            size="sm"
                                            variant="primary"
                                            onClick={() =>
                                                setCreateProfileOpen(true)
                                            }
                                        >
                                            新增
                                        </Button>
                                    </div>
                                    <div className={styles.list}>
                                        {view.profiles.length === 0 ? (
                                            <p className={styles.empty}>
                                                还没有 Provider。
                                            </p>
                                        ) : (
                                            view.profiles.map((item) => {
                                                const health =
                                                    profileHealth(item);
                                                return (
                                                    <button
                                                        key={item.profile.id}
                                                        type="button"
                                                        className={styles.row}
                                                        data-profile-id={
                                                            item.profile.id
                                                        }
                                                        data-selected={
                                                            selectedProfileId ===
                                                            item.profile.id
                                                        }
                                                        aria-pressed={
                                                            selectedProfileId ===
                                                            item.profile.id
                                                        }
                                                        onClick={() =>
                                                            setSelectedProfileId(
                                                                item.profile.id,
                                                            )
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                styles.rowMain
                                                            }
                                                        >
                                                            <span
                                                                className={
                                                                    styles.rowTitle
                                                                }
                                                            >
                                                                {
                                                                    item.profile
                                                                        .label
                                                                }
                                                            </span>
                                                            <span
                                                                className={
                                                                    styles.rowMeta
                                                                }
                                                            >
                                                                {
                                                                    ADAPTER_LABELS[
                                                                        item
                                                                            .profile
                                                                            .adapter
                                                                    ]
                                                                }
                                                            </span>
                                                        </span>
                                                        <Badge
                                                            variant={
                                                                health.tone
                                                            }
                                                            className={
                                                                styles.rowBadge
                                                            }
                                                        >
                                                            {health.label}
                                                        </Badge>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </aside>
                                <section className={styles.detail}>
                                    {selectedProfile === null ? (
                                        <EmptyState
                                            title="选择左侧的 Provider"
                                            description="选中后可编辑名称、适配器、密钥与端点，并查看模型目录。"
                                        />
                                    ) : (
                                        <ProviderDetailPanel
                                            key={selectedProfile.profile.id}
                                            status={selectedProfile}
                                            keys={view.keys}
                                            busy={busy}
                                            onSave={saveProfile}
                                            onRefreshModels={() =>
                                                refreshModels(selectedProfile)
                                            }
                                            onDelete={() =>
                                                deleteProfile(selectedProfile)
                                            }
                                        />
                                    )}
                                </section>
                            </div>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            <CreateKeyDialog
                open={createKeyOpen}
                busy={busy}
                onOpenChange={setCreateKeyOpen}
                onSubmit={createKey}
            />
            <CreateProviderDialog
                open={createProfileOpen}
                busy={busy}
                keys={view.keys}
                onOpenChange={setCreateProfileOpen}
                onSubmit={createProfile}
            />
        </>
    );
}
