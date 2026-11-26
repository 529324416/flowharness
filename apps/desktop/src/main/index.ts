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
    type RunEntriesRequest,
    type RunListRequest,
    type RunPauseRequest,
    type RunResultRequest,
    type RunResumeInterruptedRequest,
    type RunResumeRequest,
    type RunStartRequest,
    type ApiKeyAddRequest,
    type ApiKeyDeleteRequest,
    type ApiKeyRevalidateRequest,
    type ApiKeyReplaceRequest,
    type ProviderModelsRefreshRequest,
    type ProviderProfileCreateRequest,
    type ProviderProfileDeleteRequest,
    type ProviderProfileUpdateRequest,
    type SessionCreateRequest,
    type SessionDeleteRequest,
    type SessionAppendEntriesRequest,
    type SessionAppendMessageRequest,
    type SessionAppendRunRequest,
    type SessionFolderCreateRequest,
    type SessionFolderDeleteRequest,
    type SessionFolderMoveRequest,
    type SessionFolderRenameRequest,
    type SessionListRequest,
    type SessionMoveRequest,
    type SessionReadRequest,
    type SessionRenameRequest,
    type SessionSaveRequest,
    type SessionSaveRunRequest,
    type SessionSetDraftFolderRequest,
    type SessionTreeRequest,
    type UserInputResponseRequest,
    type UserInputRequestPayload,
    type WindowMode,
    type WindowStatePayload,
    type WorkspaceCloseRequest,
    type WorkspaceCreateInput,
    type WorkspaceDeleteDocumentRequest,
    type WorkspaceExportHarnessRequest,
    type WorkspaceExportRequest,
    type WorkspaceExportArchiveRequest,
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
    RunResultSerializer,
    type ToolApprovalDecision,
    type ToolRegistry,
    type UserInputResult,
} from "wireclaw";
import { registerAssetProtocol, registerAssetScheme } from "./platform/asset-protocol";
import { registerHandler } from "./platform/ipc";
import { RequestBroker } from "./platform/request-broker";
import {
    AppConfigStore,
    createDefaultAppConfig,
    defaultProviderConfigs,
} from "./services/app-config";
import { ProviderRegistry } from "./services/provider-registry";
import { seedProviderLibraryFromLegacy } from "./services/provider-library-migration";
import { ProviderLibraryStore } from "./services/provider-library-store";
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
const WM_SYSCOMMAND = 0x0112;
const WM_NCLBUTTONDBLCLK = 0x00a3;
const SC_MOVE = 0xf010;
const SC_MAXIMIZE = 0xf030;

/**
 * 透明无边框窗口会丢掉 DefWindowProc 的标题栏手势：
 * Electron 对 transparent 窗口的 SC_MAXIMIZE 直接返回 true（见 native_window_views_win.cc），
 * 所以双击标题栏不会最大化/还原。这里通过 hookWindowMessage 在 Electron 吞掉消息前处理。
 */
function hookTransparentTitleBar(window: BrowserWindow): void {
    let lastToggleAt = 0;

    const toggleMaximized = (): void => {
        // 同一个双击可能同时到达 WM_NCLBUTTONDBLCLK 与 WM_SYSCOMMAND，去重一次。
        const now = Date.now();
        if (now - lastToggleAt < 250) return;
        lastToggleAt = now;

        // 最大化状态下的双击仍发送 SC_MAXIMIZE（不是 SC_RESTORE），因此按切换处理。
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
    };

    window.hookWindowMessage(WM_SYSCOMMAND, (wParam) => {
        const command = readWindowMessageWord(wParam) & 0xfff0;

        if (command === SC_MAXIMIZE) {
            toggleMaximized();
            return;
        }

        if (command === SC_MOVE && window.isMaximized()) {
            restoreForTitleBarDrag(window);
        }
    });

    // 兜底：个别 Windows/Electron 组合仍会把非客户区双击派发上来。
    window.hookWindowMessage(WM_NCLBUTTONDBLCLK, () => {
        toggleMaximized();
    });
}

/** 拖动最大化窗口的标题栏：还原到普通状态，并让标题栏回到光标下方。 */
function restoreForTitleBarDrag(window: BrowserWindow): void {
    const normal = window.getNormalBounds();
    const maximized = window.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const ratio =
        maximized.width > 0
            ? Math.min(1, Math.max(0, (cursor.x - maximized.x) / maximized.width))
            : 0.5;

    window.unmaximize();
    window.setBounds({
        width: normal.width,
        height: normal.height,
        x: Math.round(cursor.x - ratio * normal.width),
        y: Math.round(cursor.y - 20),
    });
}

