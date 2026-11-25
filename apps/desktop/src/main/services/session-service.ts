import { join } from "node:path";
import { AttachmentFileManager } from "wireclaw";
import type { BlobStore } from "./blob-store";
import { SessionStore } from "./session-store";
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
    private readonly stores = new Map<string, SessionStore>();

    constructor(
        private readonly blobsFor: (workspaceId: string) => BlobStore | undefined,
        private readonly dirFor: (workspaceId: string) => string | undefined,
        private readonly settingsFor?: (
            workspaceId: string,
        ) => { draftSessionFolderId?: string | null },
        private readonly updateSettings?: (
            workspaceId: string,
            patch: { draftSessionFolderId?: string | null },
        ) => Promise<void>,
    ) {}

    attachmentsFor(workspaceId: string): AttachmentFileManager | undefined {
        const existing = this.managers.get(workspaceId);
        if (existing) return existing;

        const blobs = this.blobsFor(workspaceId);
        if (!blobs) return undefined;

        const manager = new AttachmentFileManager(new WorkspaceFileHost(blobs));
        this.managers.set(workspaceId, manager);
        return manager;
    }

    sessionsFor(workspaceId: string): SessionStore | undefined {
        const existing = this.stores.get(workspaceId);
        if (existing) return existing;
        const dir = this.dirFor(workspaceId);
        if (dir === undefined) return undefined;
        const store = new SessionStore(join(dir, "sessions"), {
            getSettings: () => this.settingsFor?.(workspaceId) ?? {},
            updateSettings: (patch) =>
                this.updateSettings?.(workspaceId, patch) ?? Promise.resolve(),
        });
        this.stores.set(workspaceId, store);
        return store;
    }

    close(workspaceId: string): void {
        this.managers.delete(workspaceId);
        this.stores.delete(workspaceId);
    }
}
