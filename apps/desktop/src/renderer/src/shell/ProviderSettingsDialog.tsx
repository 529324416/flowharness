import { useCallback, useEffect, useState, type ReactElement } from "react";
import type {
    AppConfig,
    ProviderConfig,
    ProviderStatus,
    ProviderTestResult,
} from "@flowharness/contracts";
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    Input,
} from "../ui";
import styles from "./ProviderSettingsDialog.module.css";

export type ProviderSettingsDialogProps = {
    open: boolean;
    providers: readonly ProviderConfig[];
    onOpenChange: (open: boolean) => void;
    onSaved: (config: AppConfig) => void;
};

/**
 * Provider 设置：非敏感配置走 AppConfig，密钥只经 secrets:set 进入 main。
 * renderer 永远不读取已保存的密钥明文。
 */
export function ProviderSettingsDialog({
    open,
    providers,
    onOpenChange,
    onSaved,
}: ProviderSettingsDialogProps): ReactElement {
    const [drafts, setDrafts] = useState<ProviderConfig[]>([...providers]);
    const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
    const [keys, setKeys] = useState<Record<string, string>>({});
    const [tests, setTests] = useState<Record<string, ProviderTestResult>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const refresh = useCallback(async (): Promise<void> => {
        const result = await window.flowharness.listProviders();
        if (result.ok) setStatuses(result.data);
        else setError(result.error.message);
    }, []);

    useEffect(() => {
        if (!open) return;
        setDrafts([...providers]);
        setKeys({});
        setTests({});
        setError(null);
        setMessage(null);
        void refresh();
        // 只在打开时同步一次；避免 App 重渲染时覆盖正在编辑的 draft。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, refresh]);

    const update = (id: string, patch: Partial<ProviderConfig>): void => {
        setDrafts((current) =>
            current.map((provider) =>
                provider.id === id ? { ...provider, ...patch } : provider,
            ),
        );
    };

    const save = async (): Promise<void> => {
        setBusy("save");
        setError(null);
        setMessage(null);
        try {
            const result = await window.flowharness.updateConfig({
                providers: drafts,
            });
            if (!result.ok) {
                setError(result.error.message);
                return;
            }
            onSaved(result.data);
            setMessage("Provider 配置已保存");
            await refresh();
        } finally {
            setBusy(null);
        }
    };

    const saveKey = async (provider: ProviderConfig): Promise<void> => {
        const value = keys[provider.id]?.trim() ?? "";
        if (value.length === 0) return;

        setBusy(`key:${provider.id}`);
        setError(null);
        setMessage(null);
        try {
            const result = await window.flowharness.secretsSet(provider.id, value);
            if (!result.ok) {
                setError(result.error.message);
                return;
            }
            setKeys((current) => ({ ...current, [provider.id]: "" }));
            setMessage(`${provider.label} 密钥已保存`);
            await refresh();
        } finally {
            setBusy(null);
        }
    };

    const clearKey = async (provider: ProviderConfig): Promise<void> => {
        setBusy(`key:${provider.id}`);
        setError(null);
        setMessage(null);
        try {
            const result = await window.flowharness.secretsDelete(provider.id);
            if (!result.ok) {
                setError(result.error.message);
                return;
            }
            setMessage(`${provider.label} 密钥已清除`);
            setTests((current) => {
                const next = { ...current };
                delete next[provider.id];
                return next;
            });
            await refresh();
        } finally {
            setBusy(null);
        }
    };

    const test = async (provider: ProviderConfig): Promise<void> => {
        setBusy(`test:${provider.id}`);
        setError(null);
        try {
            const result = await window.flowharness.testProvider(provider.id);
            if (!result.ok) {
                setError(result.error.message);
                return;
            }
            setTests((current) => ({
                ...current,
                [provider.id]: result.data,
            }));
            await refresh();
        } finally {
            setBusy(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                title="Provider 设置"
                description="配置模型服务；密钥只保存在 main 的安全存储中，不会进入工作区或日志。"
                className={styles.dialog}
                footer={
                    <>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                        >
                            关闭
                        </Button>
                        <Button
                            size="sm"
                            variant="primary"
                            disabled={busy !== null}
                            onClick={() => void save()}
                        >
                            {busy === "save" ? "保存中…" : "保存配置"}
                        </Button>
                    </>
                }
            >
                {error === null ? null : <p className={styles.error}>{error}</p>}
                {message === null ? null : (
                    <p className={styles.message}>{message}</p>
                )}

                <div className={styles.list}>
                    {drafts.map((provider) => {
                        const status = statuses.find(
                            (item) => item.id === provider.id,
                        );
                        const testResult = tests[provider.id];
                        const keyBusy =
                            busy === `key:${provider.id}` ||
                            busy === `test:${provider.id}`;
                        return (
                            <section key={provider.id} className={styles.card}>
                                <header className={styles.cardHeader}>
                                    <label className={styles.enabled}>
                                        <input
                                            type="checkbox"
                                            checked={provider.enabled}
                                            onChange={(event) =>
                                                update(provider.id, {
                                                    enabled: event.target.checked,
                                                })
                                            }
                                        />
                                        启用
                                    </label>
                                    <code className={styles.id}>
                                        {provider.id}
                                    </code>
                                    <span className={styles.kind}>
                                        {provider.kind}
                                    </span>
                                    <Badge
                                        variant={
                                            status?.available ? "success" : "neutral"
                                        }
                                    >
                                        {status?.available ? "可用" : "未就绪"}
                                    </Badge>
                                </header>

                                <div className={styles.grid}>
                                    <Input
                                        label="显示名"
                                        value={provider.label}
                                        onChange={(event) =>
                                            update(provider.id, {
                                                label: event.target.value,
                                            })
                                        }
                                    />
                                    <Input
                                        label="Base URL（可选）"
                                        value={provider.baseUrl ?? ""}
                                        placeholder={
                                            provider.kind === "ollama"
                                                ? "http://127.0.0.1:11434"
                                                : "使用平台默认"
                                        }
                                        onChange={(event) =>
                                            update(provider.id, {
                                                baseUrl: event.target.value,
                                            })
                                        }
                                    />
                                    <Input
                                        label="默认模型（可选）"
                                        value={provider.model ?? ""}
                                        placeholder="模型 ID"
                                        onChange={(event) =>
                                            update(provider.id, {
                                                model: event.target.value,
                                            })
                                        }
                                    />
                                </div>

                                {provider.kind === "ollama" ? null : (
                                    <div className={styles.keyRow}>
                                        <Input
                                            label="API Key"
                                            type="password"
                                            autoComplete="off"
                                            value={keys[provider.id] ?? ""}
                                            placeholder={
                                                status?.hasKey
                                                    ? "已保存；输入新值可替换"
                                                    : "输入 API Key"
                                            }
                                            onChange={(event) =>
                                                setKeys((current) => ({
                                                    ...current,
                                                    [provider.id]:
                                                        event.target.value,
                                                }))
                                            }
                                        />
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            disabled={keyBusy}
                                            onClick={() => void saveKey(provider)}
                                        >
                                            保存密钥
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={keyBusy || !status?.hasKey}
                                            onClick={() => void clearKey(provider)}
                                        >
                                            清除
                                        </Button>
                                    </div>
                                )}

                                <div className={styles.testRow}>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={keyBusy}
                                        onClick={() => void test(provider)}
                                    >
                                        {busy === `test:${provider.id}`
                                            ? "测试中…"
                                            : "测试连接"}
                                    </Button>
                                    {testResult === undefined ? (
                                        <span className={styles.hint}>
                                            {status?.error ?? "尚未测试"}
                                        </span>
                                    ) : (
                                        <span className={styles.models}>
                                            {testResult.models.length === 0
                                                ? "连接成功，未发现模型"
                                                : `模型：${testResult.models.slice(0, 6).join(", ")}`}
                                        </span>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
