import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderConfig } from "@flowharness/contracts";
import { SecretsStore, type SecretCipher } from "./secrets";
import {
    createKeyFingerprint,
    legacyKeyId,
    migrateLegacyProviders,
    seedProviderLibraryFromLegacy,
} from "./provider-library-migration";
import { emptyProviderLibrary, ProviderLibraryStore } from "./provider-library-store";

const dirs: string[] = [];

async function makeDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "fh-provider-migration-"));
    dirs.push(dir);
    return dir;
}

const fakeCipher: SecretCipher = {
    isAvailable: () => true,
    encrypt: (value) => new TextEncoder().encode(`enc:${value}`),
    decrypt: (value) => new TextDecoder().decode(value).replace(/^enc:/, ""),
};

const AT = "2026-11-27T00:00:00.000Z";

function legacyProviders(): ProviderConfig[] {
    return [
        {
            id: "ollama",
            kind: "ollama",
            label: "Ollama",
            enabled: true,
            baseUrl: "http://127.0.0.1:11434",
        },
        {
            id: "deepseek",
            kind: "deepseek",
            label: "DeepSeek",
            enabled: false,
            model: "deepseek-chat",
        },
        { id: "qwen", kind: "qwen", label: "Qwen", enabled: true },
        { id: "minimax", kind: "minimax", label: "MiniMax", enabled: true },
    ];
}

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("provider library migration", () => {
    it("preserves provider ids and copies legacy secrets into key records", async () => {
        const dir = await makeDir();
        const secrets = new SecretsStore(join(dir, "secrets.bin"), fakeCipher);
        await secrets.set("deepseek", "sk-deepseek-secret");
        await secrets.set("qwen", "sk-qwen-secret");

        const result = await migrateLegacyProviders({
            library: emptyProviderLibrary(),
            legacyProviders: legacyProviders(),
            secrets,
            now: () => AT,
        });

        expect(result.changed).toBe(true);
        expect(result.warnings).toEqual([]);
        expect(result.library.profiles.map((profile) => profile.id)).toEqual([
            "ollama",
            "deepseek",
            "qwen",
            "minimax",
        ]);

        const byId = new Map(result.library.profiles.map((profile) => [profile.id, profile]));
        expect(byId.get("ollama")).toMatchObject({
            adapter: "ollama.chat",
            enabled: true,
            baseUrl: "http://127.0.0.1:11434",
            models: [],
        });
        expect(byId.get("ollama")?.apiKeyId).toBeUndefined();
        expect(byId.get("deepseek")).toMatchObject({
            adapter: "deepseek.chat",
            enabled: false,
            defaultModelId: "deepseek-chat",
        });
        expect(byId.get("minimax")?.apiKeyId).toBeUndefined();

        expect(result.library.keys).toHaveLength(2);
        const deepseekKeyId = legacyKeyId("deepseek");
        expect(byId.get("deepseek")?.apiKeyId).toBe(deepseekKeyId);
        expect(result.library.keys.find((key) => key.id === deepseekKeyId)).toMatchObject({
            protocol: "deepseek",
            status: "unverified",
            fingerprint: createKeyFingerprint("sk-deepseek-secret"),
        });

        // 密钥确实被复制到新 id，且库文件里没有明文。
        expect(await secrets.get(deepseekKeyId)).toBe("sk-deepseek-secret");
        expect(JSON.stringify(result.library)).not.toContain("sk-deepseek-secret");
        expect(JSON.stringify(result.library)).not.toContain("sk-qwen-secret");
    });

    it("is idempotent and does not overwrite an existing profile", async () => {
        const dir = await makeDir();
        const secrets = new SecretsStore(join(dir, "secrets.bin"), fakeCipher);
        await secrets.set("deepseek", "sk-deepseek-secret");

        const first = await migrateLegacyProviders({
            library: emptyProviderLibrary(),
            legacyProviders: legacyProviders(),
            secrets,
            now: () => AT,
        });

        const custom = {
            ...first.library.profiles.find((profile) => profile.id === "deepseek")!,
            label: "自定义 DeepSeek",
            updatedAt: "2026-11-27T01:00:00.000Z",
        };
        const withCustom = {
            ...first.library,
            profiles: first.library.profiles.map((profile) =>
                profile.id === "deepseek" ? custom : profile,
            ),
        };

        const second = await migrateLegacyProviders({
            library: withCustom,
            legacyProviders: legacyProviders(),
            secrets,
            now: () => AT,
        });

        expect(second.changed).toBe(false);
        expect(second.library.profiles.find((profile) => profile.id === "deepseek")).toBe(
            custom,
        );
        expect(second.library.keys).toHaveLength(1);
    });

    it("seeds the library file only once", async () => {
        const dir = await makeDir();
        const secrets = new SecretsStore(join(dir, "secrets.bin"), fakeCipher);
        const store = new ProviderLibraryStore(join(dir, "provider-library.json"));

        const first = await seedProviderLibraryFromLegacy({
            store,
            secrets,
            legacyProviders: legacyProviders(),
            now: () => AT,
        });
        expect(first.created).toBe(true);
        expect(await store.exists()).toBe(true);
        expect((await store.load()).profiles).toHaveLength(4);

        const second = await seedProviderLibraryFromLegacy({
            store,
            secrets,
            legacyProviders: [],
            now: () => AT,
        });
        expect(second.created).toBe(false);
        expect((await store.load()).profiles).toHaveLength(4);
    });

    it("keeps the profile when the legacy secret cannot be read", async () => {
        const secrets = {
            get: async () => {
                throw new Error("safe storage unavailable");
            },
            set: async () => {
                throw new Error("safe storage unavailable");
            },
        };

        const result = await migrateLegacyProviders({
            library: emptyProviderLibrary(),
            legacyProviders: legacyProviders(),
            secrets,
            now: () => AT,
        });

        expect(result.warnings).toHaveLength(3);
        expect(result.library.profiles).toHaveLength(4);
        expect(result.library.keys).toEqual([]);
        expect(result.library.profiles.find((profile) => profile.id === "qwen")?.apiKeyId).toBeUndefined();
    });

    it("writes no plaintext secret to the library file", async () => {
        const dir = await makeDir();
        const secrets = new SecretsStore(join(dir, "secrets.bin"), fakeCipher);
        await secrets.set("deepseek", "sk-plain-secret");
        const file = join(dir, "provider-library.json");
        const store = new ProviderLibraryStore(file);

        await seedProviderLibraryFromLegacy({
            store,
            secrets,
            legacyProviders: legacyProviders(),
            now: () => AT,
        });

        const raw = await readFile(file, "utf8");
        expect(raw).not.toContain("sk-plain-secret");
        expect(raw).toContain("key_deepseek");
    });
});
