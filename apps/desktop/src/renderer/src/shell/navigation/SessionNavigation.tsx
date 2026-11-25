import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactElement,
    type ReactNode,
} from "react";
import {
    ChevronRight,
    Folder,
    FolderCheck,
    FolderPlus,
    MessageSquare,
    PenLine,
    Plus,
    RefreshCw,
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
import { NavigationPanel } from "./NavigationPanel";
import styles from "./SessionNavigation.module.css";

type FolderOption = { id: string | null; title: string; depth: number };

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
    busy,
    width,
    sessionRevision,
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
        if (deleted !== null) setDeleteTarget(null);
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

    const renderSessionActions = (session: SessionSummary): ReactElement => (
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
                        depth={depth}
                        onOpen={() => onOpenSession(node.session)}
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
                                style={{ paddingLeft: 8 + depth * 14 }}
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
                onCollapse={onCollapse}
            >
                <div className={styles.search}>
                    <Input
                        aria-label="搜索会话"
                        placeholder="搜索会话…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>

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
                open={moveTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setMoveTarget(null);
                }}
            >
                <DialogContent
                    title="移动"
                    description={`选择「${moveTarget?.title ?? ""}」的目标文件夹。`}
                    footer={
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setMoveTarget(null)}
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
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
            >
                <DialogContent
                    title="删除"
                    description="删除后无法恢复；文件夹会递归删除其中内容。"
                    footer={
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteTarget(null)}
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
                    <p>确定删除「{deleteTarget?.title ?? ""}」？</p>
                </DialogContent>
            </Dialog>
        </>
    );
}

function SessionRow({
    session,
    active,
    depth,
    onOpen,
    menu,
}: {
    session: SessionSummary;
    active: boolean;
    depth: number;
    onOpen: () => void;
    menu: ReactNode;
}): ReactElement {
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <button
                    type="button"
                    data-session-id={session.id}
                    aria-current={active ? "page" : undefined}
                    className={cx(styles.sessionRow, active && styles.active)}
                    style={{ paddingLeft: 8 + depth * 14 }}
                    onClick={onOpen}
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
