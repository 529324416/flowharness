import { constants as fsConstants, existsSync, promises as fsPromises } from "node:fs";
import { join } from "node:path";
import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    Menu,
    nativeTheme,
    screen,
    safeStorage,
    type BrowserWindowConstructorOptions,
    type IpcMainInvokeEvent,
} from "electron";
import {
    FhError,
    IPC_EVENT_CHANNEL,
    IpcChannel,
    IpcEventTopic,
    IpcSendChannel,
    type AppConfigUpdate,
    type AppInfo,
    type ApprovalRequestPayload,
    type ApprovalResponseRequest,
    type BlobStatRequest,
    type RunCancelRequest,
    type RunGetRequest,
    type RunListRequest,
    type RunPauseRequest,
    type RunResumeInterruptedRequest,
    type RunResumeRequest,
    type RunStartRequest,
    type ProvidersTestRequest,
    type SessionCreateRequest,
    type SessionDeleteRequest,
    type SessionFolderCreateRequest,
    type SessionFolderDeleteRequest,
    type SessionFolderMoveRequest,
    type SessionFolderRenameRequest,
    type SessionListRequest,
    type SessionMoveRequest,
    type SessionReadRequest,
    type SessionRenameRequest,
    type SessionSaveRequest,
    type SessionTreeRequest,
    type SecretsDeleteRequest,
    type SecretsHasRequest,
    type SecretsSetRequest,
    type UserInputRequestPayload,
    type UserInputResponseRequest,
    type WindowMode,
    type WindowStatePayload,
    type WorkspaceCloseRequest,
    type WorkspaceCreateInput,
    type WorkspaceDeleteDocumentRequest,
    type WorkspaceExportHarnessRequest,
    type WorkspaceExportRequest,
    type WorkspaceImportRequest,
    type WorkspaceListDocumentsRequest,
    type WorkspaceListWorkbenchesRequest,
    type WorkspaceOpenRequest,
    type WorkspaceReadDocumentRequest,
    type WorkspaceSaveDocumentRequest,
} from "@flowharness/contracts";
// Wireclaw 以普通包依赖方式引入；这里做启动自检并复用其类型。
import {
    Graph,
    type ToolApprovalDecision,
    type ToolRegistry,
    type UserInputResult,
} from "wireclaw";
import { registerAssetProtocol, registerAssetScheme } from "./platform/asset-protocol";
import { registerHandler } from "./platform/ipc";
import { RequestBroker } from "./platform/request-broker";
import { AppConfigStore, createDefaultAppConfig } from "./services/app-config";
import { ProviderRegistry } from "./services/provider-registry";
import { RunStore } from "./services/run-store";
import { RuntimeHost } from "./services/runtime-host";
import { SecretsStore, type SecretCipher } from "./services/secrets";
import { SessionService } from "./services/session-service";
import { WindowStateStore, type SavedWindowState } from "./services/window-state";
import { createWorkspaceToolRegistry } from "./services/workspace-tools";
import { WorkspaceStore } from "./services/workspace-store";

// 必须在 app ready 之前注册。
registerAssetScheme();

const isSmokeRun = process.env.FLOWHARNESS_SMOKE === "1";
const APPROVAL_TIMEOUT_MS = 5 * 60_000;
const WINDOW_MODE = (process.env.FLOWHARNESS_WINDOW_MODE ?? "transparent") as WindowMode;

/**
 * 开发/受限环境可把工作区根目录指到可写位置；正常启动仍以 AppConfig 为准。
 * 不写进 config，避免覆盖用户设置。
 *
 * 开发模式下如果配置目录不可写（例如受限会话中的 Documents），
 * 依次退到 %TEMP%/FlowHarness/workspaces 与仓库内 .flowharness-workspaces，
 * 保证仍能启动设计器；打包版本不静默换目录。
 */
