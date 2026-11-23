import { existsSync } from "node:fs";
import { join } from "node:path";
import {
    app,
    BrowserWindow,
    ipcMain,
    nativeTheme,
    safeStorage,
} from "electron";
import {
    IpcChannel,
    IpcSendChannel,
    type AppConfigUpdate,
    type AppInfo,
    type BlobStatRequest,
    type SecretsDeleteRequest,
    type SecretsHasRequest,
    type SecretsSetRequest,
    type WorkspaceCloseRequest,
    type WorkspaceCreateInput,
    type WorkspaceExportRequest,
    type WorkspaceImportRequest,
    type WorkspaceOpenRequest,
} from "@flowharness/contracts";
// Wireclaw 以普通包依赖方式引入；这里做启动自检。
import { Graph } from "wireclaw";
import { registerAssetProtocol, registerAssetScheme } from "./platform/asset-protocol";
import { registerHandler } from "./platform/ipc";
import { AppConfigStore, createDefaultAppConfig } from "./services/app-config";
import { SecretsStore, type SecretCipher } from "./services/secrets";
import { WorkspaceStore } from "./services/workspace-store";

// 必须在 app ready 之前注册。
registerAssetScheme();

const isSmokeRun = process.env.FLOWHARNESS_SMOKE === "1";

const bootGraph = new Graph([], [], {
    id: "flowharness-main-boot",
    title: "FlowHarness main boot",
});
console.log(
    `[main] wireclaw ready: Graph=${typeof Graph} graphId=${bootGraph.id} nodes=${bootGraph.nodes.length}`,
);

let mainWindow: BrowserWindow | null = null;
let appConfig: AppConfigStore;
let secrets: SecretsStore;
let workspaces: WorkspaceStore;

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

function createWindow(): void {
    const window = new BrowserWindow({
        width: 1180,
        height: 780,
        show: !isSmokeRun,
        backgroundColor:
            WINDOW_BACKGROUND[nativeTheme.shouldUseDarkColors ? "dark" : "light"],
        title: "FlowHarness",
        webPreferences: {
            preload: resolvePreloadPath(),
            contextIsolation: true,
            sandbox: false,
        },
    });

    mainWindow = window;

    window.on("closed", () => {
        if (mainWindow === window) mainWindow = null;
    });

    const devServerUrl = process.env.ELECTRON_RENDERER_URL;
    if (devServerUrl) {
        void window.loadURL(devServerUrl);
    } else {
        void window.loadFile(join(__dirname, "../renderer/index.html"));
    }
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

    workspaces = new WorkspaceStore(config.workspaceRoot, app.getVersion());
    await workspaces.init();

    secrets = new SecretsStore(join(userData, "secrets.bin"), createSafeStorageCipher());

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

    ipcMain.on(IpcSendChannel.ReportReady, (_event, payload: unknown) => {
        console.log(`[main] renderer-ready ${JSON.stringify(payload)}`);

        // smoke 需要等到 renderer 完成 config/workspace 往返后退出。
        if (isSmokeRun && isDataReport(payload)) {
            setTimeout(() => app.quit(), 100);
        }
    });
}

function isDataReport(payload: unknown): boolean {
    return (
        typeof payload === "object" &&
        payload !== null &&
        "phase" in payload &&
        (payload as { phase?: unknown }).phase === "data"
    );
}

function registerIpcHandlers(): void {
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
            workspaces = new WorkspaceStore(next.workspaceRoot, app.getVersion());
            await workspaces.init();
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
            return summary;
        },
    );

    registerHandler(
        IpcChannel.WorkspaceClose,
        async ({ id }: WorkspaceCloseRequest) => {
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
        },
    );

    registerHandler(
        IpcChannel.SecretsDelete,
        async ({ providerId }: SecretsDeleteRequest) => ({
            deleted: await secrets.delete(providerId),
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

    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
