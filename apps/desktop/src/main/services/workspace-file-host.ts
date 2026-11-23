import { createHash } from "node:crypto";
import { FhError } from "@flowharness/contracts";
import type {
    IFileHost,
    StoredAttachment,
    StoredAttachmentMeta,
} from "wireclaw";
import { BlobStore } from "./blob-store";

/**
 * wireclaw `IFileHost` 的 FH 实现。
 *
 * IFileHost 按 contentHash 读写；workspace/session 归属由上层引用表管理。
 * 去重、缓存、索引、GC 策略都在 wireclaw 的 AttachmentFileManager 里，
 * 这里只负责字节与元数据。
 */
export class WorkspaceFileHost implements IFileHost {
    constructor(private readonly blobs: BlobStore) {}

    async read(contentHash: string): Promise<StoredAttachment | undefined> {
        const meta = await this.blobs.stat(contentHash);
        if (!meta) return undefined;

        const content = await this.blobs.get(contentHash);
        if (!content) return undefined;

        return {
            contentHash: meta.hash,
            name: meta.name,
            mimeType: meta.mimeType,
            size: meta.size,
            sourcePaths: meta.sourcePaths ?? [],
            content,
        };
    }

    async readMeta(contentHash: string): Promise<StoredAttachmentMeta | undefined> {
        const meta = await this.blobs.stat(contentHash);
        if (!meta) return undefined;
        return toStoredMeta(meta);
    }

    async write(file: StoredAttachment): Promise<StoredAttachmentMeta> {
        const computed = createHash("sha256").update(file.content).digest("hex");

        if (computed !== file.contentHash) {
            throw new FhError(
                "E_INVALID_ARGUMENT",
                `attachment contentHash mismatch: expected ${file.contentHash}, calculated ${computed}`,
            );
        }

        const meta = await this.blobs.put(file.content, {
            name: file.name,
            mimeType: file.mimeType,
            sourcePaths: file.sourcePaths,
        });

        return toStoredMeta(meta);
    }

    async list(): Promise<readonly StoredAttachmentMeta[]> {
        const metas = await this.blobs.list();
        return metas.map(toStoredMeta);
    }

    async delete(contentHash: string): Promise<boolean> {
        return this.blobs.delete(contentHash);
    }

    async flush(): Promise<void> {
        // 每次写入都已落盘；保留接口以满足 IFileHost。
    }

    async close(): Promise<void> {
        // BlobStore 没有需要释放的句柄。
    }
}

function toStoredMeta(meta: {
    hash: string;
    name: string;
    mimeType: string;
    size: number;
    sourcePaths?: readonly string[];
}): StoredAttachmentMeta {
    return {
        contentHash: meta.hash,
        name: meta.name,
        mimeType: meta.mimeType,
        size: meta.size,
        sourcePaths: meta.sourcePaths ?? [],
    };
}
