import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type ReactElement,
    type ReactNode,
} from "react";
import {
    ChevronRight,
    Folder,
    FolderCheck,
    FolderPlus,
    History,
    MessageSquare,
    PenLine,
    Plus,
    RefreshCw,
    Trash2,
    X,
} from "lucide-react";
import type {
    SessionFolder,
    SessionSummary,
    SessionTree,
    SessionTreeNode,
} from "@flowharness/contracts";
import type { WorkbenchNavigationProps } from "../../workbench/types";
import {
    Alert,
    Badge,
    Button,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
    Dialog,
    DialogContent,
    IconButton,
    Input,
    Tooltip,
} from "../../ui";
import { cx } from "../../ui/cx";
import {
    orderedSelection,
    pruneSelection,
    selectRange,
    toggleSelected,
} from "../workflow-selection";
import { NavigationPanel } from "./NavigationPanel";
import styles from "./SessionNavigation.module.css";

type FolderOption = { id: string | null; title: string; depth: number };

/**
 * 会话树缩进：文件夹按层级缩进；文件（会话）行再多缩进一个 chevron 位，
 * 让会话图标与同层文件夹图标对齐（正常文件树里文件不会顶到展开箭头那一列）。
 */
const TREE_INDENT_STEP = 14;
const TREE_BASE_PADDING = 8;
const TREE_FILE_OFFSET = 20;

type RenameTarget =
    | { kind: "folder"; id: string; title: string }
    | { kind: "session"; id: string; title: string };

type MoveTarget =
    | { kind: "folder"; id: string; title: string }
    | { kind: "session"; id: string; title: string };

type DeleteTarget =
    | { kind: "folder"; id: string; title: string }
    | { kind: "session"; id: string; title: string };

function flattenFolders(
    nodes: readonly SessionTreeNode[],
    depth = 0,
    out: FolderOption[] = [],
): FolderOption[] {
    for (const node of nodes) {
        if (node.type !== "folder") continue;
        out.push({ id: node.folder.id, title: node.folder.title, depth });
        flattenFolders(node.children, depth + 1, out);
    }
    return out;
}

function flattenSessions(nodes: readonly SessionTreeNode[]): SessionSummary[] {
    const sessions: SessionSummary[] = [];
    for (const node of nodes) {
        if (node.type === "session") {
            sessions.push(node.session);
        } else {
            sessions.push(...flattenSessions(node.children));
        }
    }
    return sessions;
}

function filterNodes(
    nodes: readonly SessionTreeNode[],
    term: string,
): SessionTreeNode[] {
    if (term.length === 0) return [...nodes];
    const result: SessionTreeNode[] = [];
    for (const node of nodes) {
        if (node.type === "session") {
            if (`${node.session.title} ${node.session.id}`.toLowerCase().includes(term)) {
                result.push(node);
            }
            continue;
        }
        const titleMatches = node.folder.title.toLowerCase().includes(term);
        const children = filterNodes(node.children, term);
        if (titleMatches || children.length > 0) {
            result.push({
                ...node,
                children: titleMatches ? [...node.children] : children,
            });
        }
    }
    return result;
}

