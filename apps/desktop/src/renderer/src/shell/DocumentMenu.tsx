import { useRef, useState, type ChangeEvent, type ReactElement } from "react";
import {
    Check,
    Copy,
    Download,
    FileText,
    Pencil,
    Plus,
    Trash2,
    Upload,
} from "lucide-react";
import type { HarnessDocumentSummary } from "@flowharness/contracts";
import {
    Button,
    Dialog,
    DialogContent,
    Input,
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    MenuTrigger,
} from "../ui";
import styles from "./DocumentMenu.module.css";

export type DocumentMenuProps = {
    documents: readonly HarnessDocumentSummary[];
    recentDocumentIds?: readonly string[];
    activeDocumentId: string | null;
    busy?: boolean;
    onSelectDocument: (id: string) => void;
    onCreateDocument: () => void;
    onRenameDocument: (id: string, title: string) => void;
    onDuplicateDocument: (id: string) => void;
    onDeleteDocument: (id: string) => void;
    onImportDocument: (text: string, fileName: string) => void;
    onExportDocument: (options: { stripUi: boolean }) => void;
};

function formatUpdatedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** 标题栏文档切换器：多图列表 + 新建 / 重命名 / 复制 / 删除 / 导入导出。 */
export function DocumentMenu({
    documents,
    recentDocumentIds = [],
    activeDocumentId,
    busy = false,
    onSelectDocument,
    onCreateDocument,
    onRenameDocument,
    onDuplicateDocument,
    onDeleteDocument,
    onImportDocument,
    onExportDocument,
}: DocumentMenuProps): ReactElement {
    const active =
        documents.find((document) => document.id === activeDocumentId) ?? null;
    const recent = recentDocumentIds
        .map((id) => documents.find((document) => document.id === id))
        .filter(
            (document): document is HarnessDocumentSummary =>
                document !== undefined,
        )
        .slice(0, 3);
    const recentIds = new Set(recent.map((document) => document.id));
    const others = documents.filter((document) => !recentIds.has(document.id));
    const fileRef = useRef<HTMLInputElement>(null);
    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");

    const submitRename = (): void => {
        if (active === null) return;
        const title = draftTitle.trim();
        if (title.length === 0) return;
        onRenameDocument(active.id, title);
        setRenameOpen(false);
    };

    const submitDelete = (): void => {
        if (active === null) return;
        onDeleteDocument(active.id);
        setDeleteOpen(false);
    };

    const handleFile = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file === undefined) return;

        void file.text().then((text) => onImportDocument(text, file.name));
    };

    const renderDocument = (
        document: HarnessDocumentSummary,
        keyPrefix: string,
    ): ReactElement => (
        <MenuItem
            key={`${keyPrefix}:${document.id}`}
            className={styles.item}
            onSelect={() => onSelectDocument(document.id)}
        >
            <span className={styles.check}>
                {document.id === activeDocumentId ? (
                    <Check size={14} aria-hidden="true" />
                ) : null}
            </span>
            <span className={styles.title}>{document.title}</span>
            <span className={styles.meta}>
                {formatUpdatedAt(document.updatedAt)}
            </span>
        </MenuItem>
    );

    return (
        <>
            <Menu>
                <MenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className={styles.trigger}
                        disabled={busy}
                        aria-label="切换或管理文档"
                    >
                        <FileText size={15} aria-hidden="true" />
                        <span className={styles.name}>
                            {active?.title ?? "文档"}
                        </span>
                    </Button>
                </MenuTrigger>
                <MenuContent align="start" className={styles.menu}>
                    {documents.length === 0 ? (
                        <>
                            <MenuLabel>Harness 文档</MenuLabel>
                            <div className={styles.empty}>还没有文档</div>
                        </>
                    ) : (
                        <>
                            {recent.length > 0 ? (
                                <>
                                    <MenuLabel>最近打开</MenuLabel>
                                    {recent.map((document) =>
                                        renderDocument(document, "recent"),
                                    )}
                                    {others.length > 0 ? (
                                        <>
                                            <MenuSeparator />
                                            <MenuLabel>更多文档</MenuLabel>
                                            {others.map((document) =>
                                                renderDocument(document, "other"),
                                            )}
                                        </>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    <MenuLabel>Harness 文档</MenuLabel>
                                    {documents.map((document) =>
                                        renderDocument(document, "all"),
                                    )}
                                </>
                            )}
                        </>
                    )}

                    <MenuSeparator />
                    <MenuItem onSelect={onCreateDocument}>
                        <Plus size={15} aria-hidden="true" />
                        新建文档
                    </MenuItem>
                    <MenuItem
                        disabled={active === null}
                        onSelect={() => {
                            if (active === null) return;
                            setDraftTitle(active.title);
                            setRenameOpen(true);
                        }}
                    >
                        <Pencil size={15} aria-hidden="true" />
                        重命名
                    </MenuItem>
                    <MenuItem
                        disabled={active === null}
                        onSelect={() => {
                            if (active !== null) onDuplicateDocument(active.id);
                        }}
                    >
                        <Copy size={15} aria-hidden="true" />
                        复制当前文档
                    </MenuItem>
                    <MenuItem
                        disabled={active === null}
                        onSelect={() => setDeleteOpen(true)}
                    >
                        <Trash2 size={15} aria-hidden="true" />
                        删除当前文档
                    </MenuItem>

                    <MenuSeparator />
                    <MenuItem onSelect={() => fileRef.current?.click()}>
                        <Upload size={15} aria-hidden="true" />
                        导入 Harness JSON
                    </MenuItem>
                    <MenuItem
                        disabled={active === null}
                        onSelect={() => onExportDocument({ stripUi: false })}
                    >
                        <Download size={15} aria-hidden="true" />
                        导出 JSON（含布局）
                    </MenuItem>
                    <MenuItem
                        disabled={active === null}
                        onSelect={() => onExportDocument({ stripUi: true })}
                    >
                        <Download size={15} aria-hidden="true" />
                        导出 JSON（无布局）
                    </MenuItem>
                </MenuContent>
            </Menu>

            <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleFile}
            />

            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent
                    title="重命名文档"
                    description="只修改显示标题，不改变文档 id 与文件名。"
                    footer={
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRenameOpen(false)}
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

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent
                    title="删除文档"
                    description="删除后无法从工作区恢复；请先导出需要保留的内容。"
                    footer={
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={submitDelete}
                            >
                                删除
                            </Button>
                        </>
                    }
                >
                    <p className={styles.confirm}>
                        确定删除「{active?.title ?? ""}」？
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
}
