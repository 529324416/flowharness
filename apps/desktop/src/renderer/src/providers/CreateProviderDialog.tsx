import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import type { ApiKeyRecord } from "@flowharness/contracts";
import { Button, Dialog, DialogContent } from "../ui";
import { emptyProviderDraft, type ProviderDraft } from "./drafts";
import { ProviderFormFields } from "./ProviderFormFields";
import styles from "./ProviderLibraryDialog.module.css";

const FORM_ID = "provider-create-profile-form";

/** 新建 Provider：属性栏中抽出的独立 Modal。 */
export function CreateProviderDialog({
    open,
    busy,
    keys,
    onOpenChange,
    onSubmit,
}: {
    open: boolean;
    busy: string | null;
    keys: readonly ApiKeyRecord[];
    onOpenChange: (open: boolean) => void;
    onSubmit: (draft: ProviderDraft) => Promise<void>;
}): ReactElement {
    const [draft, setDraft] = useState<ProviderDraft>(emptyProviderDraft);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setDraft(emptyProviderDraft());
        setError(null);
    }, [open]);

    const submitting = busy === "create-profile";

    const submit = async (event?: FormEvent): Promise<void> => {
        event?.preventDefault();
        const label = draft.label.trim();
        if (label.length === 0) {
            setError("请输入 Provider 名称");
            return;
        }
        setError(null);
        try {
            await onSubmit({ ...draft, label });
            onOpenChange(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                title="新建 Provider"
                description="协议 + 适配器 + 密钥 + 端点 + 模型目录。"
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
                            {submitting ? "创建中…" : "创建 Provider"}
                        </Button>
                    </>
                }
            >
                <form
                    id={FORM_ID}
                    onSubmit={(event) => void submit(event)}
                    className={styles.form}
                >
                    <ProviderFormFields
                        draft={draft}
                        onChange={setDraft}
                        keys={keys}
                        autoFocus
                    />
                    {error === null ? null : (
                        <p className={styles.formError}>{error}</p>
                    )}
                </form>
            </DialogContent>
        </Dialog>
    );
}
