import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
} from "react";
import { Check, Copy, FileText, Play, Plus, Search, Trash2, X } from "lucide-react";
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
    buildWorkflowBatchActions,
    useWorkflowActions,
} from "../workflow-actions";
import {
    orderedSelection,
    pruneSelection,
    selectRange,
    toggleSelected,
} from "../workflow-selection";
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

/** Harness 设计器左栏：工作流列表 + 通用动作 + 右键菜单 + 多选批量操作。 */
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
    navSection,
    onSelectDocument,
    onCreateDocument,
    onRenameDocument,
    onDuplicateDocument,
    onDeleteDocument,
    onDeleteDocuments,
    onDuplicateDocuments,
    onImportDocument,
    onExportDocument,
}: WorkbenchNavigationProps): ReactElement {
    const [query, setQuery] = useState("");
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const anchorIdRef = useRef<string | null>(null);
    const workflowActions = useWorkflowActions({
        onRenameDocument,
        onDeleteDocument,
        onDeleteDocuments,
        onImportDocument,
    });

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (term.length === 0) return documents;
        return documents.filter((document) =>
            `${document.title} ${document.id}`.toLowerCase().includes(term),
        );
    }, [documents, query]);

    // 文档被删除 / 外部刷新后丢弃失效的选中项。
    useEffect(() => {
        setSelectedIds((current) =>
            pruneSelection(
                current,
                documents.map((document) => document.id),
            ),
        );
    }, [documents]);

    const clearSelection = useCallback((): void => {
        setSelectedIds(new Set());
        anchorIdRef.current = null;
    }, []);

    const selectedDocuments = useMemo(
        () =>
            orderedSelection(
                selectedIds,
                documents.map((document) => document.id),
            ).map((id) => documents.find((document) => document.id === id)),
        [documents, selectedIds],
    );

    const selectionCount = selectedDocuments.length;

    const duplicateSelected = (): void => {
        const ids = selectedDocuments
            .map((document) => document?.id)
            .filter((id): id is string => id !== undefined);
        if (ids.length === 0) return;
        onDuplicateDocuments(ids);
        clearSelection();
    };

    const deleteSelected = (): void => {
        const targets = selectedDocuments.filter(
            (document) => document !== undefined,
        );
        if (targets.length === 0) return;
        workflowActions.requestDeleteMany(targets);
    };

    const handleItemClick = (
        event: React.MouseEvent<HTMLButtonElement>,
        document: (typeof documents)[number],
    ): void => {
        if (event.shiftKey) {
            event.preventDefault();
            const ordered = filtered.map((item) => item.id);
            const next = selectRange(ordered, anchorIdRef.current, document.id);
            if (anchorIdRef.current === null) anchorIdRef.current = document.id;
            setSelectedIds((current) =>
                event.ctrlKey || event.metaKey
                    ? new Set([...current, ...next])
                    : next,
            );
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            anchorIdRef.current = document.id;
            setSelectedIds((current) => toggleSelected(current, document.id));
            return;
        }

        clearSelection();
        onSelectDocument(document.id);
    };

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
                section={navSection !== undefined}
                onCollapse={navSection === "bottom" ? undefined : onCollapse}
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
                            onChange={(event) => {
                                setQuery(event.target.value);
                                clearSelection();
                            }}
                        />
                    </div>
                </div>

                {selectionCount > 0 ? (
                    <div
                        className={styles.selectionBar}
                        role="toolbar"
                        aria-label="工作流批量操作"
                    >
                        <span className={styles.selectionCount}>
                            已选 {selectionCount}
                        </span>
                        <button
                            type="button"
                            className={styles.selectionAction}
                            disabled={busy || filtered.length === 0}
                            onClick={() => {
                                setSelectedIds(
                                    new Set(filtered.map((item) => item.id)),
                                );
                            }}
                        >
                            全选
                        </button>
                        <span className={styles.selectionSpacer} />
                        <Tooltip label="复制所选工作流">
                            <IconButton
                                label="复制所选工作流"
                                size="sm"
                                disabled={busy}
                                onClick={duplicateSelected}
                            >
                                <Copy size={16} aria-hidden="true" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip label="删除所选工作流">
                            <IconButton
                                label="删除所选工作流"
                                size="sm"
                                disabled={busy}
                                onClick={deleteSelected}
                            >
                                <Trash2 size={16} aria-hidden="true" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip label="清除选择">
                            <IconButton
                                label="清除选择"
                                size="sm"
                                onClick={clearSelection}
                            >
                                <X size={16} aria-hidden="true" />
                            </IconButton>
                        </Tooltip>
                    </div>
                ) : null}

                <div className={styles.list}>
                    {documents.length === 0 ? (
                        <p className={styles.empty}>还没有工作流</p>
                    ) : filtered.length === 0 ? (
                        <p className={styles.empty}>没有匹配的工作流</p>
                    ) : (
                        filtered.map((document) => {
                            const multiSelected =
                                selectedIds.has(document.id) &&
                                selectionCount > 1;
                            const actions = multiSelected
                                ? buildWorkflowBatchActions({
                                      count: selectionCount,
                                      document,
                                      onOpen: () =>
                                          onSelectDocument(document.id),
                                      onDuplicate: duplicateSelected,
                                      onDelete: deleteSelected,
                                      onClear: clearSelection,
                                  })
                                : buildWorkflowActions({
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
                                            data-selected={
                                                selectedIds.has(document.id) ||
                                                undefined
                                            }
                                            aria-current={
                                                document.id === activeDocumentId
                                                    ? "page"
                                                    : undefined
                                            }
                                            title="Ctrl / Shift 点击可多选"
                                            className={cx(
                                                styles.item,
                                                document.id ===
                                                    activeDocumentId &&
                                                    styles.active,
                                                selectedIds.has(document.id) &&
                                                    styles.itemSelected,
                                            )}
                                            onClick={(event) =>
                                                handleItemClick(event, document)
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
                                            {selectedIds.has(document.id) ? (
                                                <Check
                                                    size={14}
                                                    className={styles.selectedCheck}
                                                    aria-hidden="true"
                                                />
                                            ) : null}
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