async function resolveWorkspaceRoot(configRoot: string): Promise<string> {
    const preferred =
        process.env.FLOWHARNESS_WORKSPACE_ROOT?.trim() || configRoot;
    const candidates = new Set<string>([preferred]);

    if (!app.isPackaged) {
        candidates.add(join(app.getPath("temp"), "FlowHarness", "workspaces"));
        candidates.add(join(process.cwd(), ".flowharness-workspaces"));
        candidates.add(
            join(app.getAppPath(), "..", "..", ".flowharness-workspaces"),
        );
    }

    for (const candidate of candidates) {
        try {
            await fsPromises.mkdir(candidate, { recursive: true });
            await fsPromises.access(candidate, fsConstants.W_OK);
            if (candidate !== preferred) {
                console.warn(
                    `[workspace] configured root is not writable; using dev fallback ${candidate}`,
                );
            }
            return candidate;
        } catch (error) {
            console.warn(
                `[workspace] root unavailable: ${candidate}`,
                (error as Error).message,
            );
        }
    }

    return preferred;
}

const bootGraph = new Graph([], [], {
    id: "flowharness-main-boot",
    title: "FlowHarness main boot",
});
console.log(
    `[main] wireclaw ready: Graph=${typeof Graph} graphId=${bootGraph.id} nodes=${bootGraph.nodes.length}`,
);

let mainWindow: BrowserWindow | null = null;
let appConfig: AppConfigStore;
let windowState: WindowStateStore | null = null;
let savedWindowState: SavedWindowState | null = null;
let secrets: SecretsStore;
let providers: ProviderRegistry;
let workspaces: WorkspaceStore;
let sessionService: SessionService;
let runtime: RuntimeHost;
const runStores = new Map<string, RunStore>();
const toolRegistries = new Map<string, ToolRegistry>();

const approvalBroker = new RequestBroker<ToolApprovalDecision>(
    APPROVAL_TIMEOUT_MS,
    () => "deny",
);
const inputBroker = new RequestBroker<UserInputResult>(
    APPROVAL_TIMEOUT_MS,
    (requestId) => ({ requestId, answers: [], cancelled: true }),
);

function createSafeStorageCipher(): SecretCipher {
    return {
        isAvailable: () => safeStorage.isEncryptionAvailable(),
        encrypt: (value) => safeStorage.encryptString(value),
        decrypt: (value) => safeStorage.decryptString(Buffer.from(value)),
    };
}

function resolvePreloadPath(): string {
    const preloadDir = join(__dirname, "../preload");
    for (const fileName of ["index.mjs", "index.js", "index.cjs"]) {
        const candidate = join(preloadDir, fileName);
        if (existsSync(candidate)) return candidate;
    }
    throw new Error(`Preload bundle not found in ${preloadDir}. Run \`pnpm build\` first.`);
}

const WINDOW_BACKGROUND = { light: "#f3f6fa", dark: "#0b0f15" } as const;

function intersects(
    bounds: { x: number; y: number; width: number; height: number },
    area: { x: number; y: number; width: number; height: number },
): boolean {
    return (
        bounds.x < area.x + area.width &&
        bounds.x + bounds.width > area.x &&
        bounds.y < area.y + area.height &&
        bounds.y + bounds.height > area.y
    );
}

