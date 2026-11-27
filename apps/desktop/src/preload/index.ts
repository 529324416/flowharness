import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
    IPC_EVENT_CHANNEL,
    IpcChannel,
    IpcSendChannel,
    type AppConfig,
    type AppConfigUpdate,
    type ApprovalResponseRequest,
    type BlobMeta,
    type DocumentRef,
    type DocumentSaveResult,
    type DocumentSnapshot,
    type HarnessDocumentSummary,
    type IpcEventEnvelope,
    type IpcResult,
    type ApiKeyAddRequest,
    type ApiKeyAddResult,
    type ApiKeyDeleteRequest,
    type ApiKeyDeleteResult,
    type ApiKeyRevalidateRequest,
    type ApiKeyReplaceRequest,
    type ProviderCatalogRefreshResult,
    type ProviderLibraryView,
    type ProviderModelsRefreshRequest,
    type ProviderProfile,
    type ProviderProfileCreateRequest,
    type ProviderProfileDeleteRequest,
    type ProviderProfileDeleteResult,
    type ProviderProfileUpdateRequest,
    type RunSnapshot,
    type RunStartRequest,
    type RunResumeInterruptedRequest,
    type RunResultRequest,
    type RunEntriesRequest,
    type SessionCommitTemporaryRequest,
    type SessionCreateRequest,
    type SessionDeleteRequest,
    type SessionAppendEntriesRequest,
    type SessionAppendMessageRequest,
    type SessionAppendRunRequest,
    type SessionFolder,
    type SessionFolderCreateRequest,
    type SessionFolderDeleteRequest,
    type SessionFolderMoveRequest,
    type SessionFolderRenameRequest,
    type SessionListRequest,
    type SessionMoveRequest,
    type SessionReadRequest,
    type SessionRecord,
    type SessionRenameRequest,
    type SessionSaveRequest,
    type SessionSaveRunRequest,
    type SessionSetDraftFolderRequest,
    type SessionSummary,
    type SessionTree,
    type SessionTreeRequest,
    type UserInputResponseRequest,
    type WindowStatePayload,
    type WorkspaceCreateInput,
    type WorkbenchSummary,
    type WorkspaceExportHarnessRequest,
    type WorkspaceExportArchiveRequest,
    type WorkspaceSaveDocumentRequest,
    type WorkspaceSummary,
} from "@flowharness/contracts";

async function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
    return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>;
}

/**
 * The only bridge between the renderer and the Electron main process.
 * Keep it small and explicit: everything here becomes part of the renderer's
 * trusted surface.
 */
