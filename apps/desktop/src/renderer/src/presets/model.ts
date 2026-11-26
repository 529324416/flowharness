import type { JsonValue, NodePresetDocument } from "wireclaw";

/** 工作区级节点预设库：文件夹 + 预设记录（纯 JSON，存 documents/presets/library.json）。 */
export const PRESET_LIBRARY_SCHEMA_VERSION = 1;
export const PRESET_LIBRARY_ID = "library";

export type PresetFolder = {
    /** `npf_` + 随机十六进制；只作稳定 id，标题单独存。 */
    id: string;
    title: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
};

export type PresetRecord = {
    /** 与 wireclaw `NodePresetDocument.presetId` 相同。 */
    id: string;
    name: string;
    description?: string;
    type: string;
    typeVersion: number;
    /** 捕获的节点 config（JSON-safe）。 */
    config?: unknown;
    tags?: readonly string[];
    folderId: string | null;
    createdAt: string;
    updatedAt: string;
};

export type PresetLibrary = {
    schemaVersion: number;
    folders: PresetFolder[];
    presets: PresetRecord[];
};

export type PresetFolderOption = { value: string; label: string };

export function emptyLibrary(): PresetLibrary {
    return {
        schemaVersion: PRESET_LIBRARY_SCHEMA_VERSION,
        folders: [],
        presets: [],
    };
}

export function createFolderId(): string {
    return `npf_${crypto.randomUUID().slice(0, 8)}`;
}

export function createPresetId(): string {
    return `preset_${crypto.randomUUID().slice(0, 8)}`;
}

/** 宽容解析：坏数据返回 null，条目字段不合法时丢弃该条目。 */
export function parsePresetLibrary(value: unknown): PresetLibrary | null {
    if (!isRecord(value)) return null;
    if (value.schemaVersion !== PRESET_LIBRARY_SCHEMA_VERSION) return null;
    if (!Array.isArray(value.folders) || !Array.isArray(value.presets)) return null;

    const folders: PresetFolder[] = [];
    for (const item of value.folders) {
        if (!isRecord(item)) continue;
        if (
            typeof item.id !== "string" ||
            item.id.length === 0 ||
            typeof item.title !== "string" ||
            item.title.length === 0
        ) {
            continue;
        }
        const parentId =
            item.parentId === null || typeof item.parentId === "string"
                ? item.parentId
                : null;
        folders.push({
            id: item.id,
            title: item.title,
            parentId,
            createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
            updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        });
    }

    const folderIds = new Set(folders.map((folder) => folder.id));
    const presets: PresetRecord[] = [];
    for (const item of value.presets) {
        if (!isRecord(item)) continue;
        if (
            typeof item.id !== "string" ||
            item.id.length === 0 ||
            typeof item.name !== "string" ||
            item.name.length === 0 ||
            typeof item.type !== "string" ||
            item.type.length === 0 ||
            typeof item.typeVersion !== "number" ||
            !Number.isInteger(item.typeVersion) ||
            item.typeVersion < 1
        ) {
            continue;
        }
        const folderId =
            item.folderId === null || typeof item.folderId === "string"
                ? item.folderId
                : null;
        presets.push({
            id: item.id,
            name: item.name,
            ...(typeof item.description === "string"
                ? { description: item.description }
                : {}),
            type: item.type,
            typeVersion: item.typeVersion,
            ...(item.config === undefined ? {} : { config: item.config }),
            ...(Array.isArray(item.tags)
                ? {
                      tags: item.tags.filter(
                          (tag): tag is string => typeof tag === "string",
                      ),
                  }
                : {}),
            folderId:
                folderId !== null && folderIds.has(folderId) ? folderId : null,
            createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
            updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        });
    }

    // 父文件夹不存在时提升为根，避免树断链。
    for (const folder of folders) {
        if (folder.parentId !== null && !folderIds.has(folder.parentId)) {
            folder.parentId = null;
        }
    }

    return {
        schemaVersion: PRESET_LIBRARY_SCHEMA_VERSION,
        folders,
        presets,
    };
}

