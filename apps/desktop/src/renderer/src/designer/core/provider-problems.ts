import type { GraphDocument } from "wireclaw";
import type {
    ProviderLibraryView,
    ProviderProfileStatus,
} from "@flowharness/contracts";
import { PROVIDER_ADAPTER_REQUIRES_KEY } from "@flowharness/contracts";
import type { DesignerProblem } from "./problems";

type GraphNode = GraphDocument["nodes"][number];

/**
 * 解析 Model 节点的 Provider 来源。
 *
 * - 优先 `provider` 输入边（来自 Provider 节点）；
 * - 没有连接时回退 config.providerId；
 * - 连接存在但来源不是 Provider 节点时返回 `sourceIsProvider: false`。
 */
export function resolveModelProvider(
    graph: GraphDocument,
    node: GraphNode,
): {
    providerId?: string;
    connected: boolean;
    sourceIsProvider: boolean;
    sourceNodeId?: string;
} {
    const edge = graph.edges.find(
        (candidate) =>
            candidate.to.nodeId === node.id && candidate.to.port === "provider",
    );
    if (edge === undefined) {
        const config = isRecord(node.config) ? node.config : {};
        const providerId = readString(config, "providerId");
        return {
            ...(providerId === undefined ? {} : { providerId }),
            connected: false,
            sourceIsProvider: true,
        };
    }

    const source = graph.nodes.find(
        (candidate) => candidate.id === edge.from.nodeId,
    );
    if (source?.type !== "core.provider") {
        return {
            connected: true,
            sourceIsProvider: false,
            sourceNodeId: edge.from.nodeId,
        };
    }

    const config = isRecord(source.config) ? source.config : {};
    const providerId = readString(config, "providerId");
    return {
        ...(providerId === undefined ? {} : { providerId }),
        connected: true,
        sourceIsProvider: true,
        sourceNodeId: source.id,
    };
}

/**
 * Model Call / Agent Run 的有效模型绑定。
 *
 * - `model` 输入边存在时以来源 `core.model` 节点为准（Provider 再按 Model 的规则解析）；
 * - 未连接时回退节点自身 config 的 providerId / modelId。
 */
export function resolveNodeModelBinding(
    graph: GraphDocument,
    node: GraphNode,
): {
    providerId?: string;
    modelId?: string;
    connected: boolean;
    sourceNodeId?: string;
} {
    const config = isRecord(node.config) ? node.config : {};
    const edge = graph.edges.find(
        (candidate) =>
            candidate.to.nodeId === node.id && candidate.to.port === "model",
    );
    if (edge === undefined) {
        const providerId = readString(config, "providerId");
        const modelId = readString(config, "modelId");
        return {
            ...(providerId === undefined ? {} : { providerId }),
            ...(modelId === undefined ? {} : { modelId }),
            connected: false,
        };
    }

    const source = graph.nodes.find(
        (candidate) => candidate.id === edge.from.nodeId,
    );
    if (source?.type !== "core.model") {
        return { connected: true, sourceNodeId: edge.from.nodeId };
    }

    const sourceConfig = isRecord(source.config) ? source.config : {};
    const provider = resolveModelProvider(graph, source);
    return {
        ...(provider.providerId === undefined
            ? {}
            : { providerId: provider.providerId }),
        ...(readString(sourceConfig, "modelId") === undefined
            ? {}
            : { modelId: readString(sourceConfig, "modelId") }),
        connected: true,
        sourceNodeId: source.id,
    };
}

/**
 * 某个 Provider 目录中是否有该模型。
 *
 * 目录为空时视为“尚未刷新”，不做兼容性判断，避免误清空旧图。
 */
export function isModelInProviderCatalog(
    view: ProviderLibraryView,
    providerId: string,
    modelId: string,
): boolean {
    const status = view.profiles.find((item) => item.profile.id === providerId);
    if (status === undefined || status.profile.models.length === 0) return true;
    return status.profile.models.some((model) => model.id === modelId);
}

export type IncompatibleModel = {
    nodeId: string;
    providerId: string;
    providerLabel: string;
    modelId: string;
};

