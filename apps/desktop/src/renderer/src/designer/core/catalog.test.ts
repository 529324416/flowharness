import { describe, expect, it } from "vitest";
import {
    categoryLabel,
    defaultConfigOf,
    findNodeCatalogEntry,
    groupNodeCatalog,
    NODE_CATALOG,
    searchNodeCatalog,
} from "./catalog";

describe("designer catalog", () => {
    it("exposes wireclaw metadata: schema, default config and category", () => {
        expect(NODE_CATALOG).toHaveLength(17);

        const constant = findNodeCatalogEntry("core.constant");
        expect(constant).toBeDefined();
        expect(constant?.category).toBe("data");
        expect(constant?.configSchema).toMatchObject({ type: "object" });
        expect(constant?.defaultConfig).toEqual({
            value: { type: "text", text: "" },
        });

        const withSchema = NODE_CATALOG.filter(
            (entry) => entry.configSchema !== undefined,
        );
        expect(withSchema).toHaveLength(12);
        expect(NODE_CATALOG.every((entry) => entry.category !== undefined)).toBe(true);

        const provider = findNodeCatalogEntry("core.provider");
        expect(provider?.category).toBe("model");
        expect(provider?.outputs[0]?.type).toBe("provider");
    });

    it("returns a deep copy of the default config", () => {
        const constant = findNodeCatalogEntry("core.constant");
        const config = defaultConfigOf(constant!);

        expect(config).toEqual(constant?.defaultConfig);
        expect(config).not.toBe(constant?.defaultConfig);
    });

    it("groups entries by category in a stable order", () => {
        const groups = groupNodeCatalog();
        expect(groups.map((group) => group.id)).toEqual([
            "io",
            "data",
            "model",
            "control",
            "composite",
            "tool",
            "event",
        ]);
        expect(groups[0]?.label).toBe("输入 / 输出");
        expect(
            groups.flatMap((group) => group.entries).map((entry) => entry.type),
        ).toHaveLength(17);
    });

    it("searches by title, type and keywords", () => {
        expect(
            searchNodeCatalog("模型调用").map((entry) => entry.type),
        ).toContain("core.model.call");
        expect(searchNodeCatalog("loop").map((entry) => entry.type)).toContain(
            "core.loop",
        );
        expect(searchNodeCatalog("core.constant").map((entry) => entry.type)).toEqual([
            "core.constant",
        ]);
        expect(searchNodeCatalog("")).toHaveLength(17);
        expect(searchNodeCatalog("no-such-node")).toHaveLength(0);
    });

    it("maps known categories to labels and falls back to the raw id", () => {
        expect(categoryLabel("composite")).toBe("组合");
        expect(categoryLabel("custom")).toBe("custom");
        expect(categoryLabel(undefined)).toBe("其他");
    });
});
