import { describe, expect, it } from "vitest";
import { createEditorCatalog } from "wireclaw";
import { designerRegistry, NODE_PRESETS } from "./catalog";
import {
    BUILTIN_PRESETS,
    designerPresetLibrary,
    presetConfig,
} from "./presets";

describe("designer presets", () => {
    it("registers the built-in preset library in the editor catalog", () => {
        expect(NODE_PRESETS.map((preset) => preset.presetId)).toEqual([
            "preset.text-constant",
            "preset.model-chat",
            "preset.agent-readonly",
        ]);

        const catalog = createEditorCatalog(designerRegistry, {
            presets: designerPresetLibrary,
        });
        expect(catalog.presets).toHaveLength(3);
        expect(BUILTIN_PRESETS).toHaveLength(3);
    });

    it("applies parameter defaults when instantiating a preset config", () => {
        const text = BUILTIN_PRESETS.find(
            (preset) => preset.presetId === "preset.text-constant",
        );
        expect(presetConfig(text!)).toEqual({
            value: { type: "text", text: "hello" },
        });

        const agent = BUILTIN_PRESETS.find(
            (preset) => preset.presetId === "preset.agent-readonly",
        );
        expect(presetConfig(agent!)).toEqual({
            permission: "readonly",
            maxSteps: 8,
        });
    });

    it("returns a copy that can be edited without touching the library", () => {
        const preset = BUILTIN_PRESETS[0]!;
        const config = presetConfig(preset) as {
            value: { type: string; text: string };
        };
        config.value.text = "changed";

        expect(BUILTIN_PRESETS[0]?.config).toEqual({
            value: { type: "text", text: "hello" },
        });
    });
});