/** 转为 wireclaw 的节点库条目；实例化时由 `applyPresetParameters` 读取 config。 */
export function toPresetDocument(record: PresetRecord): NodePresetDocument {
    return {
        version: 1,
        presetId: record.id,
        name: record.name,
        type: record.type,
        typeVersion: record.typeVersion,
        ...(record.description === undefined
            ? {}
            : { description: record.description }),
        ...(record.config === undefined
            ? {}
            : { config: record.config as JsonValue }),
        ...(record.tags === undefined ? {} : { tags: [...record.tags] }),
    };
}

/** 找到同父级下的同名文件夹，没有则创建。 */
export function ensureFolder(
    library: PresetLibrary,
    title: string,
    parentId: string | null = null,
): { library: PresetLibrary; folderId: string } {
    const existing = library.folders.find(
        (folder) => folder.parentId === parentId && folder.title === title,
    );
    if (existing !== undefined) {
        return { library, folderId: existing.id };
    }

    const now = new Date().toISOString();
    const folder: PresetFolder = {
        id: createFolderId(),
        title,
        parentId,
        createdAt: now,
        updatedAt: now,
    };
    return {
        library: { ...library, folders: [...library.folders, folder] },
        folderId: folder.id,
    };
}

export type NewPresetInput = {
    name: string;
    description?: string;
    type: string;
    typeVersion: number;
    config?: unknown;
    folderId?: string | null;
    tags?: readonly string[];
};

export function addPreset(
    library: PresetLibrary,
    input: NewPresetInput,
    id: string = createPresetId(),
): { library: PresetLibrary; preset: PresetRecord } {
    const now = new Date().toISOString();
    const preset: PresetRecord = {
        id,
        name: input.name.trim(),
        type: input.type,
        typeVersion: input.typeVersion,
        folderId: input.folderId ?? null,
        createdAt: now,
        updatedAt: now,
        ...(input.description === undefined || input.description.trim().length === 0
            ? {}
            : { description: input.description.trim() }),
        ...(input.config === undefined ? {} : { config: input.config }),
        ...(input.tags === undefined ? {} : { tags: [...input.tags] }),
    };
    return {
        library: { ...library, presets: [...library.presets, preset] },
        preset,
    };
}

export type PresetPatch = {
    name?: string;
    description?: string;
    config?: unknown;
    folderId?: string | null;
    tags?: readonly string[];
};

export function updatePreset(
    library: PresetLibrary,
    presetId: string,
    patch: PresetPatch,
): PresetLibrary {
    const now = new Date().toISOString();
    let changed = false;
    const presets = library.presets.map((preset) => {
        if (preset.id !== presetId) return preset;
        changed = true;
        return {
            ...preset,
            ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
            ...(patch.description === undefined
                ? {}
                : { description: patch.description.trim() }),
            ...(patch.config === undefined ? {} : { config: patch.config }),
            ...(patch.folderId === undefined ? {} : { folderId: patch.folderId }),
            ...(patch.tags === undefined ? {} : { tags: [...patch.tags] }),
            updatedAt: now,
        } satisfies PresetRecord;
    });
    return changed ? { ...library, presets } : library;
}

export function removePreset(
    library: PresetLibrary,
    presetId: string,
): PresetLibrary {
    const presets = library.presets.filter((preset) => preset.id !== presetId);
    return presets.length === library.presets.length
        ? library
        : { ...library, presets };
}

export function movePreset(
    library: PresetLibrary,
    presetId: string,
    folderId: string | null,
): PresetLibrary {
    return updatePreset(library, presetId, { folderId });
}

export function addFolder(
    library: PresetLibrary,
    title: string,
    parentId: string | null = null,
    id: string = createFolderId(),
): { library: PresetLibrary; folder: PresetFolder } {
    const now = new Date().toISOString();
    const folder: PresetFolder = {
        id,
        title: title.trim(),
        parentId,
        createdAt: now,
        updatedAt: now,
    };
    return {
        library: { ...library, folders: [...library.folders, folder] },
        folder,
    };
}

