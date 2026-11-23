/**
 * 领域标识。
 *
 * 全部是字符串，因为它们在 JSON 文档、IPC 与日志之间流转；
 * 不要用展示名（title/name）代替 id。
 */
export type WorkspaceId = string;
export type GraphId = string;
export type WorkbenchId = string;
export type RunId = string;
export type SessionId = string;
/** 内容寻址哈希（BlobStore / IFileHost 的 contentHash）。 */
export type ContentHash = string;