/**
 * 找出与 Provider 目录不兼容的 Model 配置。
 *
 * 用于“连接 Provider / 切换 Provider”时清空失效模型并提示用户；
 * Provider 目录为空、或节点未绑定 Provider 时返回空。
 */
export function findIncompatibleModels(
    view: ProviderLibraryView,
    candidates: readonly {
        nodeId: string;
        providerId?: string;
        modelId?: string;
    }[],
): readonly IncompatibleModel[] {
    const resets: IncompatibleModel[] = [];

    for (const candidate of candidates) {
        if (
            candidate.providerId === undefined ||
            candidate.modelId === undefined
        ) {
            continue;
        }
        const status = view.profiles.find(
            (item) => item.profile.id === candidate.providerId,
        );
        if (status === undefined || status.profile.models.length === 0) continue;
        if (status.profile.models.some((model) => model.id === candidate.modelId)) {
            continue;
        }

        resets.push({
            nodeId: candidate.nodeId,
            providerId: candidate.providerId,
            providerLabel: status.profile.label,
            modelId: candidate.modelId,
        });
    }

    return resets;
}

/**
 * 设计期 Provider 健康问题。
 *
 * - `core.provider`：Provider 节点自身必须绑定有效 profile；
 * - `core.model`：未连接时检查 config.providerId；连接时由 Provider 节点负责
 *   profile 健康，这里只检查模型 id / 目录；
 * - 缺 profile / 禁用 / 缺 key / model 不在目录为 error；
 *   key 失效 / quota / 未验证为 warning（允许尝试运行）。
 */
export function collectProviderProblems(
    graph: GraphDocument,
    view: ProviderLibraryView,
): readonly DesignerProblem[] {
    const byId = new Map<string, ProviderProfileStatus>(
        view.profiles.map((status) => [status.profile.id, status]),
    );
    const problems: DesignerProblem[] = [];

    for (const node of graph.nodes) {
        const config = isRecord(node.config) ? node.config : {};

        if (node.type === "core.provider") {
            const providerId = readString(config, "providerId");
            if (providerId === undefined) {
                problems.push(
                    problem(node.id, "missing-provider", "error", "Provider 节点未选择 Provider"),
                );
                continue;
            }
            problems.push(...profileProblems(node.id, providerId, byId));
            continue;
        }

        if (node.type !== "core.model") continue;

        const binding = resolveModelProvider(graph, node);
        if (binding.connected && !binding.sourceIsProvider) {
            problems.push(
                problem(
                    node.id,
                    "invalid-provider-edge",
                    "error",
                    `Provider 输入必须来自 Provider 节点（当前来自 ${binding.sourceNodeId ?? "未知节点"}）`,
                ),
            );
        } else if (!binding.connected) {
            if (binding.providerId === undefined) {
                problems.push(
                    problem(
                        node.id,
                        "missing-provider",
                        "error",
                        "Model 节点未选择 Provider，也未连接 Provider 节点",
                    ),
                );
            } else {
                problems.push(
                    ...profileProblems(node.id, binding.providerId, byId),
                );
            }
        }

        const modelId = readString(config, "modelId");
        if (modelId === undefined) {
            problems.push(
                problem(node.id, "missing-model", "error", "Model 节点未选择模型"),
            );
            continue;
        }

        const status =
            binding.providerId === undefined
                ? undefined
                : byId.get(binding.providerId);
        if (
            status !== undefined &&
            status.profile.models.length > 0 &&
            !status.profile.models.some((model) => model.id === modelId)
        ) {
            problems.push(
                problem(
                    node.id,
                    "unknown-model",
                    "error",
                    `模型 "${modelId}" 不在 Provider "${status.profile.label}" 的目录中`,
                ),
            );
        }
    }

    problems.push(...collectCapabilityProblems(graph, byId));

    return problems;
}

/**
 * Model Call 的 mode 与模型能力不匹配。只检查目录里带 capabilities 的模型；
 * 旧目录没有能力摘要时保持宽容，避免误报。
 */
