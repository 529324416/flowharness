import { FhError } from "@flowharness/contracts";
import { readJsonFile, writeJsonFile } from "./atomic-file";

/**
 * 对称加密适配器。Electron 侧用 `safeStorage` 实现；测试用假实现。
 * 没有可用实现时必须显式失败，**不允许明文降级**。
 */
export interface SecretCipher {
    isAvailable(): boolean;
    encrypt(value: string): Uint8Array;
    decrypt(value: Uint8Array): string;
}

type SecretsFile = {
    version: 1;
    /** providerId → base64(ciphertext) */
    entries: Record<string, string>;
};

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** 写入结果；受限环境可能只能保存在当前进程内存。 */
export type SecretWriteResult = {
    persisted: boolean;
    error?: string;
};

/** Provider 密钥仓库；只存在于 main，renderer 永远拿不到明文。 */
export class SecretsStore {
    private readonly memory = new Map<string, string>();
    /** 当前会话里已删除的条目；用于在文件不可写时屏蔽旧值。 */
    private readonly deleted = new Set<string>();

    constructor(
        private readonly filePath: string,
        private readonly cipher: SecretCipher,
    ) {}

    async has(providerId: string): Promise<boolean> {
        assertProviderId(providerId);
        if (this.deleted.has(providerId)) return false;
        if (this.memory.has(providerId)) return true;
        const file = await this.load();
        return file.entries[providerId] !== undefined;
    }

    async set(providerId: string, value: string): Promise<SecretWriteResult> {
        assertProviderId(providerId);

        if (typeof value !== "string" || value.length === 0) {
            throw new FhError("E_INVALID_ARGUMENT", "secret value must be a non-empty string");
        }

        if (!this.cipher.isAvailable()) {
            throw new FhError(
                "E_PERMISSION",
                "secure storage is not available on this platform",
            );
        }

        let encrypted: Uint8Array;
        try {
            encrypted = this.cipher.encrypt(value);
        } catch (error) {
            throw new FhError(
                "E_PERMISSION",
                `secure storage encryption failed: ${errorMessage(error)}`,
            );
        }

        const file = await this.load();
        file.entries[providerId] = Buffer.from(encrypted).toString("base64");
        this.deleted.delete(providerId);
        try {
            await this.persist(file);
            this.memory.delete(providerId);
            return { persisted: true };
        } catch (error) {
            // 只读 / 受限环境：当前会话仍可使用，重启后失效。
            this.memory.set(providerId, value);
            return { persisted: false, error: errorMessage(error) };
        }
    }

    /** 仅供 main 内部（Provider 工厂）调用，不暴露 IPC。 */
    async get(providerId: string): Promise<string | undefined> {
        assertProviderId(providerId);
        if (this.deleted.has(providerId)) return undefined;
        const cached = this.memory.get(providerId);
        if (cached !== undefined) return cached;

        const file = await this.load();
        const encoded = file.entries[providerId];
        if (encoded === undefined) return undefined;
        return this.cipher.decrypt(Buffer.from(encoded, "base64"));
    }

    async delete(providerId: string): Promise<boolean> {
        assertProviderId(providerId);
        const hadMemory = this.memory.delete(providerId);

        const file = await this.load();
        const hadFile = file.entries[providerId] !== undefined;
        if (hadFile) {
            delete file.entries[providerId];
            try {
                await this.persist(file);
            } catch {
                // 文件不可写时至少保证当前会话不再使用该密钥。
                this.deleted.add(providerId);
            }
        }
        if (hadMemory) this.deleted.add(providerId);
        return hadMemory || hadFile;
    }

    private async load(): Promise<SecretsFile> {
        let raw: SecretsFile | undefined;
        try {
            raw = await readJsonFile<SecretsFile>(this.filePath);
        } catch (error) {
            throw new FhError(
                "E_IO",
                `cannot read secrets file: ${errorMessage(error)}`,
            );
        }
        if (raw && raw.version === 1 && raw.entries && typeof raw.entries === "object") {
            return raw;
        }
        return { version: 1, entries: {} };
    }

    private async persist(file: SecretsFile): Promise<void> {
        try {
            await writeJsonFile(this.filePath, file);
        } catch (error) {
            throw new FhError(
                "E_IO",
                `cannot write secrets file: ${errorMessage(error)}`,
            );
        }
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function assertProviderId(providerId: string): void {
    if (!PROVIDER_ID_PATTERN.test(providerId)) {
        throw new FhError("E_INVALID_ARGUMENT", `invalid providerId: ${providerId}`);
    }
}