/** 运行模式左栏：递归 Session 树 + 草稿目录 + 历史面板入口。 */
export function SessionNavigation({
    workspace,
    activeSessionId,
    temporarySession,
    onSessionsDeleted,
    busy,
    width,
    sessionRevision,
    navSection,
    onResize,
    onCollapse,
    onModeChange,
    onOpenSession,
}: WorkbenchNavigationProps): ReactElement {
    const [tree, setTree] = useState<SessionTree | null>(null);
    const [loading, setLoading] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [reloadToken, setReloadToken] = useState(0);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const [folderDialog, setFolderDialog] = useState<{
        parentId: string | null;
        title: string;
    } | null>(null);
    const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
    const [renameTitle, setRenameTitle] = useState("");
    const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
    const [extraSelected, setExtraSelected] = useState<Set<string>>(new Set());
    const selectionAnchorRef = useRef<string | null>(null);
    const [batchMove, setBatchMove] = useState<SessionSummary[] | null>(null);
    const [batchDelete, setBatchDelete] = useState<SessionSummary[] | null>(
        null,
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        void (async () => {
            const result = await window.flowharness.listSessionTree({
                workspaceId: workspace.id,
            });
            if (cancelled) return;
            if (!result.ok) {
                setError(result.error.message);
                setTree(null);
            } else {
                setTree(result.data);
            }
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, [workspace.id, reloadToken, sessionRevision]);

    const refresh = useCallback(() => {
        setReloadToken((current) => current + 1);
    }, []);

    const sessions = useMemo(
        () => (tree === null ? [] : flattenSessions(tree.nodes)),
        [tree],
    );
    const folderOptions = useMemo(
        () => [
            { id: null, title: "根目录", depth: 0 } satisfies FolderOption,
            ...(tree === null ? [] : flattenFolders(tree.nodes)),
        ],
        [tree],
    );
    const filtered = useMemo(
        () =>
            tree === null
                ? []
                : filterNodes(tree.nodes, query.trim().toLowerCase()),
        [tree, query],
    );
    const filteredSessions = useMemo(
        () => flattenSessions(filtered),
        [filtered],
    );
    /** 高亮即选中：打开中的会话 + 额外多选项。 */
    const selectionIds = useMemo(() => {
        const next = new Set(extraSelected);
        if (activeSessionId !== null) next.add(activeSessionId);
        return next;
    }, [activeSessionId, extraSelected]);
    const selectedSessions = useMemo(
        () =>
            orderedSelection(
                selectionIds,
                sessions.map((session) => session.id),
            )
                .map((id) => sessions.find((session) => session.id === id))
                .filter((session): session is SessionSummary => session !== undefined),
        [selectionIds, sessions],
    );
    const selectionCount = selectedSessions.length;

    useEffect(() => {
        setExtraSelected((current) => {
            const pruned = pruneSelection(
                current,
                sessions.map((session) => session.id),
            );
            const next = new Set(pruned);
            if (activeSessionId !== null) next.delete(activeSessionId);
            return next.size === current.size ? current : next;
        });
    }, [activeSessionId, sessions]);

    const clearSelection = useCallback((): void => {
        setExtraSelected(new Set());
        selectionAnchorRef.current = null;
    }, []);

    const selectAll = (): void => {
        setExtraSelected(
            new Set(
                filteredSessions
                    .map((session) => session.id)
                    .filter((id) => id !== activeSessionId),
            ),
        );
        selectionAnchorRef.current = activeSessionId;
    };

    const handleSessionClick = (
        event: ReactMouseEvent<HTMLButtonElement>,
        session: SessionSummary,
    ): void => {
        if (event.shiftKey) {
            event.preventDefault();
            const ordered = filteredSessions.map((item) => item.id);
            const anchor = selectionAnchorRef.current ?? activeSessionId;
            const range = selectRange(ordered, anchor, session.id);
            selectionAnchorRef.current = anchor ?? session.id;
            const extras = new Set(range);
            if (activeSessionId !== null) extras.delete(activeSessionId);
            setExtraSelected((current) =>
                event.ctrlKey || event.metaKey
                    ? new Set([...current, ...extras])
                    : extras,
            );
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            selectionAnchorRef.current = session.id;
            if (session.id === activeSessionId) return;
            setExtraSelected((current) =>
                toggleSelected(current, session.id),
            );
            return;
        }

        clearSelection();
        selectionAnchorRef.current = session.id;
        onOpenSession(session);
    };

    const runAction = async <T,>(
        action: () => Promise<{ ok: boolean; error?: { message: string }; data?: T }>,
    ): Promise<T | null> => {
        setWorking(true);
        setError(null);
        try {
            const result = await action();
            if (!result.ok) {
                setError(result.error?.message ?? "操作失败");
                return null;
            }
            refresh();
            return result.data ?? null;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
            return null;
        } finally {
            setWorking(false);
        }
    };

    const createSession = async (folderId: string | null): Promise<void> => {
        const created = await runAction(() =>
            window.flowharness.createSession({
                workspaceId: workspace.id,
                folderId,
            }),
        );
        if (created !== null) onOpenSession(created);
    };

    const setDraftFolder = async (folderId: string): Promise<void> => {
        await runAction(() =>
            window.flowharness.setDraftSessionFolder({
                workspaceId: workspace.id,
                folderId,
            }),
        );
    };

    const submitFolder = async (): Promise<void> => {
        if (folderDialog === null) return;
        const title = folderDialog.title.trim();
        if (title.length === 0) return;
        const folder = await runAction(() =>
            window.flowharness.createSessionFolder({
                workspaceId: workspace.id,
                title,
                parentFolderId: folderDialog.parentId,
            }),
        );
        if (folder !== null) setFolderDialog(null);
    };

    const submitRename = async (): Promise<void> => {
        if (renameTarget === null || renameTitle.trim().length === 0) return;
        if (renameTarget.kind === "folder") {
            const renamed = await runAction(() =>
                window.flowharness.renameSessionFolder({
                    workspaceId: workspace.id,
                    folderId: renameTarget.id,
                    title: renameTitle.trim(),
                }),
            );
            if (renamed !== null) setRenameTarget(null);
        } else {
            const renamed = await runAction(() =>
                window.flowharness.renameSession({
                    workspaceId: workspace.id,
                    sessionId: renameTarget.id,
                    title: renameTitle.trim(),
                }),
            );
            if (renamed !== null) setRenameTarget(null);
        }
    };

    const submitMove = async (folderId: string | null): Promise<void> => {
        if (batchMove !== null) {
            const targets = batchMove;
            setWorking(true);
            setError(null);
            try {
                let moved = 0;
                for (const session of targets) {
                    const result = await window.flowharness.moveSession({
                        workspaceId: workspace.id,
                        sessionId: session.id,
                        folderId,
                    });
                    if (!result.ok) {
                        setError(result.error.message);
                        break;
                    }
                    moved += 1;
                }
                if (moved > 0) {
                    clearSelection();
                    refresh();
                }
                setBatchMove(null);
            } finally {
                setWorking(false);
            }
            return;
        }
        if (moveTarget === null) return;
        const moved =
            moveTarget.kind === "folder"
                ? await runAction(() =>
                      window.flowharness.moveSessionFolder({
                          workspaceId: workspace.id,
                          folderId: moveTarget.id,
                          targetFolderId: folderId,
                      }),
                  )
                : await runAction(() =>
                      window.flowharness.moveSession({
                          workspaceId: workspace.id,
                          sessionId: moveTarget.id,
                          folderId,
                      }),
                  );
        if (moved !== null) setMoveTarget(null);
    };

    const submitDelete = async (): Promise<void> => {
        if (batchDelete !== null) {
            const targets = batchDelete;
            setWorking(true);
            setError(null);
            try {
                const deletedIds: string[] = [];
                for (const session of targets) {
                    const result = await window.flowharness.deleteSession({
                        workspaceId: workspace.id,
                        sessionId: session.id,
                    });
                    if (!result.ok) {
                        setError(result.error.message);
                        break;
                    }
                    deletedIds.push(session.id);
                }
                if (deletedIds.length > 0) {
                    onSessionsDeleted?.(deletedIds);
                    clearSelection();
                    refresh();
                }
                setBatchDelete(null);
            } finally {
                setWorking(false);
            }
            return;
        }
        if (deleteTarget === null) return;
        const deleted =
            deleteTarget.kind === "folder"
                ? await runAction(() =>
                      window.flowharness.deleteSessionFolder({
                          workspaceId: workspace.id,
                          folderId: deleteTarget.id,
                      }),
                  )
                : await runAction(() =>
                      window.flowharness.deleteSession({
                          workspaceId: workspace.id,
                          sessionId: deleteTarget.id,
                      }),
                  );
        if (deleted !== null) {
            if (deleteTarget.kind === "session") {
                onSessionsDeleted?.([deleteTarget.id]);
            }
            setDeleteTarget(null);
        }
    };

    const moveSelected = (): void => {
        if (selectedSessions.length === 0) return;
        setBatchMove(selectedSessions);
    };

    const deleteSelected = (): void => {
        if (selectedSessions.length === 0) return;
        setBatchDelete(selectedSessions);
    };

    const toggleFolder = (folderId: string): void => {
        setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    };

    const isExpanded = (folderId: string): boolean =>
        query.trim().length > 0 || !collapsed.has(folderId);

    const renderFolderActions = (folder: SessionFolder): ReactElement => (
        <>
            <ContextMenuItem
                onSelect={() =>
                    setFolderDialog({ parentId: folder.id, title: "" })
                }
            >
                <FolderPlus size={15} aria-hidden="true" />
                新建子文件夹
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void createSession(folder.id)}>
                <Plus size={15} aria-hidden="true" />
                新建会话
            </ContextMenuItem>
            {tree?.draftFolderId === folder.id ? null : (
                <ContextMenuItem onSelect={() => void setDraftFolder(folder.id)}>
                    <FolderCheck size={15} aria-hidden="true" />
                    设为草稿目录
                </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
                onSelect={() => {
                    setRenameTitle(folder.title);
                    setRenameTarget({
                        kind: "folder",
                        id: folder.id,
                        title: folder.title,
                    });
                }}
            >
                <PenLine size={15} aria-hidden="true" />
                重命名
            </ContextMenuItem>
            <ContextMenuItem
                onSelect={() =>
                    setMoveTarget({
                        kind: "folder",
                        id: folder.id,
                        title: folder.title,
                    })
                }
            >
                <Folder size={15} aria-hidden="true" />
                移动到…
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
                onSelect={() =>
                    setDeleteTarget({
                        kind: "folder",
                        id: folder.id,
                        title: folder.title,
                    })
                }
            >
                删除
            </ContextMenuItem>
        </>
    );

    const renderSessionActions = (session: SessionSummary): ReactElement => {
        const batch = selectionCount > 1 && selectionIds.has(session.id);
        if (batch) {
            return (
                <>
                    <ContextMenuItem onSelect={() => onOpenSession(session)}>
                        <MessageSquare size={15} aria-hidden="true" />
                        打开当前项
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={moveSelected}>
                        <Folder size={15} aria-hidden="true" />
                        移动所选（{selectionCount}）
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={deleteSelected}>
                        删除所选（{selectionCount}）
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={clearSelection}>
                        清除选择
                    </ContextMenuItem>
                </>
            );
        }
        return (
            <>
                <ContextMenuItem onSelect={() => onOpenSession(session)}>
                    <MessageSquare size={15} aria-hidden="true" />
                    打开
                </ContextMenuItem>
            <ContextMenuItem
                onSelect={() => {
                    setRenameTitle(session.title);
                    setRenameTarget({
                        kind: "session",
                        id: session.id,
                        title: session.title,
                    });
                }}
            >
                <PenLine size={15} aria-hidden="true" />
                重命名
            </ContextMenuItem>
            <ContextMenuItem
                onSelect={() =>
                    setMoveTarget({
                        kind: "session",
                        id: session.id,
                        title: session.title,
                    })
                }
            >
                <Folder size={15} aria-hidden="true" />
                移动到…
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
                onSelect={() =>
                    setDeleteTarget({
                        kind: "session",
                        id: session.id,
                        title: session.title,
                    })
                }
            >
                删除
            </ContextMenuItem>
            </>
        );
    };

    const renderNodes = (
        nodes: readonly SessionTreeNode[],
        depth: number,
    ): ReactNode =>
        nodes.map((node) => {
            if (node.type === "session") {
                return (
                    <SessionRow
                        key={node.session.id}
                        session={node.session}
                        active={node.session.id === activeSessionId}
                        selected={selectionIds.has(node.session.id)}
                        depth={depth}
                        onClick={(event) =>
                            handleSessionClick(event, node.session)
                        }
                        menu={renderSessionActions(node.session)}
                    />
                );
            }

            const expanded = isExpanded(node.folder.id);
            const draft = tree?.draftFolderId === node.folder.id;
            return (
                <Fragment key={node.folder.id}>
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <button
                                type="button"
                                className={styles.folderRow}
                                style={{ paddingLeft: TREE_BASE_PADDING + depth * TREE_INDENT_STEP }}
                                onClick={() => toggleFolder(node.folder.id)}
                            >
                                <ChevronRight
                                    size={14}
                                    className={cx(
                                        styles.chevron,
                                        expanded && styles.chevronOpen,
                                    )}
                                    aria-hidden="true"
                                />
                                <Folder
                                    size={16}
                                    className={styles.folderIcon}
                                    aria-hidden="true"
                                />
                                <span className={styles.rowTitle}>
                                    {node.folder.title}
                                </span>
                                {draft ? (
                                    <Badge variant="warning">默认</Badge>
                                ) : null}
                            </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                            {renderFolderActions(node.folder)}
                        </ContextMenuContent>
                    </ContextMenu>
                    {expanded
                        ? renderNodes(node.children, depth + 1)
                        : null}
                </Fragment>
            );
        });

    return (
        <>
            <NavigationPanel
                title="会话"
                badge={<Badge variant="neutral">{sessions.length}</Badge>}
                actions={
                    <>
                        <Tooltip label="返回设计">
                            <IconButton
                                label="返回设计"
                                size="sm"
                                onClick={() => onModeChange("design")}
                            >
                                <PenLine size={18} aria-hidden="true" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip label="刷新会话">
                            <IconButton
                                label="刷新会话"
                                size="sm"
                                disabled={loading || working}
                                onClick={refresh}
                            >
                                <RefreshCw size={17} aria-hidden="true" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip label="新建文件夹">
                            <IconButton
                                label="新建文件夹"
                                size="sm"
                                disabled={busy || working}
                                onClick={() =>
                                    setFolderDialog({ parentId: null, title: "" })
                                }
                            >
                                <FolderPlus size={18} aria-hidden="true" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip label="新建会话">
                            <IconButton
                                label="新建会话"
                                size="sm"
                                disabled={busy || working}
                                onClick={() =>
                                    void createSession(
                                        tree?.draftFolderId ?? null,
                                    )
                                }
                            >
                                <Plus size={19} aria-hidden="true" />
                            </IconButton>
                        </Tooltip>
                    </>
                }
                footer="会话已持久化到工作区"
                width={width}
                onResize={onResize}
                section={navSection !== undefined}
                onCollapse={navSection === "bottom" ? undefined : onCollapse}
            >
                <div className={styles.search}>
                    <Input
                        aria-label="搜索会话"
                        placeholder="搜索会话…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>

                {selectionCount > 1 ? (
                    <div
                        className={styles.selectionBar}
                        role="toolbar"
                        aria-label="会话批量操作"
                    >
                        <span className={styles.selectionCount}>
                            已选 {selectionCount}
                        </span>
                        <button
                            type="button"
                            className={styles.selectionAction}
                            disabled={
                                working || filteredSessions.length === 0
                            }
                            onClick={selectAll}
                        >
                            全选
                        </button>
                        <span className={styles.selectionSpacer} />
                        <Tooltip label="移动所选会话">
                            <IconButton
                                label="移动所选会话"
                                size="sm"
                                disabled={working}
                                onClick={moveSelected}
                            >
                                <Folder size={16} aria-hidden="true" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip label="删除所选会话">
                            <IconButton
                                label="删除所选会话"
                                size="sm"
                                disabled={working}
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

                {temporarySession === null ||
                temporarySession === undefined ? null : (
                    <div className={styles.temporary}>
                        <button
                            type="button"
                            data-temporary-session="true"
                            aria-current={
                                temporarySession.id === activeSessionId
                                    ? "page"
                                    : undefined
                            }
                            className={cx(
                                styles.sessionRow,
                                styles.temporaryRow,
                                temporarySession.id === activeSessionId &&
                                    styles.active,
                            )}
                            onClick={() => onOpenSession(temporarySession)}
                        >
                            <History
                                size={15}
                                className={styles.sessionIcon}
                                aria-hidden="true"
                            />
                            <span className={styles.rowTitle}>
                                {temporarySession.title}
                            </span>
                            <Badge variant="warning">临时</Badge>
                        </button>
                    </div>
                )}

                <div className={styles.list}>
                    {error !== null ? (
                        <Alert tone="danger" title="会话操作失败">
                            {error}
                        </Alert>
                    ) : null}
                    {loading ? (
                        <p className={styles.empty}>正在读取会话…</p>
                    ) : filtered.length === 0 ? (
                        <p className={styles.empty}>
                            {sessions.length === 0
                                ? "还没有会话"
                                : "没有匹配的会话"}
                        </p>
                    ) : (
                        renderNodes(filtered, 0)
                    )}
                </div>
            </NavigationPanel>

            <Dialog
                open={folderDialog !== null}
                onOpenChange={(open) => {
                    if (!open) setFolderDialog(null);
                }}
            >
                <DialogContent
                    title="新建文件夹"
                    description="文件夹可继续嵌套，用于整理会话。"
                    footer={
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setFolderDialog(null)}
                            >
                                取消
                            </Button>
                            <Button
                                size="sm"
                                variant="primary"
                                disabled={folderDialog?.title.trim().length === 0}
                                onClick={() => void submitFolder()}
                            >
                                创建
                            </Button>
                        </>
                    }
                >
                    <Input
                        label="名称"
                        autoFocus
                        value={folderDialog?.title ?? ""}
                        onChange={(event) =>
                            setFolderDialog((current) =>
                                current === null
                                    ? current
                                    : { ...current, title: event.target.value },
                            )
                        }
                        onKeyDown={(event) => {
                            if (event.key === "Enter") void submitFolder();
                        }}
                    />
                </DialogContent>
            </Dialog>

            <Dialog
                open={renameTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setRenameTarget(null);
                }}
            >
                <DialogContent
                    title="重命名"
                    description="只修改显示标题，不改变 id。"
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
                                disabled={renameTitle.trim().length === 0}
                                onClick={() => void submitRename()}
                            >
                                保存
                            </Button>
                        </>
                    }
                >
                    <Input
                        label="名称"
                        autoFocus
                        value={renameTitle}
                        onChange={(event) => setRenameTitle(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") void submitRename();
                        }}
                    />
                </DialogContent>
            </Dialog>

            <Dialog
                open={moveTarget !== null || batchMove !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setMoveTarget(null);
                        setBatchMove(null);
                    }
                }}
            >
                <DialogContent
                    title={batchMove === null ? "移动" : "移动所选会话"}
                    description={
                        batchMove === null
                            ? `选择「${moveTarget?.title ?? ""}」的目标文件夹。`
                            : `选择 ${String(batchMove.length)} 条会话的目标文件夹。`
                    }
                    footer={
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                setMoveTarget(null);
                                setBatchMove(null);
                            }}
                        >
                            取消
                        </Button>
                    }
                >
                    <div className={styles.moveList}>
                        {folderOptions.map((option) => (
                            <button
                                key={option.id ?? "root"}
                                type="button"
                                className={styles.moveOption}
                                style={{ paddingLeft: 10 + option.depth * 14 }}
                                onClick={() => void submitMove(option.id)}
                            >
                                <Folder size={15} aria-hidden="true" />
                                {option.title}
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleteTarget !== null || batchDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleteTarget(null);
                        setBatchDelete(null);
                    }
                }}
            >
                <DialogContent
                    title={
                        batchDelete === null ? "删除" : "删除所选会话"
                    }
                    description="删除后无法恢复；文件夹会递归删除其中内容。"
                    footer={
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    setDeleteTarget(null);
                                    setBatchDelete(null);
                                }}
                            >
                                取消
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={() => void submitDelete()}
                            >
                                删除
                            </Button>
                        </>
                    }
                >
                    {batchDelete === null ? (
                        <p>确定删除「{deleteTarget?.title ?? ""}」？</p>
                    ) : (
                        <>
                            <p>
                                确定删除 {batchDelete.length} 条会话？
                            </p>
                            <p className={styles.empty}>
                                {batchDelete
                                    .slice(0, 4)
                                    .map((session) => session.title)
                                    .join("、")}
                                {batchDelete.length > 4
                                    ? ` 等 ${String(batchDelete.length)} 条`
                                    : ""}
                            </p>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

function SessionRow({
    session,
    active,
    selected,
    depth,
    onClick,
    menu,
}: {
    session: SessionSummary;
    active: boolean;
    selected: boolean;
    depth: number;
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
    menu: ReactNode;
}): ReactElement {
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <button
                    type="button"
                    data-session-id={session.id}
                    data-selected={selected}
                    aria-current={active ? "page" : undefined}
                    aria-pressed={selected}
                    className={cx(
                        styles.sessionRow,
                        active && styles.active,
                        selected && styles.selected,
                    )}
                    style={{
                        paddingLeft:
                            TREE_BASE_PADDING +
                            TREE_FILE_OFFSET +
                            depth * TREE_INDENT_STEP,
                    }}
                    onClick={onClick}
                >
                    <MessageSquare
                        size={15}
                        className={styles.sessionIcon}
                        aria-hidden="true"
                    />
                    <span className={styles.rowTitle}>{session.title}</span>
                    <Badge variant="neutral">
                        {session.kind === "run" ? "运行" : "对话"}
                    </Badge>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>{menu}</ContextMenuContent>
        </ContextMenu>
    );
}