function collectCapabilityProblems(
    graph: GraphDocument,
    byId: ReadonlyMap<string, ProviderProfileStatus>,
): DesignerProblem[] {
    const problems: DesignerProblem[] = [];

    for (const node of graph.nodes) {
        if (node.type !== "core.model.call") continue;
        const config = isRecord(node.config) ? node.config : {};
        const mode = config.mode === "generate" ? "generate" : "chat";

        const binding = resolveNodeModelBinding(graph, node);
        const providerId = binding.providerId;
        const modelId = binding.modelId;
        if (providerId === undefined || modelId === undefined) continue;

        const status = byId.get(providerId);
        const model = status?.profile.models.find((item) => item.id === modelId);
        const capabilities = model?.capabilities;
        if (capabilities === undefined) continue;

        if (mode === "chat") {
            if (
                capabilities.chat === false ||
                (capabilities.generate === true && capabilities.chat !== true)
            ) {
                problems.push(
                    problem(
                        node.id,
                        "capability-chat",
                        "error",
                        `模型 "${modelId}" 不支持 chat 模式`,
                    ),
                );
            }
            continue;
        }

        if (
            capabilities.generate === false ||
            (capabilities.chat === true && capabilities.generate !== true)
        ) {
            problems.push(
                problem(
                    node.id,
                    "capability-generate",
                    "error",
                    `模型 "${modelId}" 不支持 generate 模式`,
                ),
            );
            continue;
        }

        const modality =
            config.modality === "image" ||
            config.modality === "audio" ||
            config.modality === "video"
                ? config.modality
                : "image";
        if (
            capabilities.outputs !== undefined &&
            capabilities.outputs.length > 0 &&
            !capabilities.outputs.includes(modality)
        ) {
            problems.push(
                problem(
                    node.id,
                    "capability-modality",
                    "error",
                    `模型 "${modelId}" 不支持输出 ${modality}`,
                ),
            );
        }
    }

    return problems;
}

function profileProblems(
    nodeId: string,
    providerId: string,
    byId: ReadonlyMap<string, ProviderProfileStatus>,
): DesignerProblem[] {
    const status = byId.get(providerId);
    if (status === undefined) {
        return [
            problem(
                nodeId,
                "unknown-provider",
                "error",
                `Provider "${providerId}" 不存在或尚未配置`,
            ),
        ];
    }
    if (!status.profile.enabled) {
        return [
            problem(
                nodeId,
                "disabled-provider",
                "error",
                `Provider "${status.profile.label}" 已禁用`,
            ),
        ];
    }
    if (status.error !== undefined) {
        return [
            problem(
                nodeId,
                "unavailable",
                "error",
                `Provider "${status.profile.label}" 不可用：${status.error}`,
            ),
        ];
    }

    const problems: DesignerProblem[] = [];
    if (
        PROVIDER_ADAPTER_REQUIRES_KEY[status.profile.adapter] &&
        !status.hasKey
    ) {
        problems.push(
            problem(
                nodeId,
                "missing-key",
                "error",
                `Provider "${status.profile.label}" 缺少 API Key`,
            ),
        );
        return problems;
    }

    if (status.keyStatus === "invalid") {
        problems.push(
            problem(
                nodeId,
                "invalid-key",
                "warning",
                `API Key 已失效：${status.keyError?.message ?? "需要重新验证"}`,
            ),
        );
    } else if (status.keyStatus === "quota") {
        problems.push(
            problem(
                nodeId,
                "quota",
                "warning",
                `API Key 额度 / 限流：${status.keyError?.message ?? "请检查账户余额"}`,
            ),
        );
    } else if (status.keyStatus === "unverified" || status.keyStatus === "network") {
        problems.push(
            problem(
                nodeId,
                "unverified-key",
                "warning",
                `API Key 尚未验证${status.keyStatus === "network" ? "（网络异常）" : ""}`,
            ),
        );
    }

    return problems;
}

function problem(
    nodeId: string,
    code: string,
    severity: "error" | "warning",
    message: string,
): DesignerProblem {
    return {
        id: `provider:${nodeId}:${code}`,
        severity,
        source: "provider",
        message,
        nodeId,
    };
}

function readString(
    value: Record<string, unknown>,
    key: string,
): string | undefined {
    const candidate = value[key];
    return typeof candidate === "string" && candidate.length > 0
        ? candidate
        : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
