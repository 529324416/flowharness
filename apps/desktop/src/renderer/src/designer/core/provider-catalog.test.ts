import { describe, expect, it } from "vitest";
import type { ProviderLibraryView } from "@flowharness/contracts";
import type { GraphDocument } from "wireclaw";
import { collectProviderCatalogRequests } from "./provider-catalog";

const AT = "2026-11-27T00:00:00.000Z";

function graph(providerId = "p", connected = false): GraphDocument {
    const nodes: GraphDocument["nodes"] = [
        {
            id: "model",
            type: "core.model",
            typeVersion: 1,
            config: connected ? { modelId: "deepseek-flash" } : { providerId },
        },
        ...(connected
            ? ([
                  {
                      id: "provider",
                      type: "core.provider",
                      typeVersion: 1,
                      config: { providerId },
                  },
              ] satisfies GraphDocument["nodes"])
            : []),
    ];

    return {
        version: 1,
        id: "graph",
        nodes,
        edges: connected
            ? [
                  {
                      from: { nodeId: "provider", port: "provider" },
                      to: { nodeId: "model", port: "provider" },
                  },
              ]
            : [],
        ui: {},
    } as unknown as GraphDocument;
}

function view(
    overrides: {
        models?: ProviderLibraryView["profiles"][number]["profile"]["models"];
        modelsFetchedAt?: string;
        available?: boolean;
        enabled?: boolean;
    } = {},
): ProviderLibraryView {
    return {
        keys: [],
        profiles: [
            {
                profile: {
                    id: "p",
                    label: "Ollama",
                    adapter: "ollama.chat",
                    enabled: overrides.enabled ?? true,
                    models: overrides.models ?? [],
                    ...(overrides.modelsFetchedAt === undefined
                        ? {}
                        : { modelsFetchedAt: overrides.modelsFetchedAt }),
                    createdAt: AT,
                    updatedAt: AT,
                },
                available: overrides.available ?? true,
                hasKey: true,
                keyStatus: "unverified",
            },
        ],
    };
}

describe("collectProviderCatalogRequests", () => {
    it("requests an empty, never-fetched provider referenced by a Model", () => {
        expect(collectProviderCatalogRequests(graph(), view())).toEqual([
            { profileId: "p", label: "Ollama" },
        ]);
    });

    it("resolves a connected Provider node as well as config.providerId", () => {
        expect(
            collectProviderCatalogRequests(graph("p", true), view()),
        ).toEqual([{ profileId: "p", label: "Ollama" }]);
    });

    it("does not request when a catalog already exists", () => {
        expect(
            collectProviderCatalogRequests(
                graph(),
                view({ models: [{ id: "llama3", name: "Llama 3" }] }),
            ),
        ).toEqual([]);
    });

    it("does not repeatedly request an already-checked empty catalog", () => {
        expect(
            collectProviderCatalogRequests(
                graph(),
                view({ modelsFetchedAt: AT }),
            ),
        ).toEqual([]);
    });

    it("skips unavailable or disabled providers", () => {
        expect(
            collectProviderCatalogRequests(graph(), view({ available: false })),
        ).toEqual([]);
        expect(
            collectProviderCatalogRequests(graph(), view({ enabled: false })),
        ).toEqual([]);
    });

    it("deduplicates models that share a provider", () => {
        const twoModels = graph();
        twoModels.nodes.push({
            id: "model2",
            type: "core.model",
            typeVersion: 1,
            config: { providerId: "p" },
        });

        expect(
            collectProviderCatalogRequests(twoModels, view()),
        ).toHaveLength(1);
    });
});
