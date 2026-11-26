import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
    type ReactNode,
} from "react";
import type { DocumentRef } from "@flowharness/contracts";
import { onPresetUiEvent } from "./bus";
import { PresetLibraryContext, type PresetLibraryApi } from "./context";
import {
    PRESET_LIBRARY_ID,
    addPreset,
    createPresetId,
    deleteFolder as deleteFolderRecord,
    emptyLibrary,
    ensureFolder,
    parsePresetLibrary,
    removePreset,
    renameFolder as renameFolderRecord,
    updatePreset as updatePresetRecord,
    type NewPresetInput,
    type PresetLibrary,
    type PresetPatch,
    type PresetRecord,
} from "./model";
import { PresetManagerDialog } from "./PresetManagerDialog";

const LIBRARY_REF: DocumentRef = { kind: "presetLibrary", id: PRESET_LIBRARY_ID };

export function PresetLibraryProvider({
    workspaceId,
    children,
}: {
    workspaceId: string | null;
    children: ReactNode;
}): ReactElement {
    const bridge = window.flowharness;
    const [library, setLibrary] = useState<PresetLibrary>(emptyLibrary);
    const [status, setStatus] = useState<PresetLibraryApi["status"]>("idle");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [managerOpen, setManagerOpen] = useState(false);
    const [managerPresetId, setManagerPresetId] = useState<string | null>(null);

    const libraryRef = useRef<PresetLibrary>(library);
    const revisionRef = useRef<string | null>(null);
    const workspaceRef = useRef<string | null>(workspaceId);
    const generationRef = useRef(0);
    const saveChain = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        workspaceRef.current = workspaceId;
        revisionRef.current = null;
        const empty = emptyLibrary();
        libraryRef.current = empty;
        setLibrary(empty);
        setError(null);
        setSaving(false);

        if (workspaceId === null) {
            setStatus("idle");
            return;
        }

        const generation = ++generationRef.current;
        setStatus("loading");

        void (async () => {
            const snapshot = await bridge.readDocument(workspaceId, LIBRARY_REF);
            if (generation !== generationRef.current) return;

            if (!snapshot.ok) {
                setError(snapshot.error.message);
                setStatus("error");
                return;
            }
            if (snapshot.data === null) {
                setStatus("ready");
                return;
            }

            const parsed = parsePresetLibrary(snapshot.data.document);
            if (parsed === null) {
                setError("节点库数据格式无效");
                setStatus("error");
                return;
            }

            revisionRef.current = snapshot.data.revision;
            libraryRef.current = parsed;
            setLibrary(parsed);
            setStatus("ready");
        })();
    }, [bridge, workspaceId]);

    const enqueueSave = useCallback(
        (next: PresetLibrary, workspace: string) => {
            setSaving(true);
            const run = async (): Promise<void> => {
                if (workspaceRef.current !== workspace) return;
                const result = await bridge.saveDocument({
                    workspaceId: workspace,
                    ref: LIBRARY_REF,
                    baseRevision: revisionRef.current,
                    document: next,
                });
                if (workspaceRef.current !== workspace) return;

                if (result.ok) {
                    revisionRef.current = result.data.revision;
                    setError(null);
                    setStatus("ready");
                } else {
                    setError(result.error.message);
                    setStatus("error");
                }
                setSaving(false);
            };

            saveChain.current = saveChain.current
                .then(run)
                .catch((cause: unknown) => {
                    if (workspaceRef.current !== workspace) return;
                    setError(cause instanceof Error ? cause.message : String(cause));
                    setStatus("error");
                    setSaving(false);
                });
        },
        [bridge],
    );

    const commit = useCallback(
        (mutate: (current: PresetLibrary) => PresetLibrary): PresetLibrary => {
            const current = libraryRef.current;
            const next = mutate(current);
            if (next === current) return next;

            libraryRef.current = next;
            setLibrary(next);
            if (workspaceId !== null) enqueueSave(next, workspaceId);
            return next;
        },
        [enqueueSave, workspaceId],
    );

    const createPreset = useCallback(
        (input: NewPresetInput): PresetRecord => {
            const current = libraryRef.current;
            const { library: next, preset } = addPreset(
                current,
                { ...input, folderId: input.folderId ?? null },
                createPresetId(),
            );
            libraryRef.current = next;
            setLibrary(next);
            if (workspaceId !== null) enqueueSave(next, workspaceId);
            return preset;
        },
        [enqueueSave, workspaceId],
    );

    const updatePreset = useCallback(
        (presetId: string, patch: PresetPatch): void => {
            commit((current) => updatePresetRecord(current, presetId, patch));
        },
        [commit],
    );

    const deletePreset = useCallback(
        (presetId: string): void => {
            commit((current) => removePreset(current, presetId));
        },
        [commit],
    );

    const createFolder = useCallback(
        (title: string, parentId: string | null): void => {
            const trimmed = title.trim();
            if (trimmed.length === 0) return;
            commit((current) => ensureFolder(current, trimmed, parentId).library);
        },
        [commit],
    );

    const renameFolder = useCallback(
        (folderId: string, title: string): void => {
            const trimmed = title.trim();
            if (trimmed.length === 0) return;
            commit((current) => renameFolderRecord(current, folderId, trimmed));
        },
        [commit],
    );

    const deleteFolder = useCallback(
        (folderId: string): void => {
            commit((current) => deleteFolderRecord(current, folderId));
        },
        [commit],
    );

    const openManager = useCallback((presetId?: string): void => {
        setManagerPresetId(presetId ?? null);
        setManagerOpen(true);
    }, []);

    useEffect(
        () =>
            onPresetUiEvent((event) => {
                if (event.type === "open-insert") {
                    // 插入菜单与模态管理不同时出现。
                    setManagerOpen(false);
                    setManagerPresetId(null);
                    return;
                }
                setManagerPresetId(event.presetId ?? null);
                setManagerOpen(true);
            }),
        [],
    );

    const value = useMemo<PresetLibraryApi>(
        () => ({
            library,
            status,
            saving,
            error,
            createPreset,
            updatePreset,
            deletePreset,
            createFolder,
            renameFolder,
            deleteFolder,
            openManager,
            managerOpen,
        }),
        [
            createFolder,
            createPreset,
            deleteFolder,
            deletePreset,
            error,
            library,
            managerOpen,
            openManager,
            renameFolder,
            saving,
            status,
            updatePreset,
        ],
    );

    return (
        <PresetLibraryContext.Provider value={value}>
            {children}
            <PresetManagerDialog
                open={managerOpen}
                focusPresetId={managerPresetId}
                library={library}
                status={status}
                saving={saving}
                error={error}
                onOpenChange={(open) => {
                    setManagerOpen(open);
                    if (!open) setManagerPresetId(null);
                }}
                onUpdatePreset={updatePreset}
                onDeletePreset={deletePreset}
                onCreateFolder={createFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={deleteFolder}
            />
        </PresetLibraryContext.Provider>
    );
}
