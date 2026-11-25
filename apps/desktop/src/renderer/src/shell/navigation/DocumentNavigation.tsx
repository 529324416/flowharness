import { Fragment, useMemo, useState, type ReactElement } from "react";
import { FileText, Play, Plus, Search } from "lucide-react";
import type { WorkbenchNavigationProps } from "../../workbench/types";
import {
    Badge,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
    IconButton,
    Input,
    Tooltip,
} from "../../ui";
import { cx } from "../../ui/cx";
import { DocumentMenu } from "../DocumentMenu";
import {
    buildWorkflowActions,
    useWorkflowActions,
} from "../workflow-actions";
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

/** Harness 设计器左栏：工作流列表 + 通用动作 + 右键菜单。 */
export function DocumentNavigation({
    instance,
    documents,
    recentDocumentIds,
    activeDocumentId,
    busy,
    width,
    onResize,
    onCollapse,
    onModeChange,
    onSelectDocument,
    onCreateDocument,
    onRenameDocument,
    onDuplicateDocument,
    onDeleteDocument,
    onImportDocument,
    onExportDocument,
}: WorkbenchNavigationProps): ReactElement {
    const [query, setQuery] = useState("");
    const workflowActions = useWorkflowActions({
        onRenameDocument,
        onDeleteDocument,
        onImportDocument,
    });

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (term.length === 0) return documents;
        return documents.filter((document) =>
            `${document.title} ${document.id}`.toLowerCase().includes(term),
        );
    }, [documents, query]);

    return (
        <>
            <NavigationPanel
                title="工作流"
                badge={<Badge variant="neutral">{documents.length}</Badge>}
                actions={
                    <>
                        {instance.type === "harness-designer" ? (
                            <Tooltip label="进入运行">
                                <IconButton
                                    label="进入运行"
                                    size="sm"
                                    disabled={busy || documents.length === 0}
                                    onClick={() => onModeChange("run")}
                                >
                                    <Play size={18} aria-hidden="true" />
                                </IconButton>
                            </Tooltip>
                        ) : null}
                        <Tooltip label="新建工作流">
                            <IconButton
                                label="新建工作流"
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
                footer={`工作区工作流 · ${String(documents.length)}`}
                width={width}
                onResize={onResize}
                onCollapse={onCollapse}
            >
                <div className={styles.search}>
                    <div className={styles.searchBox}>
                        <Search
                            size={16}
                            className={styles.searchIcon}
                            aria-hidden="true"
                        />
                        <Input
                            className={styles.searchInput}
                            aria-label="搜索工作流"
                            placeholder="搜索工作流…"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                </div>

                <div className={styles.list}>
                    {documents.length === 0 ? (
                        <p className={styles.empty}>还没有工作流</p>
                    ) : filtered.length === 0 ? (
                        <p className={styles.empty}>没有匹配的工作流</p>
                    ) : (
                        filtered.map((document) => {
                            const actions = buildWorkflowActions({
                                document,
                                includeOpen: true,
                                onOpen: () => onSelectDocument(document.id),
                                onCreate: onCreateDocument,
                                onRename: workflowActions.requestRename,
                                onDuplicate: (target) =>
                                    onDuplicateDocument(target.id),
                                onDelete: workflowActions.requestDelete,
                                onImport: workflowActions.openImport,
                                onExport: (target, stripUi) =>
                                    onExportDocument(
                                        { stripUi },
                                        target.id,
                                    ),
                            });

                            return (
                                <ContextMenu key={document.id}>
                                    <ContextMenuTrigger asChild>
                                        <button
                                            type="button"
                                            data-document-id={document.id}
                                            aria-current={
                                                document.id === activeDocumentId
                                                    ? "page"
                                                    : undefined
                                            }
                                            className={cx(
                                                styles.item,
                                                document.id ===
                                                    activeDocumentId &&
                                                    styles.active,
                                            )}
                                            onClick={() =>
                                                onSelectDocument(document.id)
                                            }
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
                                                    {formatUpdatedAt(
                                                        document.updatedAt,
                                                    )}
                                                </span>
                                            </span>
                                        </button>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent>
                                        {actions.map((action) => (
                                            <Fragment key={action.id}>
                                                {action.separatorBefore ? (
                                                    <ContextMenuSeparator />
                                                ) : null}
                                                <ContextMenuItem
                                                    disabled={action.disabled}
                                                    onSelect={action.run}
                                                >
                                                    <action.icon
                                                        size={15}
                                                        aria-hidden="true"
                                                    />
                                                    {action.label}
                                                </ContextMenuItem>
                                            </Fragment>
                                        ))}
                                    </ContextMenuContent>
                                </ContextMenu>
                            );
                        })
                    )}
                </div>
            </NavigationPanel>

            {workflowActions.dialogs}
        </>
    );
}
