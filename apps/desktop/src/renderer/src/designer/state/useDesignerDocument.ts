import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphDocument } from "wireclaw";
import type { CanvasCommand } from "../../canvas/core/types";
import {
    addNode,
    applyCanvasCommand,
    createNodeId,
    nextNodePosition,
    updateNodeConfig as updateNodeConfigCommand,
} from "../core/commands";
import { findNodeCatalogEntry } from "../core/catalog";
import {
    MAIN_GRAPH_REF,
    cloneMainGraphTemplate,
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

export type UseDesignerDocumentResult = DesignerDocumentState & {
    saveState: SaveState;
    reload: () => void;
    applyCommand: (command: CanvasCommand) => void;
    addNode: (type: string) => void;
    updateNodeConfig: (nodeId: string, config: unknown) => void;
    flush: () => Promise<void>;
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

type Bridge = (typeof window)["flowharness"];

/**
 * 读取工作区的 `main` GraphDocument；不存在时写入最小模板。
 *
 * M1.4：本地编辑 + 400ms 自动保存 + revision 冲突检测。
 * 切换工作区 / 卸载时尝试 flush，不阻塞新文档的加载。
 */
export function useDesignerDocument(workspaceId: string | null): UseDesignerDocumentResult {
    const [state, setState] = useState<DesignerDocumentState>(IDLE_STATE);
    const [saveState, setSaveState] = useState<SaveState>(SAVED_STATE);
    const [reloadToken, setReloadToken] = useState(0);

    const documentRef = useRef<GraphDocument | null>(null);
    const coordinatorRef = useRef<SaveCoordinator | null>(null);

    const reload = useCallback(() => {
        setReloadToken((token) => token + 1);
    }, []);

    useEffect(() => {
        if (workspaceId === null) {
            coordinatorRef.current?.dispose();
            coordinatorRef.current = null;
            documentRef.current = null;
            setState(IDLE_STATE);
            setSaveState(SAVED_STATE);
            return;
        }

        let cancelled = false;
        coordinatorRef.current?.dispose();
        coordinatorRef.current = null;
        documentRef.current = null;
        setState(LOADING_STATE);
        setSaveState(SAVED_STATE);

        void (async () => {
            try {
                const loaded = await readOrCreate(window.flowharness, workspaceId);
                if (cancelled) return;

                const save: SaveFunction = async (document, baseRevision) => {
                    const result = await window.flowharness.saveDocument({
                        workspaceId,
                        ref: MAIN_GRAPH_REF,
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
                    // 旧工作区的 flush 可能在新文档加载后才完成，忽略过期回调。
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
    }, [workspaceId, reloadToken]);

    const commit = useCallback((next: GraphDocument) => {
        documentRef.current = next;
        setState((previous) =>
            previous.status === "ready" ? { ...previous, document: next } : previous,
        );
        coordinatorRef.current?.update(next);
    }, []);

    const applyCommand = useCallback(
        (command: CanvasCommand) => {
            const current = documentRef.current;
            if (current === null) return;

            const next = applyCanvasCommand(current, command);
            if (next !== current) commit(next);
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
            });
            if (next !== current) commit(next);
        },
        [commit],
    );

    const updateNodeConfig = useCallback(
        (nodeId: string, config: unknown) => {
            const current = documentRef.current;
            if (current === null) return;

            const next = updateNodeConfigCommand(current, nodeId, config);
            if (next !== current) commit(next);
        },
        [commit],
    );

    const flush = useCallback(async (): Promise<void> => {
        await coordinatorRef.current?.flush();
    }, []);

    return {
        ...state,
        saveState,
        reload,
        applyCommand,
        addNode: addNodeByType,
        updateNodeConfig,
        flush,
    };
}

async function readOrCreate(
    bridge: Bridge,
    workspaceId: string,
): Promise<{ document: GraphDocument; revision: string }> {
    const snapshot = await bridge.readDocument(workspaceId, MAIN_GRAPH_REF);
    if (!snapshot.ok) {
        throw new Error(snapshot.error.message);
    }

    if (snapshot.data !== null) {
        return {
            document: parseGraphDocument(snapshot.data.document),
            revision: snapshot.data.revision,
        };
    }

    const created = await bridge.saveDocument({
        workspaceId,
        ref: MAIN_GRAPH_REF,
        baseRevision: null,
        document: cloneMainGraphTemplate(),
    });

    if (created.ok) {
        return {
            document: cloneMainGraphTemplate(),
            revision: created.data.revision,
        };
    }

    // StrictMode 下 effect 会双跑；另一路可能已经创建成功，重读即可。
    if (created.error.code === "E_CONFLICT") {
        const retry = await bridge.readDocument(workspaceId, MAIN_GRAPH_REF);
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
