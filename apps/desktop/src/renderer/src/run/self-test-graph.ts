/**
 * 自检用最小 Harness Graph：Constant → Output，不涉及 Provider / 工具。
 * 形状与 wireclaw `GraphDocument` 一致，由 main 侧反序列化并校验。
 */
export const SELF_TEST_GRAPH_ID = "flowharness-self-test";

export const SELF_TEST_GRAPH = {
    version: 1,
    id: SELF_TEST_GRAPH_ID,
    title: "FlowHarness self test",
    nodes: [
        {
            id: "constant",
            type: "core.constant",
            typeVersion: 1,
            config: {
                value: { type: "text", text: "hello from flowharness" },
            },
        },
        {
            id: "output",
            type: "core.output",
            typeVersion: 1,
        },
    ],
    edges: [
        {
            from: { nodeId: "constant", port: "value" },
            to: { nodeId: "output", port: "text" },
        },
    ],
} as const;