function createWindow(saved: SavedWindowState | null = savedWindowState): void {
    const workArea = screen.getPrimaryDisplay().workAreaSize;
    const defaultWidth = Math.min(1440, Math.max(1024, workArea.width - 80));
    const defaultHeight = Math.min(900, Math.max(680, workArea.height - 80));

    let bounds: { x: number; y: number; width: number; height: number } | null = null;
    if (saved && !isSmokeRun) {
        const target = screen
            .getAllDisplays()
            .find((display) => intersects(saved, display.workArea));
        if (target) {
            const width = Math.min(Math.max(saved.width, 1024), target.workArea.width);
            const height = Math.min(Math.max(saved.height, 680), target.workArea.height);
            bounds = {
                width,
                height,
                x: Math.min(
                    Math.max(saved.x, target.workArea.x),
                    target.workArea.x + target.workArea.width - width,
                ),
                y: Math.min(
                    Math.max(saved.y, target.workArea.y),
                    target.workArea.y + target.workArea.height - height,
                ),
            };
        }
    }

    const width = bounds?.width ?? defaultWidth;
    const height = bounds?.height ?? defaultHeight;

    const dark = nativeTheme.shouldUseDarkColors;
    const surfaceColor = WINDOW_BACKGROUND[dark ? "dark" : "light"];

    const options: BrowserWindowConstructorOptions = {
        width,
        height,
        minWidth: 1024,
        minHeight: 680,
        ...(bounds
            ? { x: bounds.x, y: bounds.y, center: false }
            : { center: true }),
        show: !isSmokeRun,
        backgroundColor: surfaceColor,
        title: "FlowHarness",
        webPreferences: {
            preload: resolvePreloadPath(),
            contextIsolation: true,
            sandbox: false,
        },
    };

    if (WINDOW_MODE === "overlay") {
        options.titleBarStyle = "hidden";
        options.titleBarOverlay = {
            color: surfaceColor,
            symbolColor: dark ? "#e6f1f2" : "#10201f",
            height: 44,
        };
    } else if (WINDOW_MODE !== "standard") {
        options.frame = false;
        options.thickFrame = true;

        if (WINDOW_MODE === "mica" || WINDOW_MODE === "acrylic") {
            options.backgroundColor = "#00000000";
            options.backgroundMaterial = WINDOW_MODE;
        } else if (WINDOW_MODE === "transparent") {
            options.transparent = true;
            options.backgroundColor = "#00000000";
        }
    }

    console.log(
        `[main] window mode=${WINDOW_MODE} transparent=${options.transparent === true} overlay=${WINDOW_MODE === "overlay"}`,
    );

    const window = new BrowserWindow(options);

    mainWindow = window;

    const sendWindowState = (): void => {
        broadcast(IpcEventTopic.Window, {
            maximized: window.isMaximized(),
        } satisfies WindowStatePayload);
    };

    const persistWindowState = (): void => {
        if (!windowState || window.isDestroyed()) return;
        const normal = window.getNormalBounds();
        const next: SavedWindowState = {
            ...normal,
            maximized: window.isMaximized(),
        };
        savedWindowState = next;
        void windowState.save(next);
    };

    let persistTimer: NodeJS.Timeout | null = null;
    const schedulePersist = (): void => {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(persistWindowState, 400);
    };

    window.on("resize", schedulePersist);
    window.on("move", schedulePersist);

    window.on("maximize", () => {
        sendWindowState();
        persistWindowState();
    });
    window.on("unmaximize", () => {
        sendWindowState();
        persistWindowState();
    });
    window.on("close", persistWindowState);

    window.on("closed", () => {
        if (persistTimer) clearTimeout(persistTimer);
        if (mainWindow === window) mainWindow = null;
        approvalBroker.settleAll("deny");
        inputBroker.settleAll({ requestId: "", answers: [], cancelled: true });
    });

    if (saved?.maximized && !isSmokeRun) {
        window.maximize();
    }

    const devServerUrl = process.env.ELECTRON_RENDERER_URL;
    if (devServerUrl) {
        void window.loadURL(devServerUrl);
    } else {
        void window.loadFile(join(__dirname, "../renderer/index.html"));
    }
}

function broadcast(topic: IpcEventTopic, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC_EVENT_CHANNEL, { topic, payload });
    }
}

function runStoreFor(workspaceId: string): RunStore {
    const dir = workspaces.getWorkspaceDir(workspaceId);
    if (!dir) {
        throw new FhError("E_CONFLICT", `workspace is not open: ${workspaceId}`);
    }

    let store = runStores.get(workspaceId);
    if (!store) {
        store = new RunStore(join(dir, "runs"));
        runStores.set(workspaceId, store);
    }
    return store;
}

function requireSessionStore(workspaceId: string) {
    const store = sessionService.sessionsFor(workspaceId);
    if (store === undefined) {
        throw new FhError("E_NOT_FOUND", `workspace is not open: ${workspaceId}`);
    }
    return store;
}

function toolsFor(workspaceId: string): ToolRegistry | undefined {
    const existing = toolRegistries.get(workspaceId);
    if (existing !== undefined) return existing;

    const dir = workspaces.getWorkspaceDir(workspaceId);
    if (dir === undefined) return undefined;

    const registry = createWorkspaceToolRegistry(dir);
    toolRegistries.set(workspaceId, registry);
    return registry;
}

