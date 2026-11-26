import { describe, expect, it } from "vitest";
import {
    addFolder,
    addPreset,
    deleteFolder,
    emptyLibrary,
    ensureFolder,
    folderOptions,
    groupPresets,
    parsePresetLibrary,
    removePreset,
    toPresetDocument,
    updatePreset,
} from "./model";

describe("preset library model", () => {
    it("parses and rejects malformed libraries", () => {
        expect(parsePresetLibrary(null)).toBeNull();
        expect(parsePresetLibrary({ schemaVersion: 2, folders: [], presets: [] })).toBeNull();
        expect(
            parsePresetLibrary({
                schemaVersion: 1,
                folders: [{ id: "f1", title: "Folder", parentId: null }],
                presets: [
                    {
                        id: "p1",
                        name: "Preset",
                        type: "core.constant",
                        typeVersion: 1,
                        folderId: "missing",
                    },
                ],
            }),
        ).toMatchObject({
            folders: [{ id: "f1", parentId: null }],
            presets: [{ id: "p1", folderId: null }],
        });
    });

    it("adds, updates and removes presets", () => {
        const base = emptyLibrary();
        const { library, preset } = addPreset(base, {
            name: " 常量 ",
            description: "固定文本",
            type: "core.constant",
            typeVersion: 1,
            config: { value: { type: "text", text: "hello" } },
        });

        expect(library.presets).toHaveLength(1);
        expect(preset.name).toBe("常量");

        const renamed = updatePreset(library, preset.id, {
            name: "常量 2",
            description: " ",
        });
        expect(renamed.presets[0]).toMatchObject({
            name: "常量 2",
            description: "",
        });

        expect(removePreset(renamed, preset.id).presets).toHaveLength(0);
    });

    it("builds folder tree, labels and moves presets between folders", () => {
        let library = emptyLibrary();
        const root = ensureFolder(library, "我的预设");
        library = root.library;
        const nested = addFolder(library, "模型", root.folderId);
        library = nested.library;

        const added = addPreset(library, {
            name: "Ollama",
            type: "core.model",
            typeVersion: 1,
            folderId: nested.folder.id,
        });
        library = added.library;

        expect(folderOptions(library).map((option) => option.label)).toEqual([
            "根目录",
            "我的预设",
            "　模型",
        ]);
        expect(groupPresets(library).map((group) => group.label)).toEqual([
            "模型",
        ]);

        const moved = updatePreset(library, added.preset.id, {
            folderId: root.folderId,
        });
        expect(moved.presets[0]?.folderId).toBe(root.folderId);
        expect(groupPresets(moved).map((group) => group.label)).toEqual([
            "我的预设",
        ]);
    });

    it("deleting a folder lifts its children to the parent", () => {
        let library = emptyLibrary();
        const parent = addFolder(library, "Parent");
        library = parent.library;
        const child = addFolder(library, "Child", parent.folder.id);
        library = child.library;
        const preset = addPreset(library, {
            name: "Child preset",
            type: "core.constant",
            typeVersion: 1,
            folderId: child.folder.id,
        });
        library = preset.library;

        const next = deleteFolder(library, parent.folder.id);
        expect(next.folders).toHaveLength(1);
        expect(next.folders[0]).toMatchObject({
            id: child.folder.id,
            parentId: null,
        });
        expect(next.presets[0]?.folderId).toBe(child.folder.id);
    });

    it("converts records into wireclaw preset documents", () => {
        const { library, preset } = addPreset(emptyLibrary(), {
            name: "Model",
            description: "绑定 ollama",
            type: "core.model",
            typeVersion: 1,
            config: { providerId: "ollama", modelId: "qwen3.5:9b" },
            tags: ["model"],
        });
        expect(library.presets).toHaveLength(1);

        expect(toPresetDocument(preset)).toEqual({
            version: 1,
            presetId: preset.id,
            name: "Model",
            description: "绑定 ollama",
            type: "core.model",
            typeVersion: 1,
            config: { providerId: "ollama", modelId: "qwen3.5:9b" },
            tags: ["model"],
        });
    });
});
