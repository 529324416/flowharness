import { AttachmentFileManager } from "wireclaw";
import type { BlobStore } from "./blob-store";
import { WorkspaceFileHost } from "./workspace-file-host";

/**
 * Session 相关服务的装配点。
 *
 * Phase 2 先提供「每个工作区一个 AttachmentFileManager」：
 * - 由 `WorkspaceFileHost` 落到该工作区的 BlobStore；
 * - GraphHost.attachments 直接取用；
 * - 完整的 Session 生命周期（创建/历史/回放）随 Provider 接入一并落地。
 */
export class SessionService {
    private readonly managers = new Map<string, AttachmentFileManager>();

    constructor(private readonly blobsFor: (workspaceId: string) => BlobStore | undefined) {}

    attachmentsFor(workspaceId: string): AttachmentFileManager | undefined {
        const existing = this.managers.get(workspaceId);
        if (existing) return existing;

        const blobs = this.blobsFor(workspaceId);
        if (!blobs) return undefined;

        const manager = new AttachmentFileManager(new WorkspaceFileHost(blobs));
        this.managers.set(workspaceId, manager);
        return manager;
    }

    close(workspaceId: string): void {
        this.managers.delete(workspaceId);
    }
}
