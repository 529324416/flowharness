import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Button, Dialog, DialogContent, Field, Input, Select } from "../ui";
import { findNodeCatalogEntry } from "../designer/core/catalog";
import { usePresetLibrary } from "./context";
import { folderOptions } from "./model";
import styles from "./CreatePresetDialog.module.css";

export type PresetCapture = {
    type: string;
    typeVersion: number;
    config?: unknown;
};

export type CreatePresetDialogProps = {
    open: boolean;
    capture: PresetCapture | null;
    onOpenChange: (open: boolean) => void;
};

/** 从画布节点创建预设：名称 + 简介 + 目标文件夹。 */
export function CreatePresetDialog({
    open,
    capture,
    onOpenChange,
}: CreatePresetDialogProps): ReactElement {
    const { library, createPreset, openManager } = usePresetLibrary();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [folderId, setFolderId] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setName(capture === null ? "" : suggestedName(capture.type));
        setDescription("");
        setFolderId("");
        setError(null);
    }, [capture, open]);

    const entry = capture === null ? undefined : findNodeCatalogEntry(capture.type);
    const options = useMemo(() => folderOptions(library), [library]);

    const submit = (): void => {
        if (capture === null) return;
        const trimmed = name.trim();
        if (trimmed.length === 0) {
            setError("请填写预设名称");
            return;
        }

        const preset = createPreset({
            name: trimmed,
            ...(description.trim().length === 0
                ? {}
                : { description: description.trim() }),
            type: capture.type,
            typeVersion: capture.typeVersion,
            ...(capture.config === undefined
                ? {}
                : { config: capture.config }),
            folderId: folderId.length === 0 ? null : folderId,
        });
        onOpenChange(false);
        openManager(preset.id);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                title="创建预设节点"
                description="保存节点类型与当前默认参数，之后可从节点库插入。"
                footer={
                    <>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button size="sm" variant="primary" onClick={submit}>
                            创建
                        </Button>
                    </>
                }
            >
                <div className={styles.form}>
                    <Field label="名称" required error={error ?? undefined}>
                        <Input
                            autoFocus
                            value={name}
                            placeholder="例如：Qwen 图像生成"
                            onChange={(event) => {
                                setName(event.target.value);
                                setError(null);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") submit();
                            }}
                        />
                    </Field>

                    <Field label="简介">
                        <Input
                            value={description}
                            placeholder="这个预设适合什么场景"
                            onChange={(event) => setDescription(event.target.value)}
                        />
                    </Field>

                    <Field label="文件夹">
                        <Select
                            value={folderId}
                            options={options}
                            aria-label="预设文件夹"
                            onChange={setFolderId}
                        />
                    </Field>

                    <div className={styles.preview}>
                        <span className={styles.previewLabel}>节点类型</span>
                        <code>{capture?.type ?? "—"}</code>
                        <span className={styles.previewMeta}>
                            {entry?.title ?? "未知类型"} · v
                            {capture?.typeVersion ?? 1}
                        </span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function suggestedName(type: string): string {
    switch (type) {
        case "core.model":
            return "模型绑定";
        case "core.model.call":
            return "模型调用";
        case "core.agent.run":
            return "Agent";
        case "core.constant":
            return "常量";
        default:
            return type;
    }
}
