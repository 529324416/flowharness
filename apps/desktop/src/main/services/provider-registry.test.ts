import { describe, expect, it } from "vitest";
import type { AIProvider } from "wireclaw";
import type { ProviderConfig, ProviderKind } from "@flowharness/contracts";
import { ProviderRegistry, type ProviderFactory } from "./provider-registry";
import type { SecretsStore } from "./secrets";

function fakeSecrets(entries: Record<string, string>): SecretsStore {
    return {
        has: async (id: string) => entries[id] !== undefined,
        get: async (id: string) => entries[id],
    } as unknown as SecretsStore;
}

function fakeProvider(id: string): AIProvider {
    return {
        title: id,
        modelProvider: {
            availableModels: null,
            initModels: async () => [{ id: `${id}-model` }],
        },
    } as unknown as AIProvider;
}

function factories(): Record<ProviderKind, ProviderFactory> {
    const factory: ProviderFactory = (config) => fakeProvider(config.id);
    return {
        deepseek: factory,
        ollama: factory,
        minimax: factory,
        qwen: factory,
    };
}

const ollama: ProviderConfig = {
    id: "ollama",
    kind: "ollama",
    label: "Ollama",
    enabled: true,
};

const deepseek: ProviderConfig = {
    id: "deepseek",
    kind: "deepseek",
    label: "DeepSeek",
    enabled: true,
};

describe("ProviderRegistry", () => {
    it("resolves enabled providers without requiring a key for Ollama", async () => {
        const registry = new ProviderRegistry(fakeSecrets({}), factories());
        await registry.reload([ollama, deepseek]);

        expect(registry.get("ollama")?.title).toBe("ollama");
        expect(registry.get("deepseek")).toBeUndefined();

        const status = registry.list();
        expect(status.find((item) => item.id === "ollama")).toMatchObject({
            hasKey: true,
            available: true,
        });
        expect(status.find((item) => item.id === "deepseek")).toMatchObject({
            hasKey: false,
            available: false,
            error: "缺少 API Key",
        });
    });

    it("uses a stored key and caches models after test()", async () => {
        const registry = new ProviderRegistry(
            fakeSecrets({ deepseek: "secret" }),
            factories(),
        );
        await registry.reload([deepseek]);
        expect(registry.get("deepseek")?.title).toBe("deepseek");

        await expect(registry.test("deepseek")).resolves.toEqual({
            ok: true,
            models: ["deepseek-model"],
        });
        expect(registry.list()[0]?.models).toEqual(["deepseek-model"]);
    });

    it("does not construct disabled providers", async () => {
        const registry = new ProviderRegistry(fakeSecrets({}), factories());
        await registry.reload([{ ...ollama, enabled: false }]);

        expect(registry.get("ollama")).toBeUndefined();
        expect(registry.list()[0]?.available).toBe(false);
    });
});
