import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { JsonObject, JsonValue } from "wireclaw";
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    EmptyState,
    Field,
    Input,
    Select,
} from "../ui";
import { findNodeCatalogEntry } from "../designer/core/catalog";
import { NodeConfigForm } from "../inspector/NodeConfigForm";
import {
    childFolders,
    folderOptions,
    folderPath,
    searchPresets,
    type PresetFolder,
    type PresetLibrary,
    type PresetPatch,
    type PresetRecord,
} from "./model";
import styles from "./PresetManagerDialog.module.css";

type Selection =
    | { kind: "folder"; id: string }
    | { kind: "preset"; id: string }
    | null;

export type PresetManagerDialogProps = {
    open: boolean;
    focusPresetId: string | null;
    library: PresetLibrary;
    status: "idle" | "loading" | "ready" | "error";
    saving: boolean;
    error: string | null;
    onOpenChange: (open: boolean) => void;
    onUpdatePreset: (presetId: string, patch: PresetPatch) => void;
    onDeletePreset: (presetId: string) => void;
    onCreateFolder: (title: string, parentId: string | null) => void;
    onRenameFolder: (folderId: string, title: string) => void;
    onDeleteFolder: (folderId: string) => void;
};

/** 节点库管理模式：左侧文件夹树，右侧预设属性与参数。 */
export function PresetManagerDialog({
    open,
    focusPresetId,
    library,
    status,
    saving,
    error,
    onOpenChange,
    onUpdatePreset,
    onDeletePreset,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
}: PresetManagerDialogProps): ReactElement {
    const [selection, setSelection] = useState<Selection>(null);
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(
        () => new Set(library.folders.map((folder) => folder.id)),
    );
    const [folderDialog, setFolderDialog] = useState<{
        parentId: string | null;
        title: string;
    } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<
        | { kind: "preset"; preset: PresetRecord }
        | { kind: "folder"; folder: PresetFolder }
        | null
    >(null);
    const lastFocusRef = useRef<string | null>(null);
    const wasOpenRef = useRef(false);

    // 每次打开时展开全部文件夹，避免新文件夹默认折叠。
    useEffect(() => {
        if (open && !wasOpenRef.current) {
            setExpanded(new Set(library.folders.map((folder) => folder.id)));
        }
        wasOpenRef.current = open;
    }, [library.folders, open]);

    // 打开 / 定位到新预设；只在 focus 变化时抢占选中，编辑保存不会反复跳回。
    useEffect(() => {
        if (!open) {
            lastFocusRef.current = null;
            return;
        }
        if (focusPresetId === null) {
            lastFocusRef.current = null;
            return;
        }
        if (lastFocusRef.current === focusPresetId) return;
        const preset = library.presets.find((item) => item.id === focusPresetId);
        if (preset === undefined) return;

        lastFocusRef.current = focusPresetId;
        setSelection({ kind: "preset", id: preset.id });
        const path = folderPath(library, preset.folderId);
        setExpanded((current) => {
            const next = new Set(current);
            for (const folder of path) next.add(folder.id);
            return next;
        });
    }, [focusPresetId, library, open]);

    // 外部删除后清理无效选中。
    useEffect(() => {
        setSelection((current) => {
            if (current === null) return current;
            if (current.kind === "preset") {
                return library.presets.some((item) => item.id === current.id)
                    ? current
                    : null;
            }
            return library.folders.some((item) => item.id === current.id)
                ? current
                : null;
        });
    }, [library.folders, library.presets]);

    const selectedPreset = useMemo(() => {
        if (selection?.kind !== "preset") return null;
        return library.presets.find((item) => item.id === selection.id) ?? null;
    }, [library.presets, selection]);

    const selectedFolder = useMemo(() => {
        if (selection?.kind !== "folder") return null;
        return library.folders.find((item) => item.id === selection.id) ?? null;
    }, [library.folders, selection]);

    const filteredPresets = useMemo(
        () => (query.trim().length === 0 ? [] : searchPresets(library.presets, query)),
        [library.presets, query],
    );

    const toggleFolder = (folderId: string): void => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    };

    const submitFolder = (): void => {
        if (folderDialog === null) return;
        const title = folderDialog.title.trim();
        if (title.length === 0) return;
        onCreateFolder(title, folderDialog.parentId);
        setFolderDialog(null);
    };

    const confirmDelete = (): void => {
        if (deleteTarget === null) return;
        if (deleteTarget.kind === "preset") {
            onDeletePreset(deleteTarget.preset.id);
        } else {
            onDeleteFolder(deleteTarget.folder.id);
        }
        if (selection?.kind === deleteTarget.kind && selection.id ===
            (deleteTarget.kind === "preset" ? deleteTarget.preset.id : deleteTarget.folder.id)) {
            setSelection(null);
        }
        setDeleteTarget(null);
    };

    const renderTree = (parentId: string | null, depth: number): ReactElement[] => {
        const folders = childFolders(library, parentId);
        const presets = library.presets.filter(
            (preset) => preset.folderId === parentId,
        );
        const rows: ReactElement[] = [];

        for (const folder of folders) {
            const openFolder = expanded.has(folder.id);
            const count = countInFolder(library, folder.id);
            rows.push(
                <div
                    key={`folder-${folder.id}`}
                    className={styles.row}
                    style={{ paddingLeft: 6 + depth * 14 }}
                    data-selected={
                        selection?.kind === "folder" && selection.id === folder.id
                    }
                >
                    <button
                        type="button"
                        className={styles.chevron}
                        aria-label={openFolder ? "收起文件夹" : "展开文件夹"}
                        onClick={() => toggleFolder(folder.id)}
                    >
                        <ChevronIcon open={openFolder} />
                    </button>
                    <button
                        type="button"
                        className={styles.rowMain}
                        onClick={() =>
                            setSelection({ kind: "folder", id: folder.id })
                        }
                    >
                        <FolderIcon />
                        <span className={styles.rowTitle}>{folder.title}</span>
                        <span className={styles.rowMeta}>{count}</span>
                    </button>
                </div>,
            );
            if (openFolder) {
                rows.push(...renderTree(folder.id, depth + 1));
            }
        }

        for (const preset of presets) {
            rows.push(
                <div
                    key={`preset-${preset.id}`}
                    className={styles.row}
                    style={{ paddingLeft: 6 + depth * 14 }}
                    data-selected={
                        selection?.kind === "preset" && selection.id === preset.id
                    }
                >
                    <span className={styles.chevronSpace} aria-hidden="true" />
                    <button
                        type="button"
                        className={styles.rowMain}
                        onClick={() =>
                            setSelection({ kind: "preset", id: preset.id })
                        }
                    >
                        <BoxIcon />
                        <span className={styles.rowTitle}>{preset.name}</span>
                        <code className={styles.rowType}>{preset.type}</code>
                    </button>
                </div>,
            );
        }

        return rows;
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    title="节点库"
                    description="管理节点预设与文件夹；画布右键节点可创建预设。"
                    className={styles.manager}
                >
                    <div className={styles.layout}>
                        <aside className={styles.sidebar}>
                            <div className={styles.sidebarHeader}>
                                <Input
                                    aria-label="搜索节点预设"
                                    placeholder="搜索节点预设…"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                />
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                        setFolderDialog({
                                            parentId:
                                                selection?.kind === "folder"
                                                    ? selection.id
                                                    : null,
                                            title: "",
                                        })
                                    }
                                >
                                    新建文件夹
                                </Button>
                            </div>

                            <div className={styles.tree}>
                                {query.trim().length > 0 ? (
                                    filteredPresets.length === 0 ? (
                                        <p className={styles.empty}>没有匹配的节点预设</p>
                                    ) : (
                                        filteredPresets.map((preset) => (
                                            <div
                                                key={preset.id}
                                                className={styles.row}
                                                data-selected={
                                                    selection?.kind === "preset" &&
                                                    selection.id === preset.id
                                                }
                                            >
                                                <span
                                                    className={styles.chevronSpace}
                                                    aria-hidden="true"
                                                />
                                                <button
                                                    type="button"
                                                    className={styles.rowMain}
                                                    onClick={() =>
                                                        setSelection({
                                                            kind: "preset",
                                                            id: preset.id,
                                                        })
                                                    }
                                                >
                                                    <BoxIcon />
                                                    <span className={styles.rowTitle}>
                                                        {preset.name}
                                                    </span>
                                                    <code className={styles.rowType}>
                                                        {preset.type}
                                                    </code>
                                                </button>
                                            </div>
                                        ))
                                    )
                                ) : library.folders.length === 0 &&
                                  library.presets.length === 0 ? (
                                    <EmptyState
                                        compact
                                        title="节点库还是空的"
                                        description="在画布中右键一个节点，选择「创建预设节点」。"
                                    />
                                ) : (
                                    renderTree(null, 0)
                                )}
                            </div>

                            <div className={styles.sidebarFooter}>
                                <span>{library.presets.length} 个预设</span>
                                <span>
                                    {status === "loading"
                                        ? "加载中…"
                                        : saving
                                          ? "保存中…"
                                          : status === "error"
                                            ? "保存失败"
                                            : "已保存"}
                                </span>
                            </div>
                        </aside>

                        <section className={styles.editor}>
                            {error !== null ? (
                                <p className={styles.error}>{error}</p>
                            ) : null}

                            {selectedPreset !== null ? (
                                <PresetEditor
                                    key={selectedPreset.id}
                                    preset={selectedPreset}
                                    library={library}
                                    onSave={(patch) => {
                                        onUpdatePreset(selectedPreset.id, patch);
                                    }}
                                    onDelete={() =>
                                        setDeleteTarget({
                                            kind: "preset",
                                            preset: selectedPreset,
                                        })
                                    }
                                />
                            ) : selectedFolder !== null ? (
                                <FolderEditor
                                    key={selectedFolder.id}
                                    folder={selectedFolder}
                                    library={library}
                                    onRename={(title) =>
                                        onRenameFolder(selectedFolder.id, title)
                                    }
                                    onCreateChild={() =>
                                        setFolderDialog({
                                            parentId: selectedFolder.id,
                                            title: "",
                                        })
                                    }
                                    onDelete={() =>
                                        setDeleteTarget({
                                            kind: "folder",
                                            folder: selectedFolder,
                                        })
                                    }
                                />
                            ) : (
                                <EmptyState
                                    title="选择左侧的文件夹或节点预设"
                                    description="节点预设保存节点类型、默认参数与所在文件夹。"
                                />
                            )}
                        </section>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={folderDialog !== null}
                onOpenChange={(next) => {
                    if (!next) setFolderDialog(null);
                }}
            >
                <DialogContent
                    title="新建文件夹"
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
                                onClick={submitFolder}
                            >
                                创建
                            </Button>
                        </>
                    }
                >
                    <Field label="文件夹名称" required>
                        <Input
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
                                if (event.key === "Enter") submitFolder();
                            }}
                        />
                    </Field>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleteTarget !== null}
                onOpenChange={(next) => {
                    if (!next) setDeleteTarget(null);
                }}
            >
                <DialogContent
                    title={
                        deleteTarget?.kind === "folder"
                            ? "删除文件夹"
                            : "删除节点预设"
                    }
                    description={
                        deleteTarget?.kind === "folder"
                            ? "文件夹内的子文件夹与节点预设会移动到上一级，不会随文件夹删除。"
                            : "删除后无法从工作区恢复。"
                    }
                    footer={
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteTarget(null)}
                            >
                                取消
                            </Button>
                            <Button size="sm" variant="danger" onClick={confirmDelete}>
                                删除
                            </Button>
                        </>
                    }
                >
                    <p>
                        确定删除「
                        {deleteTarget?.kind === "folder"
                            ? deleteTarget.folder.title
                            : deleteTarget?.preset.name ?? ""}
                        」？
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
}