/** hookWindowMessage 的 wParam 是原始消息字（小端）。 */
function readWindowMessageWord(buffer: Buffer): number {
    return buffer.length >= 4 ? buffer.readUInt32LE(0) : 0;
}

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

    // 最大化状态可能在窗口显示 / 聚焦后变化（例如启动时恢复最大化、
    // Windows 吸附、Aero Snap）。除 maximize/unmaximize 外再做一次兜底广播，
    // 避免自绘按钮图标与真实窗口状态不一致。
    let stateTimer: NodeJS.Timeout | null = null;
    const scheduleWindowState = (): void => {
        if (stateTimer) clearTimeout(stateTimer);
        stateTimer = setTimeout(sendWindowState, 80);
    };

    window.on("resize", () => {
        schedulePersist();
        scheduleWindowState();
    });
    window.on("move", schedulePersist);

    window.on("maximize", () => {
        sendWindowState();
        persistWindowState();
    });
    window.on("unmaximize", () => {
        sendWindowState();
        persistWindowState();
    });
    window.on("restore", sendWindowState);
    window.on("focus", sendWindowState);
    window.webContents.on("did-finish-load", sendWindowState);
    window.on("close", persistWindowState);

    window.on("closed", () => {
        if (persistTimer) clearTimeout(persistTimer);
        if (stateTimer) clearTimeout(stateTimer);
        if (mainWindow === window) mainWindow = null;
        approvalBroker.settleAll("deny");
        inputBroker.settleAll({ requestId: "", answers: [], cancelled: true });
    });

    if (process.platform === "win32" && WINDOW_MODE === "transparent") {
        hookTransparentTitleBar(window);
    }

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

