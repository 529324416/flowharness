import { describe, expect, it } from "vitest";
import type { ProviderLibraryView } from "@flowharness/contracts";
import {
    keysForAdapter,
    maskFingerprint,
    profileHealth,
    modelOptions,
} from "./model";

const AT = "2026-11-27T00:00:00.000Z";

function view(): ProviderLibraryView {
    return {
        keys: [
            {
                id: "key_ds",
                protocol: "deepseek",
                label: "DeepSeek",
                status: "active",
                fingerprint: "0123456789ab",
                createdAt: AT,
                updatedAt: AT,
            },
            {
                id: "key_qwen",
                protocol: "qwen",
                label: "Qwen",
                status: "invalid",
                createdAt: AT,
                updatedAt: AT,
            },
        ],
        profiles: [
            {
                profile: {
                    id: "ds",
                    label: "DeepSeek 主账号",
                    adapter: "deepseek.chat",
                    apiKeyId: "key_ds",
                    enabled: true,
                    models: [],
                    createdAt: AT,
                    updatedAt: AT,
                },
                available: true,
                hasKey: true,
                keyStatus: "active",
            },
            {
                profile: {
                    id: "qwen-img",
                    label: "Qwen 生图",
                    adapter: "qwen.image",
                    apiKeyId: "key_qwen",
                    enabled: true,
                    models: [],
                    createdAt: AT,
                    updatedAt: AT,
                },
                available: true,
                hasKey: true,
                keyStatus: "invalid",
                keyError: { kind: "auth", message: "HTTP 401", at: AT },
            },
        ],
    };
}

describe("provider library UI model", () => {
    it("filters keys by adapter protocol", () => {
        expect(keysForAdapter(view(), "qwen.image").map((key) => key.value)).toEqual([
            "key_qwen",
        ]);
        expect(keysForAdapter(view(), "ollama.chat")).toEqual([]);
    });

    it("maps profile health from key state", () => {
        const library = view();
        expect(profileHealth(library.profiles[0]!).label).toBe("可用");
        expect(profileHealth(library.profiles[1]!)).toMatchObject({
            label: "密钥失效",
            tone: "danger",
        });

        library.profiles[0]!.profile.enabled = false;
        expect(profileHealth(library.profiles[0]!).label).toBe("已禁用");
    });

    it("masks fingerprints and labels model options", () => {
        expect(maskFingerprint("0123456789ab")).toBe("fp 012345…");
        expect(maskFingerprint(undefined)).toBe("无指纹");
        expect(
            modelOptions([
                { id: "m1", name: "M1" },
                {
                    id: "m2",
                    name: "M2",
                    capabilities: { vision: true },
                },
            ]),
        ).toEqual([
            { value: "m1", label: "M1" },
            { value: "m2", label: "M2（视觉）" },
        ]);
    });
});
