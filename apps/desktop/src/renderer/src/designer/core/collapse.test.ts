import { describe, expect, it } from "vitest";
import { findNodeCatalogEntry } from "./catalog";
import {
    collapsedVisibleFields,
    isFieldFilled,
    jsonEquals,
} from "./collapse";

describe("isFieldFilled", () => {
    it("treats empty values as no data", () => {
        expect(isFieldFilled(undefined)).toBe(false);
        expect(isFieldFilled(null)).toBe(false);
        expect(isFieldFilled("")).toBe(false);
        expect(isFieldFilled("   ")).toBe(false);
        expect(isFieldFilled([])).toBe(false);
        expect(isFieldFilled({})).toBe(false);
    });

    it("treats numbers, text and true booleans as data", () => {
        expect(isFieldFilled(0)).toBe(true);
        expect(isFieldFilled(0.7)).toBe(true);
        expect(isFieldFilled("hello")).toBe(true);
        expect(isFieldFilled(true)).toBe(true);
        expect(isFieldFilled([1])).toBe(true);
        expect(isFieldFilled({ a: 1 })).toBe(true);
    });

    it("ignores values equal to the default", () => {
        expect(isFieldFilled("chat", "chat")).toBe(false);
        expect(isFieldFilled(3, 3)).toBe(false);
        expect(isFieldFilled({ a: 1 }, { a: 1 })).toBe(false);
        expect(isFieldFilled("generate", "chat")).toBe(true);
    });

    it("only keeps explicit false when the default is true", () => {
        expect(isFieldFilled(false)).toBe(false);
        expect(isFieldFilled(false, true)).toBe(true);
    });
});

describe("jsonEquals", () => {
    it("compares nested JSON values", () => {
        expect(jsonEquals({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
        expect(jsonEquals({ a: 1 }, { a: 2 })).toBe(false);
        expect(jsonEquals([1], { 0: 1 })).toBe(false);
        expect(jsonEquals("a", "a")).toBe(true);
    });
});

describe("collapsedVisibleFields", () => {
    it("drops config that only repeats node defaults", () => {
        expect(collapsedVisibleFields("core.model.call", { mode: "chat" })).toEqual(
            [],
        );
        expect(
            collapsedVisibleFields("core.model", {
                providerId: "",
                modelId: "",
            }),
        ).toEqual([]);
        expect(
            collapsedVisibleFields("core.constant", {
                value: { type: "text", text: "" },
            }),
        ).toEqual([]);
        expect(
            collapsedVisibleFields("core.loop", {
                maxIterations: 3,
                retryOnError: false,
            }),
        ).toEqual([]);
    });

    it("keeps changed and manually filled fields", () => {
        const fields = collapsedVisibleFields("core.model.call", {
            mode: "generate",
            prompt: "hello",
            system: "   ",
            temperature: 0.7,
            think: true,
            parameters: {},
            attachments: [],
        });

        expect(fields).toContain("mode");
        expect(fields).toContain("prompt");
        expect(fields).toContain("temperature");
        expect(fields).toContain("think");
        expect(fields).not.toContain("system");
        expect(fields).not.toContain("parameters");
        expect(fields).not.toContain("attachments");
    });

    it("keeps explicit false only when it differs from the default", () => {
        expect(
            collapsedVisibleFields("core.value", {
                name: "value",
                required: false,
            }),
        ).toEqual(["required"]);
    });

    it("keeps an edited embedded graph but hides the template", () => {
        const template = findNodeCatalogEntry("core.subgraph")?.defaultConfig as
            | { graph?: unknown }
            | undefined;
        expect(
            collapsedVisibleFields("core.subgraph", {
                graph: structuredClone(template?.graph),
            }),
        ).toEqual([]);

        expect(
            collapsedVisibleFields("core.subgraph", {
                graph: { version: 1, id: "custom", nodes: [], edges: [] },
            }),
        ).toEqual(["graph"]);
    });

    it("returns no fields for a missing or non-object config", () => {
        expect(collapsedVisibleFields("core.model.call", undefined)).toEqual([]);
        expect(collapsedVisibleFields("core.unknown", { a: 1 })).toEqual(["a"]);
    });
});
