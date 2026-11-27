import {
    useRef,
    useState,
    type ChangeEvent,
    type ReactNode,
} from "react";
import {
    Copy,
    Download,
    FolderOpen,
    Pencil,
    Plus,
    Trash2,
    Upload,
    X,
    type LucideIcon,
} from "lucide-react";
import type { HarnessDocumentSummary } from "@flowharness/contracts";
import { Button, Dialog, DialogContent, Input } from "../ui";
import styles from "./workflow-actions.module.css";

export type WorkflowAction = {
    id: string;
    label: string;
    icon: LucideIcon;
    disabled?: boolean;
    separatorBefore?: boolean;
    run: () => void;
};

export type WorkflowActionContext = {
    document: HarnessDocumentSummary | null;
    includeOpen?: boolean;
    onOpen?: () => void;
    onCreate: () => void;
    onRename: (document: HarnessDocumentSummary) => void;
    onDuplicate: (document: HarnessDocumentSummary) => void;
    onDelete: (document: HarnessDocumentSummary) => void;
    onImport: () => void;
    onExport: (document: HarnessDocumentSummary, stripUi: boolean) => void;
};

/** 工作流动作列表；菜单与右键菜单共用同一份顺序与文案。 */
export function buildWorkflowActions(
    context: WorkflowActionContext,
): WorkflowAction[] {
    const { document } = context;
    const actions: WorkflowAction[] = [];

    if (context.includeOpen === true) {
        actions.push({
            id: "open",
            label: "打开工作流",
            icon: FolderOpen,
            disabled: document === null,
            run: () => context.onOpen?.(),
        });
    }

    actions.push({
        id: "create",
        label: "新建工作流",
        icon: Plus,
        run: context.onCreate,
    });
    actions.push({
        id: "rename",
        label: "重命名",
        icon: Pencil,
        disabled: document === null,
        run: () => {
            if (document !== null) context.onRename(document);
        },
    });
    actions.push({
        id: "duplicate",
        label: "复制当前工作流",
        icon: Copy,
        disabled: document === null,
        run: () => {
            if (document !== null) context.onDuplicate(document);
        },
    });
    actions.push({
        id: "delete",
        label: "删除当前工作流",
        icon: Trash2,
        disabled: document === null,
        run: () => {
            if (document !== null) context.onDelete(document);
        },
    });
    actions.push({
        id: "import",
        label: "导入工作流 JSON",
        icon: Upload,
        separatorBefore: true,
        run: context.onImport,
    });
    actions.push({
        id: "export",
        label: "导出 JSON（含布局）",
        icon: Download,
        disabled: document === null,
        run: () => {
            if (document !== null) context.onExport(document, false);
        },
    });
    actions.push({
        id: "export-strip-ui",
        label: "导出 JSON（无布局）",
        icon: Download,
        disabled: document === null,
        run: () => {
            if (document !== null) context.onExport(document, true);
        },
    });

    return actions;
}

export type WorkflowBatchActionContext = {
    /** 当前多选的工作流数量。 */
    count: number;
    /** 右键命中的工作流；仅「打开」使用。 */
    document: HarnessDocumentSummary;
    onOpen: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onClear: () => void;
};

/** 多选右键菜单：打开命中的工作流 + 批量复制 / 删除 + 清除选择。 */
export function buildWorkflowBatchActions(
    context: WorkflowBatchActionContext,
): WorkflowAction[] {
    return [
        {
            id: "batch-open",
            label: "打开工作流",
            icon: FolderOpen,
            run: context.onOpen,
        },
        {
            id: "batch-duplicate",
            label: `复制所选 ${String(context.count)} 个工作流`,
            icon: Copy,
            run: context.onDuplicate,
        },
        {
            id: "batch-delete",
            label: `删除所选 ${String(context.count)} 个工作流`,
            icon: Trash2,
            run: context.onDelete,
        },
        {
            id: "batch-clear",
            label: "清除选择",
            icon: X,
            separatorBefore: true,
            run: context.onClear,
        },
    ];
}

