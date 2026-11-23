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

/** Provider 密钥仓库；只存在于 main，renderer 永远拿不到明文。 */
export class SecretsStore {
    constructor(
        private readonly filePath: string,
        private readonly cipher: SecretCipher,
    ) {}

    async has(providerId: string): Promise<boolean> {
        assertProviderId(providerId);
        const file = await this.load();
        return file.entries[providerId] !== undefined;
    }

    async set(providerId: string, value: string): Promise<void> {
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

        const file = await this.load();
        file.entries[providerId] = Buffer.from(
            this.cipher.encrypt(value),
        ).toString("base64");
        await this.persist(file);
    }

    /** 仅供 main 内部（Provider 工厂）调用，不暴露 IPC。 */
    async get(providerId: string): Promise<string | undefined> {
        assertProviderId(providerId);
        const file = await this.load();
        const encoded = file.entries[providerId];
        if (encoded === undefined) return undefined;
        return this.cipher.decrypt(Buffer.from(encoded, "base64"));
    }

    async delete(providerId: string): Promise<boolean> {
        assertProviderId(providerId);
        const file = await this.load();
        if (file.entries[providerId] === undefined) return false;
        delete file.entries[providerId];
        await this.persist(file);
        return true;
    }

    private async load(): Promise<SecretsFile> {
        const raw = await readJsonFile<SecretsFile>(this.filePath);
        if (raw && raw.version === 1 && raw.entries && typeof raw.entries === "object") {
            return raw;
        }
        return { version: 1, entries: {} };
    }

    private async persist(file: SecretsFile): Promise<void> {
        await writeJsonFile(this.filePath, file);
    }
}

function assertProviderId(providerId: string): void {
    if (!PROVIDER_ID_PATTERN.test(providerId)) {
        throw new FhError("E_INVALID_ARGUMENT", `invalid providerId: ${providerId}`);
    }
}
