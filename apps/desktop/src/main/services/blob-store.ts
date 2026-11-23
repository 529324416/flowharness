import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { FhError, type BlobMeta, type BlobRef } from "@flowharness/contracts";
import { readJsonFile, writeFileAtomic, writeJsonFile } from "./atomic-file";

const HASH_PATTERN = /^[a-f0-9]{64}$/;

type BlobRecord = {
    name: string;
    mimeType: string;
    size: number;
    createdAt: string;
    refs: BlobRef[];
    sourcePaths: string[];
};

type BlobIndex = {
    version: 1;
    objects: Record<string, BlobRecord>;
};

export type BlobPutOptions = {
    name: string;
    mimeType?: string;
    sourcePaths?: readonly string[];
};

/**
 * 内容寻址的二进制存储（工作区级）。
 *
 * 布局：`objects/<hash[0:2]>/<hash>` + `objects/index.json`。
 * 索引只是缓存；对象文件名即哈希，可随时重建。
 */
export class BlobStore {
    private index?: BlobIndex;
    private queue: Promise<void> = Promise.resolve();

    constructor(private readonly root: string) {}

    async put(bytes: Uint8Array, options: BlobPutOptions): Promise<BlobMeta> {
        if (!(bytes instanceof Uint8Array)) {
            throw new FhError("E_INVALID_ARGUMENT", "blob content must be a Uint8Array");
        }

        const hash = hashBytes(bytes);
        const target = this.objectPath(hash);

        if (!(await this.exists(target))) {
            await writeFileAtomic(target, bytes);
        }

        return this.withIndex((index) => {
            const existing = index.objects[hash];

            if (existing) {
                // 与 wireclaw 的约定一致：名称/MIME 首次写入为准，来源路径取并集。
                existing.sourcePaths = unionPaths(
                    existing.sourcePaths,
                    options.sourcePaths ?? [],
                );
                return toMeta(hash, existing);
            }

            const record: BlobRecord = {
                name: options.name,
                mimeType: options.mimeType ?? "application/octet-stream",
                size: bytes.byteLength,
                createdAt: new Date().toISOString(),
                refs: [],
                sourcePaths: [...(options.sourcePaths ?? [])],
            };

            index.objects[hash] = record;
            return toMeta(hash, record);
        });
    }

    async get(hash: string): Promise<Uint8Array | undefined> {
        assertHash(hash);

        try {
            return new Uint8Array(await fs.readFile(this.objectPath(hash)));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
        }
    }

    async has(hash: string): Promise<boolean> {
        assertHash(hash);
        return this.exists(this.objectPath(hash));
    }

    async stat(hash: string): Promise<BlobMeta | undefined> {
        assertHash(hash);
        const index = await this.load();
        const record = index.objects[hash];
        return record ? toMeta(hash, record) : undefined;
    }

    async list(): Promise<readonly BlobMeta[]> {
        const index = await this.load();
        return Object.entries(index.objects)
            .map(([hash, record]) => toMeta(hash, record))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    async delete(hash: string): Promise<boolean> {
        assertHash(hash);

        const existed = await this.withIndex((index) => {
            if (index.objects[hash] === undefined) return false;
            delete index.objects[hash];
            return true;
        });

        if (existed) {
            await fs.rm(this.objectPath(hash), { force: true });
        }

        return existed;
    }

    async addRef(hash: string, ref: BlobRef): Promise<BlobMeta | undefined> {
        assertHash(hash);

        return this.withIndex((index) => {
            const record = index.objects[hash];
            if (!record) return undefined;
            if (!record.refs.some((item) => sameRef(item, ref))) {
                record.refs.push(ref);
            }
            return toMeta(hash, record);
        });
    }

    async removeRef(hash: string, ref: BlobRef): Promise<BlobMeta | undefined> {
        assertHash(hash);

        return this.withIndex((index) => {
            const record = index.objects[hash];
            if (!record) return undefined;
            record.refs = record.refs.filter((item) => !sameRef(item, ref));
            return toMeta(hash, record);
        });
    }

    /** 扫描对象目录补齐索引（索引丢失/损坏时使用）。返回新增条数。 */
    async rebuildIndex(): Promise<number> {
        const found: { hash: string; size: number }[] = [];

        try {
            const buckets = await fs.readdir(this.root, { withFileTypes: true });
            for (const bucket of buckets) {
                if (!bucket.isDirectory()) continue;
                const files = await fs.readdir(join(this.root, bucket.name));
                for (const file of files) {
                    if (!HASH_PATTERN.test(file)) continue;
                    const stat = await fs.stat(this.objectPath(file));
                    found.push({ hash: file, size: stat.size });
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
            throw error;
        }

        let added = 0;

        await this.withIndex((index) => {
            for (const { hash, size } of found) {
                if (index.objects[hash]) continue;
                index.objects[hash] = {
                    name: hash,
                    mimeType: "application/octet-stream",
                    size,
                    createdAt: new Date().toISOString(),
                    refs: [],
                    sourcePaths: [],
                };
                added += 1;
            }
        });

        return added;
    }

    /** 删除不在引用根集合中的对象，返回被删除的哈希。 */
    async gc(referenced: readonly string[]): Promise<string[]> {
        const keep = new Set(referenced);
        const removed: string[] = [];

        await this.withIndex((index) => {
            for (const hash of Object.keys(index.objects)) {
                if (keep.has(hash)) continue;
                delete index.objects[hash];
                removed.push(hash);
            }
        });

        for (const hash of removed) {
            await fs.rm(this.objectPath(hash), { force: true });
        }

        return removed;
    }

    private get indexPath(): string {
        return join(this.root, "index.json");
    }

    private objectPath(hash: string): string {
        return join(this.root, hash.slice(0, 2), hash);
    }

    private async load(): Promise<BlobIndex> {
        if (this.index) return this.index;

        const raw = await readJsonFile<BlobIndex>(this.indexPath).catch(() => undefined);
        this.index =
            raw && raw.version === 1 && raw.objects && typeof raw.objects === "object"
                ? raw
                : { version: 1, objects: {} };

        return this.index;
    }

    private async withIndex<T>(mutate: (index: BlobIndex) => T): Promise<T> {
        let result!: T;

        const run = this.queue.then(async () => {
            const index = await this.load();
            result = mutate(index);
            await writeJsonFile(this.indexPath, index);
        });

        this.queue = run.then(
            () => undefined,
            () => undefined,
        );

        await run;
        return result;
    }

    private async exists(path: string): Promise<boolean> {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }
}

function hashBytes(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

function assertHash(hash: string): void {
    if (!HASH_PATTERN.test(hash)) {
        throw new FhError("E_INVALID_ARGUMENT", `invalid content hash: ${hash}`);
    }
}

function toMeta(hash: string, record: BlobRecord): BlobMeta {
    return {
        hash,
        name: record.name,
        mimeType: record.mimeType,
        size: record.size,
        createdAt: record.createdAt,
        refs: [...record.refs],
        sourcePaths: [...record.sourcePaths],
    };
}

function sameRef(a: BlobRef, b: BlobRef): boolean {
    return a.kind === b.kind && a.id === b.id;
}

function unionPaths(
    existing: readonly string[],
    incoming: readonly string[],
): string[] {
    return [...new Set([...existing, ...incoming])];
}

// 供测试与诊断使用
export const __blobInternals = { hashBytes, HASH_PATTERN };