/** Provider 库变更后广播只读视图（不含密钥）；M9.3 设置页与节点健康使用。 */
function broadcastProviderLibrary(): void {
    broadcast(IpcEventTopic.Provider, providers.view());
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
    const legacyProviders = appConfig.legacyProviders;
    // 全新 v2 安装没有 legacy providers：仍用默认 4 条播种 Provider 库。
    const initialProviders =
        legacyProviders.length > 0 ? legacyProviders : defaultProviderConfigs();
    nativeTheme.themeSource = config.theme;

    windowState = new WindowStateStore(join(userData, "window-state.json"));
    savedWindowState = await windowState.load();

    workspaces = new WorkspaceStore(
        await resolveWorkspaceRoot(config.workspaceRoot),
        app.getVersion(),
    );
    await workspaces.init();

    secrets = new SecretsStore(join(userData, "secrets.bin"), createSafeStorageCipher());

    // M9.1 影子迁移 + M9.2 运行时接管：库优先，旧 ProviderConfig 仅作为首次兜底。
    const providerLibrary = new ProviderLibraryStore(
        join(userData, "provider-library.json"),
    );
    try {
        const seeded = await seedProviderLibraryFromLegacy({
            store: providerLibrary,
            secrets,
            legacyProviders: initialProviders,
        });
        for (const warning of seeded.warnings) {
            console.warn("[provider-library]", warning);
        }
    } catch (error) {
        console.warn(
            "[provider-library] seed failed:",
            error instanceof Error ? error.message : String(error),
        );
    }

    providers = new ProviderRegistry(providerLibrary, secrets);
    await providers.init(initialProviders);
    try {
        await providers.removeLegacySecrets(legacyProviders);
    } catch (error) {
        console.warn(
            "[provider-library] cannot remove legacy secrets:",
            error instanceof Error ? error.message : String(error),
        );
    }

    // 只有库文件确实存在时才把 AppConfig 落成 v2；否则保留 v1 供下次重试。
    if (await providerLibrary.exists().catch(() => false)) {
        try {
            await appConfig.finalizeMigration();
        } catch (error) {
            console.warn(
                "[config] cannot finalize v2 migration:",
                error instanceof Error ? error.message : String(error),
            );
        }
    }

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
        onProviderHttpError: (providerId, httpStatus) => {
            void providers
                .recordRuntimeProviderError(providerId, httpStatus)
                .then((changed) => {
                    if (changed) broadcastProviderLibrary();
                })
                .catch((error: unknown) => {
                    console.warn(
                        "[provider-library] cannot persist provider error:",
                        error instanceof Error ? error.message : String(error),
                    );
                });
        },
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

        const payload = { maximized: window.isMaximized() } satisfies WindowStatePayload;
        broadcast(IpcEventTopic.Window, payload);
        return payload;
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

        return next;
    });

    registerHandler(IpcChannel.ConfigReset, async () => {
        const next = await appConfig.reset();
        nativeTheme.themeSource = next.theme;
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
        IpcChannel.SessionSaveRun,
        async ({
            workspaceId,
            runId,
            title,
            folderId,
        }: SessionSaveRunRequest) => {
            const raw = await runStoreFor(workspaceId).loadResult(runId);
            if (raw === undefined) {
                throw new FhError(
                    "E_NOT_FOUND",
                    `run result not found: ${runId}`,
                );
            }

            return requireSessionStore(workspaceId).createRunSession({
                result: RunResultSerializer.deserialize(raw),
                ...(title === undefined ? {} : { title }),
                ...(folderId === undefined ? {} : { folderId }),
            });
        },
    );

    registerHandler(
        IpcChannel.SessionSetDraftFolder,
        ({ workspaceId, folderId }: SessionSetDraftFolderRequest) =>
            requireSessionStore(workspaceId).setDraftFolder(folderId),
    );

    registerHandler(
        IpcChannel.SessionAppendRun,
        async ({
            workspaceId,
            runId,
            sessionId,
        }: SessionAppendRunRequest) => {
            const raw = await runStoreFor(workspaceId).loadResult(runId);
            if (raw === undefined) {
                throw new FhError(
                    "E_NOT_FOUND",
                    `run result not found: ${runId}`,
                );
            }

            return requireSessionStore(workspaceId).appendRunMessages(
                sessionId,
                RunResultSerializer.deserialize(raw),
            );
        },
    );

    registerHandler(
        IpcChannel.SessionAppendEntries,
        async ({
            workspaceId,
            sessionId,
            entries,
        }: SessionAppendEntriesRequest) =>
            requireSessionStore(workspaceId).appendRunEntries(sessionId, entries),
    );

    registerHandler(
        IpcChannel.SessionAppendMessage,
        async ({
            workspaceId,
            sessionId,
            role,
            content,
        }: SessionAppendMessageRequest) =>
            requireSessionStore(workspaceId).appendMessage(
                sessionId,
                role,
                content,
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
        IpcChannel.WorkspaceExportArchive,
        async ({ workspaceId, defaultName }: WorkspaceExportArchiveRequest) => {
            const owner = BrowserWindow.getFocusedWindow();
            const safeName =
                typeof defaultName === "string" && defaultName.trim().length > 0
                    ? defaultName.trim()
                    : workspaceId;
            const options = {
                title: "导出工作区 (.fhws)",
                defaultPath: `${safeName}.fhws`,
                filters: [
                    {
                        name: "FlowHarness Workspace",
                        extensions: ["fhws"],
                    },
                ],
            };
            const result =
                owner === null
                    ? await dialog.showSaveDialog(options)
                    : await dialog.showSaveDialog(owner, options);
            if (result.canceled || result.filePath === undefined) {
                return null;
            }

            const path = await workspaces.exportWorkspace(
                workspaceId,
                result.filePath,
            );
            return { path };
        },
    );

    registerHandler(
        IpcChannel.WorkspaceImportArchive,
        async () => {
            const owner = BrowserWindow.getFocusedWindow();
            const options = {
                title: "导入 .fhws（作为新工作区副本）",
                properties: ["openFile" as const],
                filters: [
                    {
                        name: "FlowHarness Workspace",
                        extensions: ["fhws"],
                    },
                ],
            };
            const result =
                owner === null
                    ? await dialog.showOpenDialog(options)
                    : await dialog.showOpenDialog(owner, options);
            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }

            return workspaces.importWorkspace(result.filePaths[0]!);
        },
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

    registerHandler(IpcChannel.ProviderLibrary, () => providers.view());

    registerHandler(
        IpcChannel.ProviderKeyAdd,
        async (request: ApiKeyAddRequest) => {
            const result = await providers.addKey(request);
            broadcastProviderLibrary();
            return result;
        },
    );

    registerHandler(
        IpcChannel.ProviderKeyRevalidate,
        async (request: ApiKeyRevalidateRequest) => {
            const result = await providers.revalidateKey(request.keyId);
            broadcastProviderLibrary();
            return result;
        },
    );

    registerHandler(
        IpcChannel.ProviderKeyReplace,
        async (request: ApiKeyReplaceRequest) => {
            const result = await providers.replaceKey(request.keyId, request.apiKey);
            broadcastProviderLibrary();
            return result;
        },
    );

    registerHandler(
        IpcChannel.ProviderKeyDelete,
        async (request: ApiKeyDeleteRequest) => {
            const result = await providers.deleteKey(request.keyId);
            broadcastProviderLibrary();
            return result;
        },
    );

    registerHandler(
        IpcChannel.ProviderProfileCreate,
        async (request: ProviderProfileCreateRequest) => {
            const result = await providers.createProfile(request);
            broadcastProviderLibrary();
            return result;
        },
    );

    registerHandler(
        IpcChannel.ProviderProfileUpdate,
        async (request: ProviderProfileUpdateRequest) => {
            const result = await providers.updateProfile(request);
            broadcastProviderLibrary();
            return result;
        },
    );

    registerHandler(
        IpcChannel.ProviderProfileDelete,
        async (request: ProviderProfileDeleteRequest) => {
            const result = await providers.deleteProfile(request);
            broadcastProviderLibrary();
            return result;
        },
    );

    registerHandler(
        IpcChannel.ProviderModelsRefresh,
        async (request: ProviderModelsRefreshRequest) => {
            const result = await providers.refreshModels(request.profileId);
            broadcastProviderLibrary();
            return result;
        },
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
        IpcChannel.RunResult,
        ({ runId, workspaceId }: RunResultRequest) =>
            runtime.getResult(runId, workspaceId),
    );

    registerHandler(IpcChannel.RunEntries, ({ runId }: RunEntriesRequest) =>
        runtime.getEntries(runId),
    );

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
