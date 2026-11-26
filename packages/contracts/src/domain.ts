import type { ContentHash, SessionId, WorkspaceId } from "./ids";
import type { ProviderConfig } from "./provider";

/** 主题模式；`system` 跟随操作系统。 */
export type ThemeMode = "light" | "dark" | "system";
/** 实际生效的主题（`system` 解析后的结果）。 */
export type ResolvedTheme = "light" | "dark";

export type AppInfo = {
    name: string;
    version: string;
    electron: string;
    node: string;
    chrome: string;
    platform: string;
};

export type RecentWorkspace = {
    id: WorkspaceId;
    path: string;
    name: string;
    openedAt: string;
};

/**
 * 应用级配置（主进程持有，renderer 经 IPC 读写）。
 * 与工作区设置、Provider 密钥严格分离。
 */
export type AppConfig = {
    schemaVersion: 1;
    theme: ThemeMode;
    workspaceRoot: string;
    recentWorkspaces: RecentWorkspace[];
    language: "zh-CN" | "en-US";
    devtools: boolean;
    providers: ProviderConfig[];
};

/** `config:update` 的增量；schemaVersion 只能由主进程维护。 */
export type AppConfigUpdate = Partial<
    Pick<
        AppConfig,
        "theme" | "workspaceRoot" | "language" | "devtools" | "providers"
    >
>;

export type WorkspaceSummary = {
    id: WorkspaceId;
    name: string;
    path: string;
    createdAt: string;
    updatedAt: string;
};

/** 新建工作区的请求。 */
export type WorkspaceCreateInput = { name: string };

/** 工作区内的文档引用。 */
export type DocumentRef =
    | { kind: "harness"; id: string }
    | { kind: "workbench"; id: string }
    /** 工作区级节点预设库（documents/presets/<id>.json）。 */
    | { kind: "presetLibrary"; id: string };

/**
 * 文档快照。
 *
 * `revision` 是文件内容的 SHA-256，用作乐观并发的 baseRevision；
 * `document` 是纯 JSON，main 侧仍会用 wireclaw 校验 GraphDocument 语义。
 */
export type DocumentSnapshot = {
    ref: DocumentRef;
    revision: string;
    document: unknown;
};

/** 保存成功后的新 revision；renderer 用它继续下一次保存。 */
export type DocumentSaveResult = {
    revision: string;
    updatedAt: string;
};

/** 工作区内一份 Harness 文档的摘要（多图切换用）。 */
export type HarnessDocumentSummary = {
    id: string;
    title: string;
    updatedAt: string;
    size: number;
};

/** run 的对外状态。 */
export type RunStatus =
    | "idle"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled"
    /** 进程异常退出后标记；之后可能从 checkpoint 恢复。 */
    | "interrupted";

/** Blob 的元信息（不包含字节）。 */
export type BlobMeta = {
    hash: ContentHash;
    name: string;
    mimeType: string;
    size: number;
    createdAt: string;
    refs: BlobRef[];
    /** 附件原始来源路径（wireclaw 用于恢复宿主文件）。 */
    sourcePaths?: readonly string[];
};

export type BlobRef =
    | { kind: "session"; id: SessionId }
    | { kind: "run"; id: string }
    | { kind: "document"; id: string };

/** 窗口状态（main → renderer 广播）。 */
export type WindowStatePayload = {
    maximized: boolean;
};

/** S0 窗口模式；后续可收敛为固定 frameless + 材质配置。 */
export type WindowMode =
    | "standard"
    | "frameless"
    | "overlay"
    | "mica"
    | "acrylic"
    | "transparent"
    | "simulated";
