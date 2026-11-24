import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentRef } from "@flowharness/contracts";
import { applyPresetParameters, type GraphDocument } from "wireclaw";
import type { CanvasCommand } from "../../canvas/core/types";
import {
    addNode,
    applyCanvasCommand,
    createNodeId,
    nextNodePosition,
    updateNodeConfig as updateNodeConfigCommand,
} from "../core/commands";
import {
    defaultConfigOf,
    findNodeCatalogEntry,
    NODE_PRESETS,
} from "../core/catalog";
import {
    createGraphTemplate,
    parseGraphDocument,
} from "../core/document";
import {
    SaveCoordinator,
    type SaveFunction,
    type SaveState,
} from "./SaveCoordinator";

export type DesignerDocumentStatus = "idle" | "loading" | "ready" | "error";

export type DesignerDocumentState = {
    status: DesignerDocumentStatus;
    document: GraphDocument | null;
    revision: string | null;
    error: string | null;
};

/** 外壳（文档菜单 / 关闭窗口）需要的文档操作。 */
export type DesignerDocumentActions = {
    /** 等最后一次自动保存落盘；返回最终保存状态。 */
    flush: () => Promise<SaveState>;
    /** 丢弃内存状态，重新读取当前文档。 */
    reload: () => void;
};

export type CommitOptions = {
    /** 同一 key 的连续编辑在 800ms 内合并为一条撤销记录。 */
    historyKey?: string;
    /** false 时不进入撤销栈（如外部重载）。 */
    history?: boolean;
};

export type UseDesignerDocumentResult = DesignerDocumentState & {
    saveState: SaveState;
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    reload: () => void;
    applyCommand: (command: CanvasCommand) => void;
    addNode: (type: string) => void;
    addNodeFromPreset: (presetId: string) => void;
    updateNodeConfig: (nodeId: string, config: unknown) => void;
    replaceDocument: (next: GraphDocument, options?: CommitOptions) => void;
    flush: () => Promise<SaveState>;
};

const IDLE_STATE: DesignerDocumentState = {
    status: "idle",
    document: null,
    revision: null,
    error: null,
};

const LOADING_STATE: DesignerDocumentState = {
    status: "loading",
    document: null,
    revision: null,
    error: null,
};

const SAVED_STATE: SaveState = { status: "saved", error: null };
const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;

type Bridge = (typeof window)["flowharness"];

function documentRefOf(documentId: string): DocumentRef {
    return { kind: "harness", id: documentId };
}

/**
 * 读取工作区内指定 Harness 文档；不存在时创建模板。
 *
 * M4：每工作区可有多份图；文档切换由外壳传入 documentId。
 * 编辑进入撤销栈（move / connect / add / config），400ms 自动保存。
 */