export type WorkflowActionsApi = {
    requestRename: (document: HarnessDocumentSummary) => void;
    requestDelete: (document: HarnessDocumentSummary) => void;
    /** 多选批量删除；确认后按 id 列表交给工作台。 */
    requestDeleteMany: (documents: readonly HarnessDocumentSummary[]) => void;
    openImport: () => void;
    dialogs: ReactNode;
};

/** 重命名 / 删除 / 导入的共享状态与对话框。 */
export function useWorkflowActions(input: {
    onRenameDocument: (id: string, title: string) => void;
    onDeleteDocument: (id: string) => void;
    onDeleteDocuments?: (ids: readonly string[]) => void;
    onImportDocument: (text: string, fileName: string) => void;
}): WorkflowActionsApi {
    const [renameTarget, setRenameTarget] =
        useState<HarnessDocumentSummary | null>(null);
    const [deleteTarget, setDeleteTarget] =
        useState<HarnessDocumentSummary | null>(null);
    const [deleteManyTargets, setDeleteManyTargets] = useState<
        readonly HarnessDocumentSummary[] | null
    >(null);
    const [draftTitle, setDraftTitle] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    const submitRename = (): void => {
        if (renameTarget === null) return;
        const title = draftTitle.trim();
        if (title.length === 0) return;
        input.onRenameDocument(renameTarget.id, title);
        setRenameTarget(null);
    };

    const submitDelete = (): void => {
        if (deleteTarget === null) return;
        input.onDeleteDocument(deleteTarget.id);
        setDeleteTarget(null);
    };

    const submitDeleteMany = (): void => {
        if (deleteManyTargets === null) return;
        const ids = deleteManyTargets.map((document) => document.id);
        if (input.onDeleteDocuments !== undefined) {
            input.onDeleteDocuments(ids);
        } else {
            for (const id of ids) input.onDeleteDocument(id);
        }
        setDeleteManyTargets(null);
    };

    const handleFile = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file === undefined) return;
        void file.text().then((text) => input.onImportDocument(text, file.name));
    };

    const dialogs = (
        <>
            <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleFile}
            />

            <Dialog
                open={renameTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setRenameTarget(null);
                }}
            >
                <DialogContent
                    title="重命名工作流"
                    description="只修改显示标题，不改变工作流 id。"
                    footer={
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRenameTarget(null)}
                            >
                                取消
                            </Button>
                            <Button
                                size="sm"
                                variant="primary"
                                disabled={draftTitle.trim().length === 0}
                                onClick={submitRename}
                            >
                                保存
                            </Button>
                        </>
                    }
                >
                    <Input
                        label="标题"
                        value={draftTitle}
                        autoFocus
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") submitRename();
                        }}
                    />
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
            >
                <DialogContent
                    title="删除工作流"
                    description="删除后无法从工作区恢复；请先导出需要保留的内容。"
                    footer={
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteTarget(null)}
                            >
                                取消
                            </Button>
                            <Button size="sm" variant="danger" onClick={submitDelete}>
                                删除
                            </Button>
                        </>
                    }
                >
                    <p>确定删除「{deleteTarget?.title ?? ""}」？</p>
                </DialogContent>
            </Dialog>
            <Dialog
                open={deleteManyTargets !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteManyTargets(null);
                }}
            >
                <DialogContent
                    title="删除所选工作流"
                    description="删除后无法从工作区恢复；请先导出需要保留的内容。"
                    footer={
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteManyTargets(null)}
                            >
                                取消
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={submitDeleteMany}
                            >
                                删除 {deleteManyTargets?.length ?? 0} 个
                            </Button>
                        </>
                    }
                >
                    <p>
                        确定删除选中的 {deleteManyTargets?.length ?? 0} 个工作流？
                    </p>
                    <ul className={styles.multiDeleteList}>
                        {(deleteManyTargets ?? []).map((document) => (
                            <li key={document.id}>{document.title}</li>
                        ))}
                    </ul>
                </DialogContent>
            </Dialog>
        </>
    );

    return {
        requestRename: (document) => {
            setDraftTitle(document.title);
            setRenameTarget(document);
        },
        requestDelete: (document) => setDeleteTarget(document),
        requestDeleteMany: (documents) => {
            if (documents.length === 0) return;
            setDeleteManyTargets(documents);
        },
        openImport: () => fileRef.current?.click(),
        dialogs,
    };
}
