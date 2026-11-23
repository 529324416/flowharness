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
    type RunResumeRequest,
    type RunStartRequest,
    type SecretsDeleteRequest,
    type SecretsHasRequest,
    type SecretsSetRequest,
    type UserInputRequestPayload,
    type UserInputResponseRequest,
    type WorkspaceCloseRequest,
    type WorkspaceCreateInput,
    type WorkspaceExportRequest,
    type WorkspaceImportRequest,
    type WorkspaceOpenRequest,
} from "@flowharness/contracts";
// Wireclaw 以普通包依赖方式引入；这里做启动自检并复用其类型。
import { Graph, type ToolApprovalDecision, type UserInputResult } from "wireclaw";
import { registerAssetProtocol, registerAssetScheme } from "./platform/asset-protocol";
import { registerHandler } from "./platform/ipc";
import { RequestBroker } from "./platform/request-broker";
import { AppConfigStore, createDefaultAppConfig } from "./services/app-config";
import { RunStore } from "./services/run-store";
import { RuntimeHost } from "./services/runtime-host";
import { SecretsStore, type SecretCipher } from "./services/secrets";
import { SessionService } from "./services/session-service";
import { WorkspaceStore } from "./services/workspace-store";

// 必须在 app ready 之前注册。
registerAssetScheme();

const isSmokeRun = process.env.FLOWHARNESS_SMOKE === "1";
const APPROVAL_TIMEOUT_MS = 5 * 60_000;

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
let sessionService: SessionService;
let runtime: RuntimeHost;
const runStores = new Map<string, RunStore>();

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
        approvalBroker.settleAll("deny");
        inputBroker.settleAll({ requestId: "", answers: [], cancelled: true });
    });

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

    sessionService = new SessionService((workspaceId) =>
        workspaces.getBlobStore(workspaceId),
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
        attachmentsFor: (workspaceId) => sessionService.attachmentsFor(workspaceId),
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
        IpcChannel.WorkspaceClose,
        async ({ id }: WorkspaceCloseRequest) => {
            sessionService.close(id);
            runStores.delete(id);
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

    registerHandler(IpcChannel.RunList, ({ workspaceId }: RunListRequest) =>
        runtime.list(workspaceId),
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

    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