export function renameFolder(
    library: PresetLibrary,
    folderId: string,
    title: string,
): PresetLibrary {
    const now = new Date().toISOString();
    return {
        ...library,
        folders: library.folders.map((folder) =>
            folder.id === folderId
                ? { ...folder, title: title.trim(), updatedAt: now }
                : folder,
        ),
    };
}

/** 删除文件夹：子文件夹与预设上移到父级，避免静默丢数据。 */
export function deleteFolder(
    library: PresetLibrary,
    folderId: string,
): PresetLibrary {
    const target = library.folders.find((folder) => folder.id === folderId);
    if (target === undefined) return library;
    const parentId = target.parentId;
    const now = new Date().toISOString();

    return {
        ...library,
        folders: library.folders
            .filter((folder) => folder.id !== folderId)
            .map((folder) =>
                folder.parentId === folderId
                    ? { ...folder, parentId, updatedAt: now }
                    : folder,
            ),
        presets: library.presets.map((preset) =>
            preset.folderId === folderId
                ? { ...preset, folderId: parentId, updatedAt: now }
                : preset,
        ),
    };
}

export function childFolders(
    library: PresetLibrary,
    parentId: string | null,
): PresetFolder[] {
    return library.folders.filter((folder) => folder.parentId === parentId);
}

export function folderPath(
    library: PresetLibrary,
    folderId: string | null,
): PresetFolder[] {
    if (folderId === null) return [];
    const byId = new Map(library.folders.map((folder) => [folder.id, folder]));
    const path: PresetFolder[] = [];
    let cursor = byId.get(folderId);
    const seen = new Set<string>();
    while (cursor !== undefined && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        path.unshift(cursor);
        cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    return path;
}

export function folderLabel(
    library: PresetLibrary,
    folderId: string | null,
    separator = " / ",
): string {
    if (folderId === null) return "根目录";
    const path = folderPath(library, folderId);
    return path.length === 0
        ? "根目录"
        : path.map((folder) => folder.title).join(separator);
}

/** 文件夹下拉选项（含根目录），按树顺序输出。 */
export function folderOptions(
    library: PresetLibrary,
    excludeId?: string,
): PresetFolderOption[] {
    const options: PresetFolderOption[] = [{ value: "", label: "根目录" }];
    const walk = (parentId: string | null, depth: number): void => {
        for (const folder of childFolders(library, parentId)) {
            if (folder.id === excludeId) continue;
            options.push({
                value: folder.id,
                label: `${"　".repeat(depth)}${folder.title}`,
            });
            walk(folder.id, depth + 1);
        }
    };
    walk(null, 0);
    return options;
}

/** 预设分组：按文件夹深度优先输出，只有一个分组时也可直接展示。 */
export type PresetGroup = {
    folderId: string | null;
    label: string;
    depth: number;
    presets: PresetRecord[];
};

export function groupPresets(library: PresetLibrary): PresetGroup[] {
    const groups: PresetGroup[] = [];
    const root = library.presets.filter((preset) => preset.folderId === null);
    if (root.length > 0) {
        groups.push({ folderId: null, label: "未分组", depth: 0, presets: root });
    }

    const walk = (parentId: string | null, depth: number): void => {
        for (const folder of childFolders(library, parentId)) {
            const presets = library.presets.filter(
                (preset) => preset.folderId === folder.id,
            );
            if (presets.length > 0) {
                groups.push({
                    folderId: folder.id,
                    label: folder.title,
                    depth,
                    presets,
                });
            }
            walk(folder.id, depth + 1);
        }
    };
    walk(null, 0);
    return groups;
}

/** 搜索预设（名称 / 描述 / 类型 / 标签）。 */
export function searchPresets(
    presets: readonly PresetRecord[],
    query: string,
): PresetRecord[] {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return [...presets];
    return presets.filter((preset) =>
        [preset.name, preset.description ?? "", preset.type, ...(preset.tags ?? [])]
            .join(" ")
            .toLowerCase()
            .includes(needle),
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