async function initialize(): Promise<void> {
    const userData = app.getPath("userData");
    const documents = app.getPath("documents");

    appConfig = new AppConfigStore(
        join(userData, "config.json"),
        createDefaultAppConfig(join(documents, "FlowHarness")),
    );

    const config = await appConfig.get();
    nativeTheme.themeSource = config.theme;

    windowState = new WindowStateStore(join(userData, "window-state.json"));
    savedWindowState = await windowState.load();

    workspaces = new WorkspaceStore(
        await resolveWorkspaceRoot(config.workspaceRoot),
        app.getVersion(),
    );
    await workspaces.init();

    secrets = new SecretsStore(join(userData, "secrets.bin"), createSafeStorageCipher());
    providers = new ProviderRegistry(secrets);
    await providers.reload(config.providers);

    sessionService = new SessionService(
        (workspaceId) => workspaces.getBlobStore(workspaceId),
        (workspaceId) => workspaces.getWorkspaceDir(workspaceId),
        (workspaceId) => workspaces.getSettings(workspaceId),
        (workspaceId, patch) =>
            workspaces.updateSettings(workspaceId, patch).then(() => undefined),
    );

    runtime = new RuntimeHost({
        publish: (batch) => broadcast(IpcEventTopic.Run, batch),
        approval: {
            ask: (ask) => {
                const payload: ApprovalRequestPayload = {
                    requestId: ask.requestId,
                    runId: ask.runId,
                    nodeId: ask.nodeId,
                    toolName: ask.request.call.name,
                    arguments: ask.request.call.params,
                    expiresAt: Date.now() + APPROVAL_TIMEOUT_MS,
                };
                broadcast(IpcEventTopic.Approval, payload);
                return approvalBroker.wait(ask.requestId);
            },
        },
        userInput: {
            ask: (ask) => {
                const payload: UserInputRequestPayload = {
                    requestId: ask.requestId,
                    runId: ask.runId,
                    nodeId: ask.nodeId,
                    ...(ask.request.title === undefined
                        ? {}
                        : { title: ask.request.title }),
                    questions: ask.request.questions.map((question) => ({
                        id: question.id,
                        ...(question.header === undefined
                            ? {}
                            : { header: question.header }),
                        question: question.question,
                        options: question.options.map((option) => ({
                            id: option.id,
                            label: option.label,
                            ...(option.description === undefined
                                ? {}
                                : { description: option.description }),
                        })),
                        ...(question.multiSelect === undefined
                            ? {}
                            : { multiSelect: question.multiSelect }),
                        ...(question.allowOther === undefined
                            ? {}
                            : { allowOther: question.allowOther }),
                    })),
                    expiresAt: Date.now() + APPROVAL_TIMEOUT_MS,
                };
                broadcast(IpcEventTopic.Input, payload);
                return inputBroker.wait(ask.requestId);
            },
        },
        resolveProvider: (providerId) => providers.get(providerId),
        attachmentsFor: (workspaceId) => sessionService.attachmentsFor(workspaceId),
        toolsFor,
        storeFor: (workspaceId) => runStoreFor(workspaceId),
    });

    registerAssetProtocol(async (workspaceId, contentHash) => {
        const blobs = workspaces.getBlobStore(workspaceId);
        if (!blobs) return undefined;

        const bytes = await blobs.get(contentHash);
        if (!bytes) return undefined;

        const meta = await blobs.stat(contentHash);
        return {
            bytes,
            mimeType: meta?.mimeType ?? "application/octet-stream",
        };
    });

    registerIpcHandlers();
    Menu.setApplicationMenu(null);

    ipcMain.on(IpcSendChannel.ReportReady, (_event, payload: unknown) => {
        console.log(`[main] renderer-ready ${JSON.stringify(payload)}`);

        if (!isSmokeRun) return;

        if (isPhase(payload, "data")) sawDataReport = true;
        if (isPhase(payload, "run")) sawRunReport = true;

        // smoke 需要同时看到数据层与一次完整 run 后再退出。
        if (sawDataReport && sawRunReport) {
            setTimeout(() => app.quit(), 100);
        }
    });
}

let sawDataReport = false;
let sawRunReport = false;

function isPhase(payload: unknown, phase: string): boolean {
    return (
        typeof payload === "object" &&
        payload !== null &&
        "phase" in payload &&
        (payload as { phase?: unknown }).phase === phase
    );
}