const bridge = {
    platform: process.platform,
    smokeMode: process.env.FLOWHARNESS_SMOKE === "1",
    windowMode: process.env.FLOWHARNESS_WINDOW_MODE ?? "transparent",
    versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
    },
    reportReady: (payload: Record<string, unknown>): void => {
        ipcRenderer.send(IpcSendChannel.ReportReady, payload);
    },
    onEvent: (listener: (envelope: IpcEventEnvelope) => void): (() => void) => {
        const handler = (_event: IpcRendererEvent, envelope: IpcEventEnvelope): void => {
            listener(envelope);
        };
        ipcRenderer.on(IPC_EVENT_CHANNEL, handler);
        return () => {
            ipcRenderer.removeListener(IPC_EVENT_CHANNEL, handler);
        };
    },
    windowMinimize: (): Promise<IpcResult<void>> => invoke(IpcChannel.WindowMinimize),
    windowToggleMaximize: (): Promise<IpcResult<WindowStatePayload>> =>
        invoke(IpcChannel.WindowToggleMaximize),
    windowClose: (): Promise<IpcResult<void>> => invoke(IpcChannel.WindowClose),
    isWindowMaximized: (): Promise<IpcResult<WindowStatePayload>> =>
        invoke(IpcChannel.WindowIsMaximized),
    getConfig: (): Promise<IpcResult<AppConfig>> => invoke(IpcChannel.ConfigGet),
    updateConfig: (patch: AppConfigUpdate): Promise<IpcResult<AppConfig>> =>
        invoke(IpcChannel.ConfigUpdate, patch),
    getProviderLibrary: (): Promise<IpcResult<ProviderLibraryView>> =>
        invoke(IpcChannel.ProviderLibrary),
    addProviderKey: (
        request: ApiKeyAddRequest,
    ): Promise<IpcResult<ApiKeyAddResult>> =>
        invoke(IpcChannel.ProviderKeyAdd, request),
    revalidateProviderKey: (
        request: ApiKeyRevalidateRequest,
    ): Promise<IpcResult<ApiKeyAddResult>> =>
        invoke(IpcChannel.ProviderKeyRevalidate, request),
    replaceProviderKey: (
        request: ApiKeyReplaceRequest,
    ): Promise<IpcResult<ApiKeyAddResult>> =>
        invoke(IpcChannel.ProviderKeyReplace, request),
    deleteProviderKey: (
        request: ApiKeyDeleteRequest,
    ): Promise<IpcResult<ApiKeyDeleteResult>> =>
        invoke(IpcChannel.ProviderKeyDelete, request),
    createProviderProfile: (
        request: ProviderProfileCreateRequest,
    ): Promise<IpcResult<ProviderProfile>> =>
        invoke(IpcChannel.ProviderProfileCreate, request),
    updateProviderProfile: (
        request: ProviderProfileUpdateRequest,
    ): Promise<IpcResult<ProviderProfile>> =>
        invoke(IpcChannel.ProviderProfileUpdate, request),
    deleteProviderProfile: (
        request: ProviderProfileDeleteRequest,
    ): Promise<IpcResult<ProviderProfileDeleteResult>> =>
        invoke(IpcChannel.ProviderProfileDelete, request),
    refreshProviderModels: (
        request: ProviderModelsRefreshRequest,
    ): Promise<IpcResult<ProviderCatalogRefreshResult>> =>
        invoke(IpcChannel.ProviderModelsRefresh, request),
    listWorkspaces: (): Promise<IpcResult<WorkspaceSummary[]>> =>
        invoke(IpcChannel.WorkspaceList),
    createWorkspace: (input: WorkspaceCreateInput): Promise<IpcResult<WorkspaceSummary>> =>
        invoke(IpcChannel.WorkspaceCreate, input),
    openWorkspace: (id: string): Promise<IpcResult<WorkspaceSummary>> =>
        invoke(IpcChannel.WorkspaceOpen, { id }),
    closeWorkspace: (id: string): Promise<IpcResult<void>> =>
        invoke(IpcChannel.WorkspaceClose, { id }),
    readDocument: (
        workspaceId: string,
        ref: DocumentRef,
    ): Promise<IpcResult<DocumentSnapshot | null>> =>
        invoke(IpcChannel.WorkspaceReadDocument, { workspaceId, ref }),
    saveDocument: (
        request: WorkspaceSaveDocumentRequest,
    ): Promise<IpcResult<DocumentSaveResult>> =>
        invoke(IpcChannel.WorkspaceSaveDocument, request),
    listDocuments: (
        workspaceId: string,
    ): Promise<IpcResult<HarnessDocumentSummary[]>> =>
        invoke(IpcChannel.WorkspaceListDocuments, { workspaceId }),
    listWorkbenches: (
        workspaceId: string,
    ): Promise<IpcResult<WorkbenchSummary[]>> =>
        invoke(IpcChannel.WorkspaceListWorkbenches, { workspaceId }),
    deleteDocument: (
        workspaceId: string,
        ref: DocumentRef,
    ): Promise<IpcResult<{ deleted: boolean }>> =>
        invoke(IpcChannel.WorkspaceDeleteDocument, { workspaceId, ref }),
    exportHarness: (
        request: WorkspaceExportHarnessRequest,
    ): Promise<IpcResult<{ path: string | null }>> =>
        invoke(IpcChannel.WorkspaceExportHarness, request),
    exportWorkspaceArchive: (
        request: WorkspaceExportArchiveRequest,
    ): Promise<IpcResult<{ path: string } | null>> =>
        invoke(IpcChannel.WorkspaceExportArchive, request),
    importWorkspaceArchive: (): Promise<
        IpcResult<WorkspaceSummary | null>
    > => invoke(IpcChannel.WorkspaceImportArchive),
    statBlob: (
        workspaceId: string,
        hash: string,
    ): Promise<IpcResult<BlobMeta | null>> =>
        invoke(IpcChannel.BlobStat, { workspaceId, hash }),
    listSessions: (
        request: SessionListRequest,
    ): Promise<IpcResult<SessionSummary[]>> =>
        invoke(IpcChannel.SessionList, request),
    listSessionTree: (
        request: SessionTreeRequest,
    ): Promise<IpcResult<SessionTree>> =>
        invoke(IpcChannel.SessionTree, request),
    createSession: (
        request: SessionCreateRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionCreate, request),
    moveSession: (
        request: SessionMoveRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionMove, request),
    renameSession: (
        request: SessionRenameRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionRename, request),
    deleteSession: (
        request: SessionDeleteRequest,
    ): Promise<IpcResult<{ deleted: boolean }>> =>
        invoke(IpcChannel.SessionDelete, request),
    createSessionFolder: (
        request: SessionFolderCreateRequest,
    ): Promise<IpcResult<SessionFolder>> =>
        invoke(IpcChannel.SessionCreateFolder, request),
    renameSessionFolder: (
        request: SessionFolderRenameRequest,
    ): Promise<IpcResult<SessionFolder>> =>
        invoke(IpcChannel.SessionRenameFolder, request),
    moveSessionFolder: (
        request: SessionFolderMoveRequest,
    ): Promise<IpcResult<SessionFolder>> =>
        invoke(IpcChannel.SessionMoveFolder, request),
    deleteSessionFolder: (
        request: SessionFolderDeleteRequest,
    ): Promise<IpcResult<{ deleted: boolean }>> =>
        invoke(IpcChannel.SessionDeleteFolder, request),
    openSession: (
        request: SessionReadRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionOpen, request),
    saveSession: (
        request: SessionSaveRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionSave, request),
    saveRunSession: (
        request: SessionSaveRunRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionSaveRun, request),
    appendRunToSession: (
        request: SessionAppendRunRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionAppendRun, request),
    appendRunEntries: (
        request: SessionAppendEntriesRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionAppendEntries, request),
    appendSessionMessage: (
        request: SessionAppendMessageRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionAppendMessage, request),
    setDraftSessionFolder: (
        request: SessionSetDraftFolderRequest,
    ): Promise<IpcResult<SessionTree>> =>
        invoke(IpcChannel.SessionSetDraftFolder, request),
    commitTemporarySession: (
        request: SessionCommitTemporaryRequest,
    ): Promise<IpcResult<SessionRecord>> =>
        invoke(IpcChannel.SessionCommitTemporary, request),
    closeSession: (
        workspaceId: string,
        sessionId: string,
    ): Promise<IpcResult<void>> =>
        invoke(IpcChannel.SessionClose, { workspaceId, sessionId }),
    startRun: (request: RunStartRequest): Promise<IpcResult<RunSnapshot>> =>
        invoke(IpcChannel.RunStart, request),
    pauseRun: (runId: string): Promise<IpcResult<RunSnapshot>> =>
        invoke(IpcChannel.RunPause, { runId }),
    resumeRun: (runId: string): Promise<IpcResult<RunSnapshot>> =>
        invoke(IpcChannel.RunResume, { runId }),
    cancelRun: (runId: string): Promise<IpcResult<void>> =>
        invoke(IpcChannel.RunCancel, { runId }),
    getRun: (runId: string): Promise<IpcResult<RunSnapshot | null>> =>
        invoke(IpcChannel.RunGet, { runId }),
    getRunResult: (
        request: RunResultRequest,
    ): Promise<IpcResult<unknown | null>> =>
        invoke(IpcChannel.RunResult, request),
    getRunEntries: (
        request: RunEntriesRequest,
    ): Promise<IpcResult<unknown>> =>
        invoke(IpcChannel.RunEntries, request),
    listRuns: (workspaceId?: string): Promise<IpcResult<RunSnapshot[]>> =>
        invoke(IpcChannel.RunList, { workspaceId }),
    resumeInterrupted: (
        request: RunResumeInterruptedRequest,
    ): Promise<IpcResult<RunSnapshot>> =>
        invoke(IpcChannel.RunResumeInterrupted, request),
    respondApproval: (
        request: ApprovalResponseRequest,
    ): Promise<IpcResult<{ accepted: boolean }>> =>
        invoke(IpcChannel.ApprovalRespond, request),
    respondUserInput: (
        request: UserInputResponseRequest,
    ): Promise<IpcResult<{ accepted: boolean }>> =>
        invoke(IpcChannel.UserInputRespond, request),
};

contextBridge.exposeInMainWorld("flowharness", bridge);
