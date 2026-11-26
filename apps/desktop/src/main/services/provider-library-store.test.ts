import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderLibrary } from "@flowharness/contracts";
import {
    assertProviderLibrary,
    emptyProviderLibrary,
    parseProviderLibrary,
    ProviderLibraryStore,
} from "./provider-library-store";

const dirs: string[] = [];

async function makeDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "fh-provider-library-"));
    dirs.push(dir);
    return dir;
}

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const AT = "2026-11-27T00:00:00.000Z";

function sampleLibrary(): ProviderLibrary {
    return {
        schemaVersion: 1,
        keys: [
            {
                id: "key_deepseek",
                protocol: "deepseek",
                label: "DeepSeek",
                status: "active",
                fingerprint: "0123456789ab",
                createdAt: AT,
                updatedAt: AT,
            },
        ],
        profiles: [
            {
                id: "deepseek",
                label: "DeepSeek",
                adapter: "deepseek.chat",
                apiKeyId: "key_deepseek",
                enabled: true,
                models: [
                    {
                        id: "deepseek-chat",
                        name: "DeepSeek Chat",
                        capabilities: {
                            chat: true,
                            tools: true,
                            inputs: ["text"],
                            outputs: ["text"],
                        },
                    },
                ],
                modelsFetchedAt: AT,
                modelsSource: "api",
                createdAt: AT,
                updatedAt: AT,
            },
        ],
    };
}

describe("ProviderLibraryStore", () => {
    it("returns an empty library when the file does not exist", async () => {
        const dir = await makeDir();
        const store = new ProviderLibraryStore(join(dir, "provider-library.json"));

        expect(await store.exists()).toBe(false);
        expect(await store.load()).toEqual(emptyProviderLibrary());
    });

    it("saves and loads keys, profiles and model catalogs", async () => {
        const dir = await makeDir();
        const file = join(dir, "provider-library.json");
        const store = new ProviderLibraryStore(file);
        const library = sampleLibrary();

        const saved = await store.save(library);
        expect(saved).toEqual(library);
        expect(await store.exists()).toBe(true);
        expect(await store.load()).toEqual(library);

        const raw = JSON.parse(await readFile(file, "utf8")) as ProviderLibrary;
        expect(raw.profiles[0]?.models[0]?.id).toBe("deepseek-chat");
    });

    it("rejects duplicate ids and dangling key references on save", async () => {
        const dir = await makeDir();
        const store = new ProviderLibraryStore(join(dir, "provider-library.json"));

        const duplicate = sampleLibrary();
        duplicate.keys.push({ ...duplicate.keys[0]! });
        await expect(store.save(duplicate)).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });

        const dangling = sampleLibrary();
        dangling.profiles[0]!.apiKeyId = "key_missing";
        await expect(store.save(dangling)).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });
    });

    it("rejects a key whose protocol does not match the adapter", async () => {
        const dir = await makeDir();
        const store = new ProviderLibraryStore(join(dir, "provider-library.json"));
        const library = sampleLibrary();
        library.keys[0]!.protocol = "qwen";

        await expect(store.save(library)).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });
    });

    it("drops invalid records and mismatched key references when reading", async () => {
        const dir = await makeDir();
        const file = join(dir, "provider-library.json");
        await writeFile(
            file,
            JSON.stringify({
                schemaVersion: 1,
                keys: [
                    sampleLibrary().keys[0],
                    { id: "key_bad", protocol: "nope" },
                ],
                profiles: [
                    {
                        ...sampleLibrary().profiles[0],
                        adapter: "qwen.chat",
                    },
                    { id: "profile_bad", label: "" },
                ],
            }),
        );

        const store = new ProviderLibraryStore(file);
        const library = await store.load();

        expect(library.keys).toHaveLength(1);
        expect(library.profiles).toHaveLength(1);
        // deepseek key 与 qwen.chat 协议不匹配：保留 profile，但清空 key 引用。
        expect(library.profiles[0]?.apiKeyId).toBeUndefined();
    });

    it("backs up a corrupt file and starts from an empty library", async () => {
        const dir = await makeDir();
        const file = join(dir, "provider-library.json");
        await writeFile(file, "{ not-json");

        const store = new ProviderLibraryStore(file);
        expect(await store.load()).toEqual(emptyProviderLibrary());

        const files = await readdir(dir);
        expect(files.some((name) => name.includes(".corrupt-"))).toBe(true);
    });

    it("refuses a newer schema instead of overwriting it", async () => {
        const dir = await makeDir();
        const file = join(dir, "provider-library.json");
        await writeFile(
            file,
            JSON.stringify({ schemaVersion: 2, keys: [], profiles: [] }),
        );

        const store = new ProviderLibraryStore(file);
        await expect(store.load()).rejects.toMatchObject({ code: "E_MIGRATION" });
    });

    it("parses a missing profile key as unbound instead of failing the library", () => {
        const library = sampleLibrary();
        library.keys = [];
        const parsed = parseProviderLibrary(library);

        expect(parsed?.profiles[0]?.apiKeyId).toBeUndefined();
        expect(() => assertProviderLibrary(library)).toThrow();
    });
});
