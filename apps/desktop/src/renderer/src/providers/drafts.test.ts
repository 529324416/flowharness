import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@flowharness/contracts";
import {
    emptyKeyDraft,
    emptyProviderDraft,
    isProviderDraftDirty,
    providerDraftFromProfile,
} from "./drafts";

const AT = "2026-11-28T00:00:00.000Z";

const PROFILE: ProviderProfile = {
    id: "deepseek",
    label: "DeepSeek 主账号",
    adapter: "deepseek.chat",
    apiKeyId: "key_ds",
    baseUrl: "https://api.deepseek.com",
    defaultModelId: "deepseek-chat",
    enabled: true,
    models: [],
    createdAt: AT,
    updatedAt: AT,
};

describe("provider drafts", () => {
    it("starts empty with sensible defaults", () => {
        expect(emptyKeyDraft()).toEqual({
            protocol: "deepseek",
            label: "",
            apiKey: "",
            baseUrl: "",
        });
        expect(emptyProviderDraft()).toEqual({
            label: "",
            adapter: "deepseek.chat",
            apiKeyId: "",
            baseUrl: "",
            defaultModelId: "",
            enabled: true,
        });
    });

    it("maps a profile into an editable draft", () => {
        expect(providerDraftFromProfile(PROFILE)).toEqual({
            label: "DeepSeek 主账号",
            adapter: "deepseek.chat",
            apiKeyId: "key_ds",
            baseUrl: "https://api.deepseek.com",
            defaultModelId: "deepseek-chat",
            enabled: true,
        });
    });

    it("treats missing optional profile fields as empty draft values", () => {
        expect(
            providerDraftFromProfile({
                id: "ollama",
                label: "Ollama",
                adapter: "ollama.chat",
                enabled: true,
                models: [],
                createdAt: AT,
                updatedAt: AT,
            }),
        ).toMatchObject({ apiKeyId: "", baseUrl: "", defaultModelId: "" });
    });

    it("detects every editable field change", () => {
        const draft = providerDraftFromProfile(PROFILE);
        expect(isProviderDraftDirty(draft, PROFILE)).toBe(false);
        expect(isProviderDraftDirty({ ...draft, label: "改名" }, PROFILE)).toBe(true);
        expect(isProviderDraftDirty({ ...draft, adapter: "qwen.chat" }, PROFILE)).toBe(
            true,
        );
        expect(isProviderDraftDirty({ ...draft, apiKeyId: "" }, PROFILE)).toBe(true);
        expect(isProviderDraftDirty({ ...draft, baseUrl: "" }, PROFILE)).toBe(true);
        expect(
            isProviderDraftDirty({ ...draft, defaultModelId: "" }, PROFILE),
        ).toBe(true);
        expect(isProviderDraftDirty({ ...draft, enabled: false }, PROFILE)).toBe(
            true,
        );
    });
});
