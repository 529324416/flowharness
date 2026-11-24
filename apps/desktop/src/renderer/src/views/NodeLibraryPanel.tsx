import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { NodeCatalogEntry, NodePresetDocument } from "wireclaw";
import {
    groupNodeCatalog,
    searchNodeCatalog,
} from "../designer/core/catalog";
import type { RecentNodeEntry } from "../designer/state/recent-nodes";
import { EmptyState, Input } from "../ui";
import { Plus, X } from "lucide-react";
import styles from "./NodeLibraryPanel.module.css";

export const NODE_LIBRARY_WIDTH = 328;
/** 面板最大高度；超出后列表内部滚动。 */
export const NODE_LIBRARY_MAX_HEIGHT = 380;

export type NodeLibraryPanelProps = {
    entries: readonly NodeCatalogEntry[];
    presets: readonly NodePresetDocument[];
    recent: readonly RecentNodeEntry[];
    /** 相对画布的锚点（来自右键位置）；缺省贴左上。 */
    anchor?: { x: number; y: number };
    disabled: boolean;
    onAdd: (type: string) => void;
    onAddPreset: (presetId: string) => void;
    onClose: () => void;
};

/**
 * 节点库：分类 + 搜索 + 类型默认 config。
 *
 * 作为画布内的浮层（而不是独立 Panel），节点添加后立即关闭，保持「选完就放」的节奏。
 */
export function NodeLibraryPanel({
    entries,
    presets,
    recent,
    anchor,
    disabled,
    onAdd,
    onAddPreset,
    onClose,
}: NodeLibraryPanelProps): ReactElement {
    const [query, setQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const filtered = useMemo(
        () => searchNodeCatalog(query, entries),
        [entries, query],
    );
    const groups = useMemo(() => groupNodeCatalog(filtered), [filtered]);
    const filteredPresets = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (needle.length === 0) return presets;
        return presets.filter((preset) =>
            [
                preset.name,
                preset.description ?? "",
                preset.type,
                ...(preset.tags ?? []),
            ]
                .join(" ")
                .toLowerCase()
                .includes(needle),
        );
    }, [presets, query]);

    /** 搜索时隐藏「最近使用」，避免与结果重复。 */
    const recentItems = useMemo(() => {
        if (query.trim().length > 0) return [];

        const items: Array<
            | { kind: "type"; entry: NodeCatalogEntry }
            | { kind: "preset"; preset: NodePresetDocument }
        > = [];

        for (const recentEntry of recent) {
            if (recentEntry.kind === "type") {
                const entry = entries.find((item) => item.type === recentEntry.id);
                if (entry !== undefined) items.push({ kind: "type", entry });
            } else {
                const preset = presets.find(
                    (item) => item.presetId === recentEntry.id,
                );
                if (preset !== undefined) items.push({ kind: "preset", preset });
            }
        }

        return items;
    }, [entries, presets, query, recent]);

    return (
        <div className={styles.wrap}>
            <button
                type="button"
                className={styles.backdrop}
                aria-label="关闭节点库"
                onClick={onClose}
            />
            <section
                className={styles.panel}
                style={{
                    left: anchor?.x,
                    top: anchor?.y,
                    maxHeight: `min(${String(NODE_LIBRARY_MAX_HEIGHT)}px, calc(100% - 24px))`,
                }}
                role="dialog"
                aria-label="节点库"
            >
                <header className={styles.header}>
                    <span className={styles.title}>节点库</span>
                    <button
                        type="button"
                        className={styles.close}
                        aria-label="关闭节点库"
                        onClick={onClose}
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
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
                    {groups.length === 0 && filteredPresets.length === 0 ? (
                        <EmptyState
                            compact
                            title="没有匹配的节点"
                            description="换个关键词试试"
                        />
                    ) : (
                        <>
                            {recentItems.length > 0 ? (
                                <section className={styles.group}>
                                    <h4 className={styles.groupTitle}>最近使用</h4>
                                    {recentItems.map((item) =>
                                        item.kind === "type" ? (
                                            <NodeTypeItem
                                                key={`recent-type-${item.entry.type}`}
                                                entry={item.entry}
                                                disabled={disabled}
                                                onAdd={onAdd}
                                                onClose={onClose}
                                            />
                                        ) : (
                                            <PresetItem
                                                key={`recent-preset-${item.preset.presetId}`}
                                                preset={item.preset}
                                                disabled={disabled}
                                                onAddPreset={onAddPreset}
                                                onClose={onClose}
                                            />
                                        ),
                                    )}
                                </section>
                            ) : null}
                            {filteredPresets.length > 0 ? (
                                <section className={styles.group}>
                                    <h4 className={styles.groupTitle}>预设</h4>
                                    {filteredPresets.map((preset) => (
                                        <PresetItem
                                            key={preset.presetId}
                                            preset={preset}
                                            disabled={disabled}
                                            onAddPreset={onAddPreset}
                                            onClose={onClose}
                                        />
                                    ))}
                                </section>
                            ) : null}
                            {groups.map((group) => (
                                <section key={group.id} className={styles.group}>
                                    <h4 className={styles.groupTitle}>{group.label}</h4>
                                    {group.entries.map((entry) => (
                                        <NodeTypeItem
                                            key={entry.type}
                                            entry={entry}
                                            disabled={disabled}
                                            onAdd={onAdd}
                                            onClose={onClose}
                                        />
                                    ))}
                                </section>
                            ))}
                        </>
                    )}
                </div>

                <footer className={styles.footer}>
                    <Plus size={13} aria-hidden="true" />
                    <span>新节点会写入类型默认参数</span>
                </footer>
            </section>
        </div>
    );
}

function NodeTypeItem({
    entry,
    disabled,
    onAdd,
    onClose,
}: {
    entry: NodeCatalogEntry;
    disabled: boolean;
    onAdd: (type: string) => void;
    onClose: () => void;
}): ReactElement {
    const unavailable = entry.error !== undefined;

    return (
        <button
            type="button"
            className={styles.item}
            disabled={disabled || unavailable}
            title={entry.error ?? entry.description ?? entry.type}
            onClick={() => {
                onAdd(entry.type);
                onClose();
            }}
        >
            <span className={styles.itemTitle}>{entry.title ?? entry.type}</span>
            <code className={styles.itemType}>{entry.type}</code>
            {entry.error !== undefined ? (
                <span className={styles.itemError}>{entry.error}</span>
            ) : null}
        </button>
    );
}

function PresetItem({
    preset,
    disabled,
    onAddPreset,
    onClose,
}: {
    preset: NodePresetDocument;
    disabled: boolean;
    onAddPreset: (presetId: string) => void;
    onClose: () => void;
}): ReactElement {
    return (
        <button
            type="button"
            className={styles.item}
            disabled={disabled}
            title={preset.description ?? preset.presetId}
            onClick={() => {
                onAddPreset(preset.presetId);
                onClose();
            }}
        >
            <span className={styles.itemTitle}>{preset.name}</span>
            <code className={styles.itemType}>{preset.type}</code>
        </button>
    );
}
