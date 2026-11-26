import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactElement,
} from "react";
import type { NodeCatalogEntry, NodePresetDocument } from "wireclaw";
import { Plus, Settings2, X } from "lucide-react";
import {
    groupNodeCatalog,
    NODE_CATALOG,
    searchNodeCatalog,
} from "../designer/core/catalog";
import { BUILTIN_PRESETS } from "../designer/core/presets";
import type { RecentNodeEntry } from "../designer/state/recent-nodes";
import { EmptyState, Input, Tooltip } from "../ui";
import { cx } from "../ui/cx";
import { usePresetLibrary } from "./context";
import { writeNodeDragPayload, type NodeDragPayload } from "./drag";
import {
    folderLabel,
    groupPresets,
    searchPresets,
    toPresetDocument,
} from "./model";
import styles from "./NodeLibraryPalette.module.css";

export const NODE_LIBRARY_WIDTH = 336;
/** 面板最大高度；超出后列表内部滚动。 */
export const NODE_LIBRARY_MAX_HEIGHT = 420;

type PaletteItem = {
    key: string;
    kind: "type" | "preset";
    title: string;
    subtitle: string;
    disabled?: boolean;
    payload: NodeDragPayload;
    insert: () => void;
};

type PaletteGroup = {
    id: string;
    label: string;
    items: PaletteItem[];
};

export type NodeLibraryPaletteProps = {
    recent: readonly RecentNodeEntry[];
    /** 相对画布的锚点（来自右键位置）；缺省居中。 */
    anchor?: { x: number; y: number };
    disabled: boolean;
    onAddType: (type: string) => void;
    onAddPreset: (preset: NodePresetDocument) => void;
    onClose: () => void;
};

/**
 * 节点库插入菜单。
 *
 * 列表由「最近使用 / 节点库（工作区文件夹）/ 内置预设 / 节点类型」组成；
 * ↑↓ + Enter 选择，条目可拖拽到画布。
 */
