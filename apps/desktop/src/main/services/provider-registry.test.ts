import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
    ProviderAdapterKind,
    ProviderConfig,
    ProviderLibrary,
} from "@flowharness/contracts";
import {
    SessionError,
    SessionErrorType,
    type AIProvider,
} from "wireclaw";
import { FhError } from "@flowharness/contracts";
import {
    ProviderRegistry,
    type ProviderFactory,
} from "./provider-registry";
import { ProviderLibraryStore } from "./provider-library-store";
import type { SecretsStore } from "./secrets";

const dirs: string[] = [];

async function makeDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "fh-provider-registry-"));
    dirs.push(dir);
    return dir;
}

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const AT = "2026-11-27T00:00:00.000Z";

function fakeSecrets(entries: Record<string, string>): SecretsStore {
    return {
        has: async (id: string) => entries[id] !== undefined,
        get: async (id: string) => entries[id],
        set: async (id: string, value: string) => {
            entries[id] = value;
            return { persisted: true };
        },
        delete: async (id: string) => {
            const existed = entries[id] !== undefined;
            delete entries[id];
            return existed;
        },
    } as unknown as SecretsStore;
}

function fakeProvider(id: string, failure?: unknown): AIProvider {
    return {
        title: id,
        modelProvider: {
            availableModels: null,
            initModels: async () => {
                if (failure !== undefined) throw failure;
                return [{ id: `${id}-model`, name: `${id} model` }];
            },
        },
    } as unknown as AIProvider;
}

function factories(failure?: unknown): Record<ProviderAdapterKind, ProviderFactory> {
    const factory: ProviderFactory = (profile) => fakeProvider(profile.id, failure);
    return {
        "deepseek.chat": factory,
        "qwen.chat": factory,
        "qwen.image": factory,
        "minimax.chat": factory,
        "minimax.image": factory,
        "minimax.video": factory,
        "ollama.chat": factory,
    };
}

function library(): ProviderLibrary {
    return {
        schemaVersion: 1,
        keys: [
            {
                id: "key_ds",
                protocol: "deepseek",
                label: "DeepSeek",
                status: "unverified",
                createdAt: AT,
                updatedAt: AT,
            },
        ],
        profiles: [
            {
                id: "ollama",
                label: "Ollama",
                adapter: "ollama.chat",
                enabled: true,
                models: [],
                createdAt: AT,
                updatedAt: AT,
            },
            {
                id: "deepseek",
                label: "DeepSeek",
                adapter: "deepseek.chat",
                apiKeyId: "key_ds",
                enabled: true,
                models: [],
                createdAt: AT,
                updatedAt: AT,
            },
            {
                id: "deepseek-off",
                label: "DeepSeek off",
                adapter: "deepseek.chat",
                apiKeyId: "key_ds",
                enabled: false,
                models: [],
                createdAt: AT,
                updatedAt: AT,
            },
        ],
    };
}

async function makeRegistry(options: {
    library?: ProviderLibrary;
    secrets?: Record<string, string>;
    failure?: unknown;
} = {}): Promise<{
    registry: ProviderRegistry;
    secrets: SecretsStore;
}> {
    const dir = await makeDir();
    const store = new ProviderLibraryStore(join(dir, "provider-library.json"));
    await store.save(options.library ?? library());
    const secrets = fakeSecrets(options.secrets ?? { key_ds: "sk-secret" });
    const registry = new ProviderRegistry(store, secrets, factories(options.failure));
    await registry.init();
    return { registry, secrets };
}

