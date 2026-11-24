import { describe, expect, it } from "vitest";
import { readConfigPath, writeConfigPath } from "./config-path";

describe("config path helpers", () => {
    it("reads nested values and stops at missing or non-object segments", () => {
        const config = {
            value: { type: "text", text: "hi" },
            level: "info",
        };

        expect(readConfigPath(config, ["value", "text"])).toBe("hi");
        expect(readConfigPath(config, ["level"])).toBe("info");
        expect(readConfigPath(config, ["value", "missing"])).toBeUndefined();
        expect(readConfigPath(config, ["level", "nested"])).toBeUndefined();
        expect(readConfigPath(undefined, ["a"])).toBeUndefined();
    });

    it("writes nested values without touching siblings", () => {
        const config = {
            value: { type: "text", text: "hi", meta: 1 },
            keep: true,
        };

        const next = writeConfigPath(config, ["value", "text"], "hello");

        expect(next).toEqual({
            value: { type: "text", text: "hello", meta: 1 },
            keep: true,
        });
        expect(config.value.text).toBe("hi");
        expect(next).not.toBe(config);
        expect(next.value).not.toBe(config.value);
    });

    it("creates intermediate objects", () => {
        expect(writeConfigPath({}, ["parameters", "temperature"], 0.7)).toEqual({
            parameters: { temperature: 0.7 },
        });
    });

    it("deletes keys when the value is undefined and prunes empty parents", () => {
        const config = { hostTools: { askUser: true } };

        expect(writeConfigPath(config, ["hostTools", "askUser"], undefined)).toEqual({});
        expect(writeConfigPath(config, ["missing"], undefined)).toEqual(config);
    });

    it("replaces the root only for object values", () => {
        expect(writeConfigPath({ a: 1 }, [], { b: 2 })).toEqual({ b: 2 });
        expect(writeConfigPath({ a: 1 }, [], "text")).toEqual({});
    });
});