function windowFromEvent(event: IpcMainInvokeEvent): BrowserWindow {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
        throw new FhError("E_NOT_FOUND", "window not found");
    }
    return window;
}

function registerIpcHandlers(): void {
    registerHandler(IpcChannel.WindowMinimize, (_request, event) => {
        windowFromEvent(event).minimize();
    });

    registerHandler(IpcChannel.WindowToggleMaximize, (_request, event) => {
        const window = windowFromEvent(event);
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
        return { maximized: window.isMaximized() };
    });

    registerHandler(IpcChannel.WindowClose, (_request, event) => {
        windowFromEvent(event).close();
    });

    registerHandler(IpcChannel.WindowIsMaximized, (_request, event) => ({
        maximized: windowFromEvent(event).isMaximized(),
    }));

    registerHandler(IpcChannel.AppGetInfo, (): AppInfo => ({
        name: app.getName(),
        version: app.getVersion(),
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
        platform: process.platform,
    }));

    registerHandler(IpcChannel.ConfigGet, () => appConfig.get());

    registerHandler(IpcChannel.ConfigUpdate, async (patch: AppConfigUpdate) => {
        const before = await appConfig.get();
        const next = await appConfig.update(patch);

        nativeTheme.themeSource = next.theme;

        if (next.workspaceRoot !== before.workspaceRoot) {
            workspaces = new WorkspaceStore(
                await resolveWorkspaceRoot(next.workspaceRoot),
                app.getVersion(),
            );
            await workspaces.init();
            runStores.clear();
        }

        if (JSON.stringify(next.providers) !== JSON.stringify(before.providers)) {
            await providers.reload(next.providers);
        }

        return next;
    });

    registerHandler(IpcChannel.ConfigReset, async () => {
        const next = await appConfig.reset();
        nativeTheme.themeSource = next.theme;
        await providers.reload(next.providers);
        return next;
    });

    registerHandler(IpcChannel.WorkspaceList, () => workspaces.list());

    registerHandler(
        IpcChannel.WorkspaceCreate,
        (input: WorkspaceCreateInput) => workspaces.create(input),
    );

    registerHandler(
        IpcChannel.WorkspaceOpen,
        async ({ id }: WorkspaceOpenRequest) => {
            const summary = await workspaces.open(id);
            await appConfig.addRecentWorkspace({
                id: summary.id,
                name: summary.name,
                path: summary.path,
                openedAt: new Date().toISOString(),
            });

            // 上次异常退出遗留的 running → interrupted。
            void runStoreFor(summary.id).markInterrupted().catch(() => undefined);
            return summary;
        },
    );

    registerHandler(
        IpcChannel.SessionCreate,
        async ({ workspaceId, title, folderId }: SessionCreateRequest) => {
            const store = requireSessionStore(workspaceId);
            return store.create({
                ...(title === undefined ? {} : { title }),
                ...(folderId === undefined ? {} : { folderId }),
            });
        },
    );

    registerHandler(
        IpcChannel.SessionList,
        async ({ workspaceId }: SessionListRequest) => {
            const store = requireSessionStore(workspaceId);
            await store.ensureDefault();
            return store.list();
        },
    );

    registerHandler(
        IpcChannel.SessionTree,
        async ({ workspaceId }: SessionTreeRequest) => {
            const store = requireSessionStore(workspaceId);
            await store.ensureDefault();
            return store.tree();
        },
    );

    registerHandler(
        IpcChannel.SessionMove,
        ({ workspaceId, sessionId, folderId }: SessionMoveRequest) =>
            requireSessionStore(workspaceId).moveSession(sessionId, folderId),
    );

    registerHandler(
        IpcChannel.SessionRename,
        ({ workspaceId, sessionId, title }: SessionRenameRequest) =>
            requireSessionStore(workspaceId).renameSession(sessionId, title),
    );

    registerHandler(
        IpcChannel.SessionDelete,
        ({ workspaceId, sessionId }: SessionDeleteRequest) =>
            requireSessionStore(workspaceId)
                .delete(sessionId)
                .then((deleted) => ({ deleted })),
    );

    registerHandler(
        IpcChannel.SessionCreateFolder,
        ({
            workspaceId,
            title,
            parentFolderId,
        }: SessionFolderCreateRequest) =>
            requireSessionStore(workspaceId).createFolder({
                title,
                parentFolderId,
            }),
    );

    registerHandler(
        IpcChannel.SessionRenameFolder,
        ({ workspaceId, folderId, title }: SessionFolderRenameRequest) =>
            requireSessionStore(workspaceId).renameFolder(folderId, title),
    );

    registerHandler(
        IpcChannel.SessionMoveFolder,
        ({ workspaceId, folderId, targetFolderId }: SessionFolderMoveRequest) =>
            requireSessionStore(workspaceId).moveFolder(
                folderId,
                targetFolderId,
            ),
    );

    registerHandler(
        IpcChannel.SessionDeleteFolder,
        ({ workspaceId, folderId }: SessionFolderDeleteRequest) =>
            requireSessionStore(workspaceId).deleteFolder(folderId).then(
                (deleted) => ({ deleted }),
            ),
    );

    registerHandler(
        IpcChannel.SessionOpen,
        ({ workspaceId, sessionId }: SessionReadRequest) =>
            requireSessionStore(workspaceId).read(sessionId),
    );

    registerHandler(
        IpcChannel.SessionSave,
        ({ workspaceId, session }: SessionSaveRequest) =>
            requireSessionStore(workspaceId).save(session),
    );

    registerHandler(
        IpcChannel.SessionClose,
        async () => undefined,
    );

    registerHandler(
        IpcChannel.WorkspaceClose,
        async ({ id }: WorkspaceCloseRequest) => {
            sessionService.close(id);
            runStores.delete(id);
            toolRegistries.delete(id);
            await workspaces.close(id);
        },
    );

    registerHandler(
        IpcChannel.WorkspaceExport,
        async ({ id, targetPath }: WorkspaceExportRequest) => ({
            path: await workspaces.exportWorkspace(id, targetPath),
        }),
    );

    registerHandler(
        IpcChannel.WorkspaceImport,
        ({ sourcePath }: WorkspaceImportRequest) =>
            workspaces.importWorkspace(sourcePath),
    );

    registerHandler(
        IpcChannel.WorkspaceReadDocument,
        async ({ workspaceId, ref }: WorkspaceReadDocumentRequest) => {
            const snapshot = await workspaces.readDocument(workspaceId, ref);
            return snapshot === null ? null : { ref, ...snapshot };
        },
    );

    registerHandler(
        IpcChannel.WorkspaceSaveDocument,
        ({ workspaceId, ref, baseRevision, document }: WorkspaceSaveDocumentRequest) =>
            workspaces.saveDocument(workspaceId, ref, document, baseRevision),
    );

    registerHandler(
        IpcChannel.WorkspaceListDocuments,
        ({ workspaceId }: WorkspaceListDocumentsRequest) =>
            workspaces.listDocuments(workspaceId),
    );

    registerHandler(
        IpcChannel.WorkspaceListWorkbenches,
        ({ workspaceId }: WorkspaceListWorkbenchesRequest) =>
            workspaces.listWorkbenches(workspaceId),
    );

    registerHandler(
        IpcChannel.WorkspaceDeleteDocument,
        async ({ workspaceId, ref }: WorkspaceDeleteDocumentRequest) => ({
            deleted: await workspaces.deleteDocument(workspaceId, ref),
        }),
    );

    registerHandler(
        IpcChannel.WorkspaceExportHarness,
        async ({ text, defaultFileName }: WorkspaceExportHarnessRequest) => {
            if (typeof text !== "string" || typeof defaultFileName !== "string") {
                throw new FhError("E_INVALID_ARGUMENT", "invalid harness export request");
            }
            const owner = BrowserWindow.getFocusedWindow();
            const options = {
                title: "导出 Harness JSON",
                defaultPath: defaultFileName,
                filters: [{ name: "Harness JSON", extensions: ["json"] }],
            };
            const result =
                owner === null
                    ? await dialog.showSaveDialog(options)
                    : await dialog.showSaveDialog(owner, options);

            if (result.canceled || result.filePath === undefined) {
                return { path: null };
            }

            await fsPromises.writeFile(result.filePath, text, "utf8");
            return { path: result.filePath };
        },
    );

    registerHandler(
        IpcChannel.BlobStat,
        async ({ workspaceId, hash }: BlobStatRequest) => {
            const blobs = workspaces.getBlobStore(workspaceId);
            return blobs ? ((await blobs.stat(hash)) ?? null) : null;
        },
    );

    registerHandler(
        IpcChannel.BlobDelete,
        async ({ workspaceId, hash }: BlobStatRequest) => {
            const blobs = workspaces.getBlobStore(workspaceId);
            return { deleted: blobs ? await blobs.delete(hash) : false };
        },
    );

    registerHandler(
        IpcChannel.SecretsHas,
        async ({ providerId }: SecretsHasRequest) => ({
            has: await secrets.has(providerId),
        }),
    );

    registerHandler(
        IpcChannel.SecretsSet,
        async ({ providerId, value }: SecretsSetRequest) => {
            await secrets.set(providerId, value);
            await providers.reload((await appConfig.get()).providers);
        },
    );

    registerHandler(
        IpcChannel.SecretsDelete,
        async ({ providerId }: SecretsDeleteRequest) => {
            const deleted = await secrets.delete(providerId);
            await providers.reload((await appConfig.get()).providers);
            return { deleted };
        },
    );

    registerHandler(IpcChannel.ProvidersList, () => providers.list());

    registerHandler(
        IpcChannel.ProvidersTest,
        ({ providerId }: ProvidersTestRequest) => providers.test(providerId),
    );

    registerHandler(IpcChannel.RunStart, (request: RunStartRequest) =>
        runtime.start(request),
    );

    registerHandler(IpcChannel.RunPause, ({ runId }: RunPauseRequest) =>
        runtime.pause(runId),
    );

    registerHandler(IpcChannel.RunResume, ({ runId }: RunResumeRequest) =>
        runtime.resume(runId),
    );

    registerHandler(IpcChannel.RunCancel, ({ runId }: RunCancelRequest) => {
        runtime.cancel(runId);
    });

    registerHandler(IpcChannel.RunGet, ({ runId }: RunGetRequest) => {
        const snapshot = runtime.get(runId);
        return snapshot;
    });

    registerHandler(
        IpcChannel.RunList,
        async ({ workspaceId }: RunListRequest) => {
            const live = runtime.list(workspaceId);
            if (workspaceId === undefined) return live;

            const persisted = await runStoreFor(workspaceId).list(workspaceId);
            const seen = new Set(live.map((snapshot) => snapshot.runId));
            return [
                ...live,
                ...persisted.filter((snapshot) => !seen.has(snapshot.runId)),
            ].sort((a, b) => b.startedAt - a.startedAt);
        },
    );

    registerHandler(
        IpcChannel.RunResumeInterrupted,
        ({ workspaceId, runId }: RunResumeInterruptedRequest) =>
            runtime.resumeInterrupted(workspaceId, runId),
    );

    registerHandler(
        IpcChannel.ApprovalRespond,
        ({ requestId, decision }: ApprovalResponseRequest) => ({
            accepted: approvalBroker.settle(requestId, decision),
        }),
    );

    registerHandler(
        IpcChannel.UserInputRespond,
        (response: UserInputResponseRequest) => ({
            accepted: inputBroker.settle(response.requestId, {
                requestId: response.requestId,
                answers: response.answers.map((answer) => ({
                    questionId: answer.questionId,
                    selected: [...answer.selected],
                    ...(answer.other === undefined ? {} : { other: answer.other }),
                })),
                ...(response.cancelled === undefined
                    ? {}
                    : { cancelled: response.cancelled }),
            }),
        }),
    );
}

// NOTE: `app.requestSingleInstanceLock()` is intentionally not used yet.
// In restricted terminals/CI the Chromium singleton lock under userData cannot
// be created, and Electron then refuses to start. Revisit when packaging.
app.whenReady().then(async () => {
    try {
        await initialize();
    } catch (error) {
        console.error("[main] initialize failed", error);
        app.exit(1);
        return;
    }

    createWindow(savedWindowState);

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(savedWindowState);
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
