import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import type { ApiKeyProtocol } from "@flowharness/contracts";
import { Button, Dialog, DialogContent, Field, Input, Select } from "../ui";
import { PROTOCOL_OPTIONS } from "./model";
import { emptyKeyDraft, type KeyDraft } from "./drafts";
import styles from "./ProviderLibraryDialog.module.css";

const FORM_ID = "provider-create-key-form";

/** 新增 API 密钥：从属性栏中抽出的独立 Modal。 */
export function CreateKeyDialog({
    open,
    busy,
    onOpenChange,
    onSubmit,
}: {
    open: boolean;
    busy: string | null;
    onOpenChange: (open: boolean) => void;
    onSubmit: (draft: KeyDraft) => Promise<void>;
}): ReactElement {
    const [draft, setDraft] = useState<KeyDraft>(emptyKeyDraft);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setDraft(emptyKeyDraft());
        setError(null);
    }, [open]);

    const submitting = busy === "add-key";

    const submit = async (event?: FormEvent): Promise<void> => {
        event?.preventDefault();
        const apiKey = draft.apiKey.trim();
        if (apiKey.length === 0) {
            setError("请输入 API Key");
            return;
        }
        setError(null);
        try {
            await onSubmit({
                ...draft,
                label: draft.label.trim(),
                apiKey,
                baseUrl: draft.baseUrl.trim(),
            });
            onOpenChange(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                title="新增 API 密钥"
                description="添加时会用协议端点验证；失效密钥仍会保存并标记。"
                className={styles.formDialog}
                footer={
                    <>
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={submitting}
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            size="sm"
                            variant="primary"
                            type="submit"
                            form={FORM_ID}
                            disabled={submitting}
                        >
                            {submitting ? "验证中…" : "验证并保存"}
                        </Button>
                    </>
                }
            >
                <form
                    id={FORM_ID}
                    className={styles.formGrid}
                    onSubmit={(event) => void submit(event)}
                >
                    <Field label="协议" htmlFor="create-key-protocol">
                        <Select
                            id="create-key-protocol"
                            value={draft.protocol}
                            options={PROTOCOL_OPTIONS}
                            aria-label="密钥协议"
                            onChange={(protocol) =>
                                setDraft((current) => ({
                                    ...current,
                                    protocol: protocol as ApiKeyProtocol,
                                }))
                            }
                        />
                    </Field>
                    <Input
                        label="名称"
                        autoFocus
                        value={draft.label}
                        placeholder="例如：DeepSeek 主账号"
                        onChange={(event) =>
                            setDraft((current) => ({
                                ...current,
                                label: event.target.value,
                            }))
                        }
                    />
                    <Input
                        label="API Key"
                        type="password"
                        autoComplete="off"
                        value={draft.apiKey}
                        placeholder="sk-…"
                        onChange={(event) =>
                            setDraft((current) => ({
                                ...current,
                                apiKey: event.target.value,
                            }))
                        }
                    />
                    <Input
                        label="Base URL（可选）"
                        value={draft.baseUrl}
                        placeholder="使用协议默认端点"
                        onChange={(event) =>
                            setDraft((current) => ({
                                ...current,
                                baseUrl: event.target.value,
                            }))
                        }
                    />
                    {error === null ? null : (
                        <p className={styles.formError}>{error}</p>
                    )}
                </form>
            </DialogContent>
        </Dialog>
    );
}
