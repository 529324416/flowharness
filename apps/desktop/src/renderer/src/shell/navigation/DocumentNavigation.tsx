import { useMemo, useState, type ReactElement } from "react";
import { FileText, Plus, Search } from "lucide-react";
import type { WorkbenchNavigationProps } from "../../workbench/types";
import { Badge, IconButton, Input, Tooltip } from "../../ui";
import { cx } from "../../ui/cx";
import { DocumentMenu } from "../DocumentMenu";
import { NavigationPanel } from "./NavigationPanel";
import styles from "./DocumentNavigation.module.css";

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

/** Harness 设计器左栏：GraphDocument 列表 + 文档动作。 */
export function DocumentNavigation({
    documents,
    recentDocumentIds,
    activeDocumentId,
    busy,
    width,
    onResize,
    onCollapse,
    onSelectDocument,
    onCreateDocument,
    onRenameDocument,
    onDuplicateDocument,
    onDeleteDocument,
    onImportDocument,
    onExportDocument,
}: WorkbenchNavigationProps): ReactElement {
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (term.length === 0) return documents;
        return documents.filter((document) =>
            `${document.title} ${document.id}`.toLowerCase().includes(term),
        );
    }, [documents, query]);

    return (
        <NavigationPanel
            title="图文档"
            badge={<Badge variant="neutral">{documents.length}</Badge>}
            actions={
                <>
                    <Tooltip label="新建图文档">
                        <IconButton
                            label="新建图文档"
                            size="sm"
                            disabled={busy}
                            onClick={onCreateDocument}
                        >
                            <Plus size={19} aria-hidden="true" />
                        </IconButton>
                    </Tooltip>
                    <DocumentMenu
                        documents={documents}
                        recentDocumentIds={recentDocumentIds}
                        activeDocumentId={activeDocumentId}
                        busy={busy}
                        showList={false}
                        trigger="icon"
                        onSelectDocument={onSelectDocument}
                        onCreateDocument={onCreateDocument}
                        onRenameDocument={onRenameDocument}
                        onDuplicateDocument={onDuplicateDocument}
                        onDeleteDocument={onDeleteDocument}
                        onImportDocument={onImportDocument}
                        onExportDocument={onExportDocument}
                    />
                </>
            }
            footer={`工作区文档 · ${String(documents.length)}`}
            width={width}
            onResize={onResize}
            onCollapse={onCollapse}
        >
            <div className={styles.search}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} aria-hidden="true" />
                    <Input
                        className={styles.searchInput}
                        aria-label="搜索图文档"
                        placeholder="搜索图文档…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
            </div>

            <div className={styles.list}>
                {documents.length === 0 ? (
                    <p className={styles.empty}>还没有图文档</p>
                ) : filtered.length === 0 ? (
                    <p className={styles.empty}>没有匹配的图文档</p>
                ) : (
                    filtered.map((document) => (
                        <button
                            key={document.id}
                            type="button"
                            data-document-id={document.id}
                            aria-current={
                                document.id === activeDocumentId ? "page" : undefined
                            }
                            className={cx(
                                styles.item,
                                document.id === activeDocumentId && styles.active,
                            )}
                            onClick={() => onSelectDocument(document.id)}
                        >
                            <FileText
                                size={17}
                                className={styles.icon}
                                aria-hidden="true"
                            />
                            <span className={styles.itemMain}>
                                <span className={styles.itemTitle}>
                                    {document.title}
                                </span>
                                <span className={styles.itemMeta}>
                                    {formatUpdatedAt(document.updatedAt)}
                                </span>
                            </span>
                        </button>
                    ))
                )}
            </div>
        </NavigationPanel>
    );
}
