import type { ContentHash, SessionId, WorkspaceId } from "./ids";

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
};

export type WorkspaceSummary = {
    id: WorkspaceId;
    name: string;
    path: string;
    createdAt: string;
    updatedAt: string;
};

/** 工作区内的文档引用。 */
export type DocumentRef =
    | { kind: "harness"; id: string }
    | { kind: "workbench"; id: string };

/** run 的对外状态。 */
export type RunStatus =
    | "idle"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";

/** Blob 的元信息（不包含字节）。 */
export type BlobMeta = {
    hash: ContentHash;
    name: string;
    mimeType: string;
    size: number;
    createdAt: string;
    refs: BlobRef[];
};

export type BlobRef =
    | { kind: "session"; id: SessionId }
    | { kind: "run"; id: string }
    | { kind: "document"; id: string };
