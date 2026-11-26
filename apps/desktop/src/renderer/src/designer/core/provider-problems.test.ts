import { describe, expect, it } from "vitest";
import type { ProviderLibraryView } from "@flowharness/contracts";
import type { GraphDocument } from "wireclaw";
import { collectProviderProblems } from "./provider-problems";

const AT = "2026-11-27T00:00:00.000Z";

function graph(providerId = "p", modelId = "model-a"): GraphDocument {
    return {
        version: 1,
        id: "graph",
        nodes: [
            {
                id: "model",
                type: "core.model",
                typeVersion: 1,
                config: { providerId, modelId },
            },
        ],
        edges: [],
        ui: {},
    } as unknown as GraphDocument;
}

function providerGraph(
    providerId = "p",
    sourceType = "core.provider",
): GraphDocument {
    return {
        version: 1,
        id: "provider-graph",
        nodes: [
            {
                id: "provider",
                type: sourceType,
                typeVersion: 1,
                config: { providerId },
            },
            {
                id: "model",
                type: "core.model",
                typeVersion: 1,
                config: { modelId: "model-a" },
            },
        ],
        edges: [
            {
                from: { nodeId: "provider", port: "provider" },
                to: { nodeId: "model", port: "provider" },
            },
        ],
        ui: {},
    } as unknown as GraphDocument;
}

function modelCallGraph(
    mode: string,
    modality?: string,
): GraphDocument {
    return {
        version: 1,
        id: "model-call-graph",
        nodes: [
            {
                id: "model",
                type: "core.model",
                typeVersion: 1,
                config: { providerId: "p", modelId: "model-a" },
            },
            {
                id: "call",
                type: "core.model.call",
                typeVersion: 1,
                config: { mode, ...(modality === undefined ? {} : { modality }) },
            },
        ],
        edges: [
            {
                from: { nodeId: "model", port: "model" },
                to: { nodeId: "call", port: "model" },
            },
        ],
        ui: {},
    } as unknown as GraphDocument;
}

function view(overrides: Partial<ProviderLibraryView> = {}): ProviderLibraryView {
    return {
        keys: [
            {
                id: "key_p",
                protocol: "deepseek",
                label: "Key",
                status: "active",
                createdAt: AT,
                updatedAt: AT,
            },
        ],
        profiles: [
            {
                profile: {
                    id: "p",
                    label: "Provider",
                    adapter: "deepseek.chat",
                    apiKeyId: "key_p",
                    enabled: true,
                    models: [
                        {
                            id: "model-a",
                            name: "Model A",
                            capabilities: { chat: true },
                        },
                    ],
                    createdAt: AT,
                    updatedAt: AT,
                },
                available: true,
                hasKey: true,
                keyStatus: "active",
            },
        ],
        ...overrides,
    };
}

describe("provider problems", () => {
    it("reports nothing for a healthy binding", () => {
        expect(collectProviderProblems(graph(), view())).toEqual([]);
    });

    it("reports a missing provider as an error", () => {
        const problems = collectProviderProblems(graph("missing"), view());
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatchObject({
            source: "provider",
            severity: "error",
            nodeId: "model",
        });
    });

    it("reports disabled providers and missing keys as errors", () => {
        const disabled = view();
        disabled.profiles[0]!.profile.enabled = false;
        expect(collectProviderProblems(graph(), disabled)[0]?.message).toContain(
            "已禁用",
        );

        const missingKey = view();
        missingKey.profiles[0]!.hasKey = false;
        missingKey.profiles[0]!.keyStatus = undefined;
        missingKey.profiles[0]!.available = false;
        expect(collectProviderProblems(graph(), missingKey)[0]?.message).toContain(
            "缺少 API Key",
        );
    });

    it("treats an invalid key as a warning but a missing model as an error", () => {
        const invalid = view();
        invalid.profiles[0]!.keyStatus = "invalid";
        invalid.profiles[0]!.keyError = {
            kind: "auth",
            message: "HTTP 401",
            at: AT,
        };
        const keyProblems = collectProviderProblems(graph(), invalid);
        expect(keyProblems).toHaveLength(1);
        expect(keyProblems[0]).toMatchObject({ severity: "warning", source: "provider" });

        const missingModel = collectProviderProblems(graph("p", "other"), view());
        expect(missingModel).toHaveLength(1);
        expect(missingModel[0]).toMatchObject({ severity: "error" });
        expect(missingModel[0]?.message).toContain("不在 Provider");
    });

    it("does not flag an unknown model when the catalog is still empty", () => {
        const empty = view();
        empty.profiles[0]!.profile.models = [];
        expect(collectProviderProblems(graph("p", "anything"), empty)).toEqual([]);
    });

    it("uses the Provider node as the source of a connected Model", () => {
        expect(collectProviderProblems(providerGraph(), view())).toEqual([]);

        const missing = collectProviderProblems(providerGraph("missing"), view());
        expect(missing).toHaveLength(1);
        expect(missing[0]).toMatchObject({
            nodeId: "provider",
            severity: "error",
            source: "provider",
        });
    });

    it("rejects a provider input that is not produced by a Provider node", () => {
        const problems = collectProviderProblems(
            providerGraph("p", "core.constant"),
            view(),
        );
        expect(problems.some((item) => item.message.includes("Provider 输入必须"))).toBe(
            true,
        );
    });

    it("reports an unconfigured Provider node without duplicating it on the Model", () => {
        const graphWithEmptyProvider = providerGraph("");
        const problems = collectProviderProblems(graphWithEmptyProvider, view());
        expect(problems).toHaveLength(1);
        expect(problems[0]?.nodeId).toBe("provider");
    });

    it("allows chat mode for a chat model", () => {
        expect(collectProviderProblems(modelCallGraph("chat"), view())).toEqual([]);
    });

    it("flags generate mode for a chat-only model", () => {
        const problems = collectProviderProblems(
            modelCallGraph("generate"),
            view(),
        );
        expect(problems.some((item) => item.id.includes("capability-generate"))).toBe(
            true,
        );
        expect(problems[0]?.nodeId).toBe("call");
    });

    it("flags chat mode for a generation-only model", () => {
        const generation = view();
        generation.profiles[0]!.profile.models[0]!.capabilities = {
            generate: true,
            outputs: ["image"],
        };
        const problems = collectProviderProblems(modelCallGraph("chat"), generation);
        expect(problems.some((item) => item.id.includes("capability-chat"))).toBe(true);
    });

    it("allows image generation and checks the requested modality", () => {
        const generation = view();
        generation.profiles[0]!.profile.models[0]!.capabilities = {
            generate: true,
            outputs: ["image"],
        };
        expect(
            collectProviderProblems(modelCallGraph("generate", "image"), generation),
        ).toEqual([]);

        const video = collectProviderProblems(
            modelCallGraph("generate", "video"),
            generation,
        );
        expect(video.some((item) => item.id.includes("capability-modality"))).toBe(
            true,
        );
    });

    it("does not guess capabilities when the catalog has none", () => {
        const legacy = view();
        legacy.profiles[0]!.profile.models[0]!.capabilities = undefined;
        expect(
            collectProviderProblems(modelCallGraph("generate", "video"), legacy),
        ).toEqual([]);
    });
});
