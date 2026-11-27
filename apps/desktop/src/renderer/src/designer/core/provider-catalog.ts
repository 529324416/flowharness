import type { ProviderLibraryView } from "@flowharness/contracts";
import type { GraphDocument } from "wireclaw";
import { resolveModelProvider } from "./provider-problems";

export type ProviderCatalogRequest = {
    profileId: string;
    label: string;
};

/**
 * 找出需要实机刷新模型目录的 Provider。
 *
 * 只看 Model 节点实际引用的 profile：目录为空、尚未记录 `modelsFetchedAt`、
 * profile 可用且启用时才请求；已有目录或已检测过空目录的不再自动联网。
 */
export function collectProviderCatalogRequests(
    graph: GraphDocument,
    view: ProviderLibraryView,
): readonly ProviderCatalogRequest[] {
    const byId = new Map(
        view.profiles.map((status) => [status.profile.id, status]),
    );
    const requested = new Map<string, ProviderCatalogRequest>();

    for (const node of graph.nodes) {
        if (node.type !== "core.model") continue;
        const binding = resolveModelProvider(graph, node);
        const providerId = binding.providerId;
        if (providerId === undefined) continue;
        if (requested.has(providerId)) continue;

        const status = byId.get(providerId);
        if (status === undefined) continue;
        if (!status.available || !status.profile.enabled) continue;
        if (status.profile.models.length > 0) continue;
        if (status.profile.modelsFetchedAt !== undefined) continue;

        requested.set(providerId, {
            profileId: providerId,
            label: status.profile.label,
        });
    }

    return [...requested.values()];
}
