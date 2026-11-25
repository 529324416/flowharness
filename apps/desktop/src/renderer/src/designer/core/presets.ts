import {
    NodePresetLibrary,
    applyPresetParameters,
    type JsonValue,
    type NodePresetDocument,
} from "wireclaw";

/**
 * 设计器的内置节点预设。
 *
 * 预设是「节点库条目」，不是图内节点；实例化时才生成节点 id。
 * 这里先放三条常用组合，后续可换成工作区级预设库（导入/导出已由 wireclaw 提供）。
 */
const library = new NodePresetLibrary();

const PRESETS: readonly NodePresetDocument[] = [
    {
        version: 1,
        presetId: "preset.text-constant",
        name: "文本常量",
        description: "输出一段固定文本，常用于给下游提供 prompt 或示例值",
        type: "core.constant",
        typeVersion: 1,
        tags: ["text", "constant", "常量", "文本"],
        config: { value: { type: "text", text: "hello" } },
        parameters: [
            {
                name: "text",
                path: "value.text",
                default: "hello",
                description: "固定文本内容",
            },
        ],
    },
    {
        version: 1,
        presetId: "preset.model-chat",
        name: "聊天模型调用",
        description: "A 类单次模型调用，预设 chat 模式与 temperature",
        type: "core.model.call",
        typeVersion: 1,
        tags: ["model", "chat", "模型", "对话"],
        config: { mode: "chat", temperature: 0.7 },
        parameters: [
            {
                name: "temperature",
                path: "temperature",
                default: 0.7,
                description: "采样温度",
            },
        ],
    },
    {
        version: 1,
        presetId: "preset.agent-readonly",
        name: "只读 Agent",
        description: "B 类 Agent 调用，只读权限、最多 8 步",
        type: "core.agent.run",
        typeVersion: 1,
        tags: ["agent", "代理", "只读"],
        config: { permission: "readonly", maxSteps: 8 },
        parameters: [
            {
                name: "maxSteps",
                path: "maxSteps",
                default: 8,
                description: "最大步数",
            },
        ],
    },
    {
        version: 1,
        presetId: "preset.model-image",
        name: "图片生成",
        description: "A 类 generate 模式，默认 image 模态",
        type: "core.model.call",
        typeVersion: 1,
        tags: ["model", "image", "生成", "图片"],
        config: { mode: "generate", modality: "image" },
        parameters: [
            {
                name: "modality",
                path: "modality",
                default: "image",
                description: "生成模态（image / audio / video）",
            },
        ],
    },
];

for (const preset of PRESETS) {
    library.add(preset);
}

export const designerPresetLibrary = library;

export const BUILTIN_PRESETS: readonly NodePresetDocument[] = library.list();

/** 预设实例化时的 config：写入参数默认值，再交给节点使用。 */
export function presetConfig(preset: NodePresetDocument): JsonValue | undefined {
    return applyPresetParameters(preset, {});
}