export function NodeLibraryPalette({
    recent,
    anchor,
    disabled,
    onAddType,
    onAddPreset,
    onClose,
}: NodeLibraryPaletteProps): ReactElement {
    const { library, openManager } = usePresetLibrary();
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const panelRef = useRef<HTMLElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    useEffect(() => {
        const onPointerDown = (event: PointerEvent): void => {
            if (panelRef.current?.contains(event.target as Node)) return;
            // 插入菜单不是模态：点击外部只关闭菜单，不把这次点击传给画布。
            event.preventDefault();
            event.stopPropagation();
            onClose();
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () =>
            document.removeEventListener("pointerdown", onPointerDown, true);
    }, [onClose]);

    const groups = useMemo<PaletteGroup[]>(() => {
        const needle = query.trim();
        const result: PaletteGroup[] = [];

        const makePresetItem = (
            id: string,
            name: string,
            type: string,
            description: string | undefined,
            doc: NodePresetDocument,
        ): PaletteItem => ({
            key: `preset:${id}`,
            kind: "preset",
            title: name,
            subtitle:
                description !== undefined && description.length > 0
                    ? description
                    : type,
            payload: { kind: "preset", presetId: id },
            insert: () => onAddPreset(doc),
        });

        // 最近使用（搜索时隐藏，避免与结果重复）。
        if (needle.length === 0 && recent.length > 0) {
            const items: PaletteItem[] = [];
            for (const entry of recent) {
                if (entry.kind === "type") {
                    const typeEntry = NODE_CATALOG.find(
                        (item) => item.type === entry.id,
                    );
                    if (typeEntry === undefined) continue;
                    items.push(typeItem(typeEntry, onAddType));
                } else {
                    const builtin = BUILTIN_PRESETS.find(
                        (preset) => preset.presetId === entry.id,
                    );
                    if (builtin !== undefined) {
                        items.push(
                            makePresetItem(
                                builtin.presetId,
                                builtin.name,
                                builtin.type,
                                builtin.description,
                                builtin,
                            ),
                        );
                        continue;
                    }
                    const user = library.presets.find(
                        (preset) => preset.id === entry.id,
                    );
                    if (user !== undefined) {
                        items.push(
                            makePresetItem(
                                user.id,
                                user.name,
                                user.type,
                                user.description,
                                toPresetDocument(user),
                            ),
                        );
                    }
                }
            }
            if (items.length > 0) {
                result.push({ id: "recent", label: "最近使用", items });
            }
        }

        // 工作区节点库：按文件夹分组。
        const libraryGroups = groupPresets(library);
        for (const group of libraryGroups) {
            const filtered = searchPresets(group.presets, needle);
            if (filtered.length === 0) continue;
            result.push({
                id: `folder:${group.folderId ?? "root"}`,
                label: folderLabel(library, group.folderId),
                items: filtered.map((preset) =>
                    makePresetItem(
                        preset.id,
                        preset.name,
                        preset.type,
                        preset.description,
                        toPresetDocument(preset),
                    ),
                ),
            });
        }

        // 内置预设。
        const filteredBuiltins = needle.length === 0
            ? BUILTIN_PRESETS
            : BUILTIN_PRESETS.filter((preset) =>
                  [preset.name, preset.description ?? "", preset.type, ...(preset.tags ?? [])]
                      .join(" ")
                      .toLowerCase()
                      .includes(needle.toLowerCase()),
              );
        if (filteredBuiltins.length > 0) {
            result.push({
                id: "builtin",
                label: "内置预设",
                items: filteredBuiltins.map((preset) =>
                    makePresetItem(
                        preset.presetId,
                        preset.name,
                        preset.type,
                        preset.description,
                        preset,
                    ),
                ),
            });
        }

        // 节点类型。
        const types = searchNodeCatalog(needle, NODE_CATALOG);
        for (const group of groupNodeCatalog(types)) {
            result.push({
                id: `type:${group.id}`,
                label: group.label,
                items: group.entries.map((entry) => typeItem(entry, onAddType)),
            });
        }

        return result;
    }, [library, onAddPreset, onAddType, query, recent]);

    const flatItems = useMemo(
        () => groups.flatMap((group) => group.items),
        [groups],
    );

    useEffect(() => {
        setActiveIndex(0);
    }, [query, library.presets.length]);

    useEffect(() => {
        const item = panelRef.current?.querySelector(
            `[data-palette-index="${String(activeIndex)}"]`,
        );
        item?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, groups]);

    const insertItem = (item: PaletteItem | undefined): void => {
        if (item === undefined || item.disabled === true || disabled) return;
        item.insert();
        onClose();
    };

    const onKeyDown = (event: ReactKeyboardEvent): void => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) =>
                flatItems.length === 0
                    ? 0
                    : Math.min(flatItems.length - 1, current + 1),
            );
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(0, current - 1));
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            insertItem(flatItems[activeIndex]);
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        }
    };

    const style: CSSProperties =
        anchor === undefined
            ? { left: "50%", top: 16, transform: "translateX(-50%)" }
            : { left: anchor.x, top: anchor.y };

    let index = -1;

    return (
        <section
            ref={panelRef}
            className={styles.panel}
            style={style}
            role="dialog"
            aria-label="节点库"
            onKeyDown={onKeyDown}
        >
            <header className={styles.header}>
                <span className={styles.title}>节点库</span>
                <div className={styles.headerActions}>
                    <Tooltip label="管理节点库">
                        <button
                            type="button"
                            className={styles.iconButton}
                            aria-label="管理节点库"
                            onClick={() => {
                                onClose();
                                openManager();
                            }}
                        >
                            <Settings2 size={15} aria-hidden="true" />
                        </button>
                    </Tooltip>
                    <button
                        type="button"
                        className={styles.iconButton}
                        aria-label="关闭节点库"
                        onClick={onClose}
                    >
                        <X size={15} aria-hidden="true" />
                    </button>
                </div>
            </header>

            <div className={styles.search}>
                <Input
                    ref={searchRef}
                    value={query}
                    placeholder="搜索名称、类型或关键词"
                    aria-label="搜索节点"
                    onChange={(event) => setQuery(event.target.value)}
                />
            </div>

            <div className={styles.list}>
                {flatItems.length === 0 ? (
                    <EmptyState
                        compact
                        title="没有匹配的节点"
                        description="换个关键词，或在画布右键节点创建预设。"
                    />
                ) : (
                    groups.map((group) => (
                        <section key={group.id} className={styles.group}>
                            <h4 className={styles.groupTitle}>{group.label}</h4>
                            {group.items.map((item) => {
                                index += 1;
                                const itemIndex = index;
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        data-palette-index={itemIndex}
                                        className={cx(
                                            styles.item,
                                            itemIndex === activeIndex &&
                                                styles.itemActive,
                                        )}
                                        disabled={disabled || item.disabled === true}
                                        title={item.subtitle}
                                        draggable={!disabled && item.disabled !== true}
                                        onMouseEnter={() => setActiveIndex(itemIndex)}
                                        onClick={() => insertItem(item)}
                                        onDragStart={(event) =>
                                            writeNodeDragPayload(
                                                event.dataTransfer,
                                                item.payload,
                                            )
                                        }
                                    >
                                        <span className={styles.itemTitle}>
                                            {item.title}
                                        </span>
                                        <code className={styles.itemType}>
                                            {item.subtitle}
                                        </code>
                                    </button>
                                );
                            })}
                        </section>
                    ))
                )}
            </div>

            <footer className={styles.footer}>
                <span className={styles.hint}>
                    <Plus size={13} aria-hidden="true" />
                    ↑↓ 选择 · Enter 插入 · 可拖拽到画布
                </span>
                <button
                    type="button"
                    className={styles.manage}
                    onClick={() => {
                        onClose();
                        openManager();
                    }}
                >
                    管理
                </button>
            </footer>
        </section>
    );
}

function typeItem(
    entry: NodeCatalogEntry,
    onAddType: (type: string) => void,
): PaletteItem {
    return {
        key: `type:${entry.type}`,
        kind: "type",
        title: entry.title ?? entry.type,
        subtitle: entry.type,
        disabled: entry.error !== undefined,
        payload: { kind: "type", type: entry.type },
        insert: () => onAddType(entry.type),
    };
}