export function useDesignerDocument(
    workspaceId: string | null,
    documentId: string | null,
): UseDesignerDocumentResult {
    const [state, setState] = useState<DesignerDocumentState>(IDLE_STATE);
    const [saveState, setSaveState] = useState<SaveState>(SAVED_STATE);
    const [historyState, setHistoryState] = useState({
        canUndo: false,
        canRedo: false,
    });
    const [reloadToken, setReloadToken] = useState(0);

    const documentRef = useRef<GraphDocument | null>(null);
    const coordinatorRef = useRef<SaveCoordinator | null>(null);
    const pastRef = useRef<GraphDocument[]>([]);
    const futureRef = useRef<GraphDocument[]>([]);
    const lastMutationRef = useRef<{ key: string; at: number } | null>(null);

    const syncHistory = useCallback(() => {
        setHistoryState({
            canUndo: pastRef.current.length > 0,
            canRedo: futureRef.current.length > 0,
        });
    }, []);

    const resetHistory = useCallback(() => {
        pastRef.current = [];
        futureRef.current = [];
        lastMutationRef.current = null;
        syncHistory();
    }, [syncHistory]);

    const reload = useCallback(() => {
        setReloadToken((token) => token + 1);
    }, []);

    useEffect(() => {
        if (workspaceId === null || documentId === null) {
            coordinatorRef.current?.dispose();
            coordinatorRef.current = null;
            documentRef.current = null;
            resetHistory();
            setState(IDLE_STATE);
            setSaveState(SAVED_STATE);
            return;
        }

        let cancelled = false;
        coordinatorRef.current?.dispose();
        coordinatorRef.current = null;
        documentRef.current = null;
        resetHistory();
        setState(LOADING_STATE);
        setSaveState(SAVED_STATE);

        const ref = documentRefOf(documentId);

        void (async () => {
            try {
                const loaded = await readOrCreate(window.flowharness, workspaceId, ref);
                if (cancelled) return;

                const save: SaveFunction = async (document, baseRevision) => {
                    const result = await window.flowharness.saveDocument({
                        workspaceId,
                        ref,
                        baseRevision,
                        document,
                    });

                    return result.ok
                        ? { ok: true, revision: result.data.revision }
                        : {
                              ok: false,
                              code: result.error.code,
                              message: result.error.message,
                          };
                };

                let coordinator: SaveCoordinator;
                const onSaveState = (next: SaveState): void => {
                    // 旧文档的 flush 可能在新文档加载后才完成，忽略过期回调。
                    if (coordinatorRef.current === coordinator) {
                        setSaveState(next);
                    }
                };
                coordinator = new SaveCoordinator(
                    loaded.document,
                    loaded.revision,
                    save,
                    onSaveState,
                );

                coordinatorRef.current = coordinator;
                documentRef.current = loaded.document;
                setState({
                    status: "ready",
                    document: loaded.document,
                    revision: loaded.revision,
                    error: null,
                });
            } catch (error) {
                if (cancelled) return;

                setState({
                    status: "error",
                    document: null,
                    revision: null,
                    error: errorMessage(error),
                });
            }
        })();

        return () => {
            cancelled = true;
            const coordinator = coordinatorRef.current;
            coordinatorRef.current = null;

            if (coordinator !== null) {
                void coordinator.flush().finally(() => coordinator.dispose());
            }
        };
    }, [documentId, reloadToken, resetHistory, workspaceId]);

    const commit = useCallback(
        (next: GraphDocument, options: CommitOptions = {}) => {
            const current = documentRef.current;
            if (current === null || next === current) return;

            if (options.history !== false) {
                const now = Date.now();
                const key = options.historyKey;
                const last = lastMutationRef.current;
                const coalesce =
                    key !== undefined &&
                    last !== null &&
                    last.key === key &&
                    now - last.at < COALESCE_MS;

                if (!coalesce) {
                    pastRef.current.push(current);
                    if (pastRef.current.length > HISTORY_LIMIT) {
                        pastRef.current.shift();
                    }
                    futureRef.current = [];
                }
                lastMutationRef.current =
                    key === undefined ? null : { key, at: now };
                syncHistory();
            }

            documentRef.current = next;
            setState((previous) =>
                previous.status === "ready"
                    ? { ...previous, document: next }
                    : previous,
            );
            coordinatorRef.current?.update(next);
        },
        [syncHistory],
    );

    const restore = useCallback(
        (next: GraphDocument) => {
            documentRef.current = next;
            setState((previous) =>
                previous.status === "ready"
                    ? { ...previous, document: next }
                    : previous,
            );
            lastMutationRef.current = null;
            coordinatorRef.current?.update(next);
            syncHistory();
        },
        [syncHistory],
    );

    const undo = useCallback(() => {
        const previous = pastRef.current.pop();
        const current = documentRef.current;
        if (previous === undefined || current === null) return;

        futureRef.current.push(current);
        restore(previous);
    }, [restore]);

    const redo = useCallback(() => {
        const next = futureRef.current.pop();
        const current = documentRef.current;
        if (next === undefined || current === null) return;

        pastRef.current.push(current);
        restore(next);
    }, [restore]);

    const replaceDocument = useCallback(
        (next: GraphDocument, options: CommitOptions = {}) => {
            commit(next, options);
        },
        [commit],
    );

    const applyCommand = useCallback(
        (command: CanvasCommand) => {
            const current = documentRef.current;
            if (current === null) return;

            const next = applyCanvasCommand(current, command);
            if (next === current) return;

            // 视口变化不进撤销栈；每次结构性编辑各记一条。
            commit(
                next,
                command.type === "setViewport" ? { history: false } : {},
            );
        },
        [commit],
    );

    const addNodeByType = useCallback(
        (type: string) => {
            const current = documentRef.current;
            if (current === null) return;

            const entry = findNodeCatalogEntry(type);
            if (entry === undefined) return;

            const next = addNode(current, {
                id: createNodeId(current),
                type: entry.type,
                typeVersion: entry.version,
                position: nextNodePosition(current),
                config: defaultConfigOf(entry),
            });
            commit(next);
        },
        [commit],
    );

    const addNodeFromPreset = useCallback(
        (presetId: string) => {
            const current = documentRef.current;
            if (current === null) return;

            const preset = NODE_PRESETS.find((item) => item.presetId === presetId);
            if (preset === undefined) return;

            const next = addNode(current, {
                id: createNodeId(current),
                type: preset.type,
                typeVersion: preset.typeVersion,
                position: nextNodePosition(current),
                config: applyPresetParameters(preset, {}),
            });
            commit(next);
        },
        [commit],
    );

    const updateNodeConfig = useCallback(
        (nodeId: string, config: unknown) => {
            const current = documentRef.current;
            if (current === null) return;

            const next = updateNodeConfigCommand(current, nodeId, config);
            commit(next, { historyKey: `config:${nodeId}` });
        },
        [commit],
    );

    const flush = useCallback(async (): Promise<SaveState> => {
        const coordinator = coordinatorRef.current;
        if (coordinator === null) return SAVED_STATE;
        return coordinator.flush();
    }, []);

    return {
        ...state,
        saveState,
        canUndo: historyState.canUndo,
        canRedo: historyState.canRedo,
        undo,
        redo,
        reload,
        applyCommand,
        addNode: addNodeByType,
        addNodeFromPreset,
        updateNodeConfig,
        replaceDocument,
        flush,
    };
}

async function readOrCreate(
    bridge: Bridge,
    workspaceId: string,
    ref: DocumentRef,
): Promise<{ document: GraphDocument; revision: string }> {
    const snapshot = await bridge.readDocument(workspaceId, ref);
    if (!snapshot.ok) {
        throw new Error(snapshot.error.message);
    }

    if (snapshot.data !== null) {
        return {
            document: parseGraphDocument(snapshot.data.document),
            revision: snapshot.data.revision,
        };
    }

    const document = createGraphTemplate(ref.id);
    const created = await bridge.saveDocument({
        workspaceId,
        ref,
        baseRevision: null,
        document,
    });

    if (created.ok) {
        return { document, revision: created.data.revision };
    }

    // StrictMode 下 effect 会双跑；另一路可能已经创建成功，重读即可。
    if (created.error.code === "E_CONFLICT") {
        const retry = await bridge.readDocument(workspaceId, ref);
        if (retry.ok && retry.data !== null) {
            return {
                document: parseGraphDocument(retry.data.document),
                revision: retry.data.revision,
            };
        }
    }

    throw new Error(created.error.message);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