function PresetEditor({
    preset,
    library,
    onSave,
    onDelete,
}: {
    preset: PresetRecord;
    library: PresetLibrary;
    onSave: (patch: PresetPatch) => void;
    onDelete: () => void;
}): ReactElement {
    const [name, setName] = useState(preset.name);
    const [description, setDescription] = useState(preset.description ?? "");
    const [folderId, setFolderId] = useState(preset.folderId ?? "");
    const [config, setConfig] = useState<unknown>(preset.config);
    const entry = findNodeCatalogEntry(preset.type);
    const schema = (entry?.configSchema ?? {
        type: "object",
        format: "json",
    }) as JsonObject;

    const folderChoices = useMemo(
        () => folderOptions(library),
        [library],
    );

    return (
        <div className={styles.editorBody}>
            <header className={styles.editorHeader}>
                <div>
                    <h3 className={styles.editorTitle}>{preset.name}</h3>
                    <p className={styles.editorMeta}>
                        {entry?.title ?? "未知节点类型"} · <code>{preset.type}</code>
                        {entry === undefined ? (
                            <Badge variant="warning">类型不可用</Badge>
                        ) : null}
                    </p>
                </div>
                <div className={styles.editorActions}>
                    <Button size="sm" variant="danger" onClick={onDelete}>
                        删除
                    </Button>
                    <Button
                        size="sm"
                        variant="primary"
                        disabled={name.trim().length === 0}
                        onClick={() => {
                            onSave({
                                name,
                                description,
                                folderId: folderId.length === 0 ? null : folderId,
                                config: config as JsonValue | undefined,
                            });
                        }}
                    >
                        保存修改
                    </Button>
                </div>
            </header>

            <div className={styles.fields}>
                <Field label="名称" required>
                    <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
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
                        options={folderChoices}
                        aria-label="预设文件夹"
                        onChange={setFolderId}
                    />
                </Field>
                <Field label="节点类型">
                    <Input
                        value={preset.type}
                        readOnly
                        aria-label="节点类型"
                    />
                </Field>
            </div>

            <div className={styles.params}>
                <h4 className={styles.paramsTitle}>默认参数</h4>
                <NodeConfigForm
                    schema={schema}
                    config={config}
                    onChange={(next) => setConfig(next)}
                />
            </div>
        </div>
    );
}