describe("ProviderRegistry", () => {
    it("resolves enabled profiles and requires only real keys", async () => {
        const { registry } = await makeRegistry();

        expect(registry.get("ollama")?.title).toBe("ollama");
        expect(registry.get("deepseek")?.title).toBe("deepseek");
        expect(registry.get("deepseek-off")).toBeUndefined();

        const list = registry.list();
        expect(list.find((item) => item.id === "ollama")).toMatchObject({
            kind: "ollama",
            hasKey: true,
            available: true,
        });
        expect(list.find((item) => item.id === "deepseek")).toMatchObject({
            kind: "deepseek",
            hasKey: true,
            available: true,
        });
    });

    it("marks a profile without its secret as missing key", async () => {
        const { registry } = await makeRegistry({ secrets: {} });
        expect(registry.get("deepseek")).toBeUndefined();
        expect(registry.list().find((item) => item.id === "deepseek")).toMatchObject({
            hasKey: false,
            available: false,
            error: "缺少 API Key",
        });
    });

    it("refreshes and persists the model catalog, and marks the key active", async () => {
        const { registry } = await makeRegistry();
        await expect(registry.test("deepseek")).resolves.toEqual({
            ok: true,
            models: ["deepseek-model"],
        });

        const view = registry.view();
        const profile = view.profiles.find((item) => item.profile.id === "deepseek");
        expect(profile?.profile.models.map((model) => model.id)).toEqual([
            "deepseek-model",
        ]);
        expect(profile?.profile.modelsSource).toBe("api");
        expect(profile?.keyStatus).toBe("active");
    });

    it("classifies auth failures and invalidates only that key", async () => {
        const failure = new SessionError(
            SessionErrorType.ProviderError,
            "deepseek returned HTTP 401",
            undefined,
            401,
        );
        const { registry, secrets } = await makeRegistry({ failure });

        const result = await registry.test("deepseek");
        expect(result.ok).toBe(false);
        expect(result.error).toContain("401");

        const profile = registry.view().profiles.find(
            (item) => item.profile.id === "deepseek",
        );
        expect(profile?.keyStatus).toBe("invalid");
        expect(profile?.keyError?.kind).toBe("auth");
        // 失效 key 仍可构造 Provider，只是健康状态为 invalid。
        expect(registry.get("deepseek")).toBeDefined();
        expect(await secrets.has("key_ds")).toBe(true);
    });

    it("adds a key with validation and never exposes the plaintext", async () => {
        const { registry, secrets } = await makeRegistry();
        const result = await registry.addKey({
            protocol: "deepseek",
            label: "Second",
            apiKey: "sk-second-secret",
        });

        expect(result.validation.status).toBe("active");
        expect(result.persisted).toBe(true);
        expect(result.key.fingerprint).toBeDefined();
        expect(result.key.status).toBe("active");
        expect(await secrets.get(result.key.id)).toBe("sk-second-secret");
        expect(JSON.stringify(registry.view())).not.toContain("sk-second-secret");
    });

    it("keeps a newly added key in memory when the library cannot be written", async () => {
        const dir = await makeDir();
        const store = new ProviderLibraryStore(join(dir, "provider-library.json"));
        await store.save(library());
        const secrets = fakeSecrets({ key_ds: "sk-secret" });
        const registry = new ProviderRegistry(store, secrets, factories());
        await registry.init();

        store.save = async () => {
            throw new FhError("E_IO", "disk is read-only");
        };

        const result = await registry.addKey({
            protocol: "deepseek",
            label: "Session only",
            apiKey: "sk-session-secret",
        });

        expect(result.persisted).toBe(false);
        expect(result.persistenceError).toContain("read-only");
        expect(registry.view().keys.some((key) => key.id === result.key.id)).toBe(true);
    });

    it("keeps profile edits in memory when the library cannot be written", async () => {
        const dir = await makeDir();
        const store = new ProviderLibraryStore(join(dir, "provider-library.json"));
        await store.save(library());
        const secrets = fakeSecrets({ key_ds: "sk-secret" });
        const registry = new ProviderRegistry(store, secrets, factories());
        await registry.init();

        store.save = async () => {
            throw new FhError("E_IO", "disk is read-only");
        };

        await registry.updateProfile({
            id: "deepseek",
            patch: { enabled: false },
        });

        const status = registry
            .view()
            .profiles.find((item) => item.profile.id === "deepseek");
        expect(status?.profile.enabled).toBe(false);
        expect(registry.view().persistenceError).toContain("read-only");
    });

    it("refuses to delete a key that is still referenced by a profile", async () => {
        const { registry } = await makeRegistry();
        await expect(registry.deleteKey("key_ds")).rejects.toMatchObject({
            code: "E_CONFLICT",
        });
    });

    it("records runtime auth errors on the referenced key", async () => {
        const { registry } = await makeRegistry();
        const changed = await registry.recordRuntimeProviderError("deepseek", 401);

        expect(changed).toBe(true);
        const profile = registry.view().profiles.find(
            (item) => item.profile.id === "deepseek",
        );
        expect(profile?.keyStatus).toBe("invalid");
    });

    it("keeps the old settings bridge working against the library", async () => {
        const { registry } = await makeRegistry();
        const configs: ProviderConfig[] = [
            {
                id: "deepseek",
                kind: "deepseek",
                label: "DeepSeek 改名",
                enabled: true,
                model: "deepseek-chat",
            },
        ];

        await registry.applyLegacyProviders(configs);
        expect(registry.view().profiles.find((item) => item.profile.id === "deepseek"))
            .toMatchObject({
                profile: {
                    label: "DeepSeek 改名",
                    defaultModelId: "deepseek-chat",
                },
            });

        await registry.setLegacySecret("deepseek", "sk-new");
        expect(await registry.legacyHasKey("deepseek")).toBe(true);
        expect(registry.view().profiles.find((item) => item.profile.id === "deepseek"))
            .toMatchObject({ keyStatus: "unverified" });
    });

    it("removes v1 provider-id secrets only after the new key exists", async () => {
        const { registry, secrets } = await makeRegistry();
        await secrets.set("deepseek", "sk-legacy");

        await registry.removeLegacySecrets([
            {
                id: "deepseek",
                kind: "deepseek",
                label: "DeepSeek",
                enabled: true,
            },
        ]);

        expect(await secrets.has("deepseek")).toBe(false);
        expect(await secrets.has("key_ds")).toBe(true);
    });
});
