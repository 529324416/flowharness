import { createContext, useContext } from "react";
import type {
    NewPresetInput,
    PresetLibrary,
    PresetPatch,
    PresetRecord,
} from "./model";

export type PresetLibraryStatus = "idle" | "loading" | "ready" | "error";

export type PresetLibraryApi = {
    library: PresetLibrary;
    status: PresetLibraryStatus;
    saving: boolean;
    error: string | null;
    createPreset: (input: NewPresetInput) => PresetRecord;
    updatePreset: (presetId: string, patch: PresetPatch) => void;
    deletePreset: (presetId: string) => void;
    createFolder: (title: string, parentId: string | null) => void;
    renameFolder: (folderId: string, title: string) => void;
    deleteFolder: (folderId: string) => void;
    /** 打开管理模式；可选定位到某个预设。 */
    openManager: (presetId?: string) => void;
    /** 管理模式是否已打开（插入菜单据此让位）。 */
    managerOpen: boolean;
};

export const PresetLibraryContext = createContext<PresetLibraryApi | null>(null);

export function usePresetLibrary(): PresetLibraryApi {
    const value = useContext(PresetLibraryContext);
    if (value === null) {
        throw new Error("usePresetLibrary must be used inside PresetLibraryProvider");
    }
    return value;
}