function FolderEditor({
    folder,
    library,
    onRename,
    onCreateChild,
    onDelete,
}: {
    folder: PresetFolder;
    library: PresetLibrary;
    onRename: (title: string) => void;
    onCreateChild: () => void;
    onDelete: () => void;
}): ReactElement {
    const [title, setTitle] = useState(folder.title);
    const path = folderPath(library, folder.id);

    return (
        <div className={styles.editorBody}>
            <header className={styles.editorHeader}>
                <div>
                    <h3 className={styles.editorTitle}>文件夹</h3>
                    <p className={styles.editorMeta}>
                        {path.map((item) => item.title).join(" / ")}
                    </p>
                </div>
                <div className={styles.editorActions}>
                    <Button size="sm" variant="secondary" onClick={onCreateChild}>
                        新建子文件夹
                    </Button>
                    <Button size="sm" variant="danger" onClick={onDelete}>
                        删除
                    </Button>
                </div>
            </header>

            <div className={styles.fields}>
                <Field label="名称" required>
                    <Input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                    />
                </Field>
            </div>

            <div className={styles.footerActions}>
                <Button
                    size="sm"
                    variant="primary"
                    disabled={title.trim().length === 0}
                    onClick={() => onRename(title)}
                >
                    保存名称
                </Button>
            </div>
        </div>
    );
}

/** 递归统计文件夹内预设数量。 */
function countInFolder(library: PresetLibrary, folderId: string): number {
    const childIds = childFolders(library, folderId).map((folder) => folder.id);
    const direct = library.presets.filter(
        (preset) => preset.folderId === folderId,
    ).length;
    return (
        direct +
        childIds.reduce((total, id) => total + countInFolder(library, id), 0)
    );
}

function ChevronIcon({ open }: { open: boolean }): ReactElement {
    return (
        <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
            className={open ? styles.chevronOpen : undefined}
        >
            <path
                d="M4.5 2.5L8 6l-3.5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
            />
        </svg>
    );
}

function FolderIcon(): ReactElement {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M1.5 4.5V12a1 1 0 001 1h11a1 1 0 001-1V5.5a1 1 0 00-1-1H8L6.5 2.5h-4a1 1 0 00-1 1z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
            />
        </svg>
    );
}

function BoxIcon(): ReactElement {
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M8 1.8l5.5 3v6.4l-5.5 3-5.5-3V4.8l5.5-3zM2.5 4.8L8 7.8l5.5-3M8 7.8v6.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
            />
        </svg>
    );
}
