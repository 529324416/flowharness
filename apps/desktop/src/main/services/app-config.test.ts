import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppConfigStore, createDefaultAppConfig } from "./app-config";

const dirs: string[] = [];

async function makeDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "fh-config-"));
    dirs.push(dir);
    return dir;
}

function makeStore(dir: string): AppConfigStore {
    return new AppConfigStore(
        join(dir, "config.json"),
        createDefaultAppConfig(join(dir, "workspaces")),
    );
}

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("AppConfigStore", () => {
    it("creates a default config file on first load", async () => {
        const dir = await makeDir();
        const store = makeStore(dir);
        const config = await store.get();

        expect(config.schemaVersion).toBe(1);
        expect(config.theme).toBe("dark");
        expect(config.workspaceRoot).toBe(join(dir, "workspaces"));
        expect(config.providers.map((provider) => provider.id)).toContain("ollama");

        const persisted = JSON.parse(await readFile(join(dir, "config.json"), "utf8"));
        expect(persisted.theme).toBe("dark");
    });

    it("persists updates and reloads them", async () => {
        const dir = await makeDir();
        const store = makeStore(dir);

        await store.update({ theme: "light", devtools: false });

        const reloaded = await makeStore(dir).get();
        expect(reloaded.theme).toBe("light");
        expect(reloaded.devtools).toBe(false);
    });

    it("rejects invalid updates", async () => {
        const dir = await makeDir();
        const store = makeStore(dir);

        await expect(store.update({ theme: "neon" as never })).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });
        await expect(store.update({ workspaceRoot: "" })).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });
        await expect(
            store.update({
                providers: [
                    {
                        id: "bad id",
                        kind: "deepseek",
                        label: "bad",
                        enabled: true,
                    },
                ],
            }),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });

    it("persists provider configuration", async () => {
        const dir = await makeDir();
        const store = makeStore(dir);

        await store.update({
            providers: [
                {
                    id: "deepseek",
                    kind: "deepseek",
                    label: "DeepSeek 备用",
                    enabled: true,
                    baseUrl: "https://example.test/v1",
                    model: "deepseek-chat",
                },
            ],
        });

        const reloaded = await makeStore(dir).get();
        expect(reloaded.providers).toEqual([
            {
                id: "deepseek",
                kind: "deepseek",
                label: "DeepSeek 备用",
                enabled: true,
                baseUrl: "https://example.test/v1",
                model: "deepseek-chat",
            },
        ]);
    });

    it("backs up and rebuilds a corrupt config file", async () => {
        const dir = await makeDir();
        await writeFile(join(dir, "config.json"), "{ definitely not json");

        const config = await makeStore(dir).get();
        expect(config.theme).toBe("dark");

        const files = await readdir(dir);
        expect(files.some((file) => file.startsWith("config.json.corrupt-"))).toBe(true);
    });

    it("refuses a config written by a newer schema", async () => {
        const dir = await makeDir();
        await writeFile(
            join(dir, "config.json"),
            JSON.stringify({ schemaVersion: 99, theme: "dark" }),
        );

        await expect(makeStore(dir).get()).rejects.toMatchObject({ code: "E_MIGRATION" });
    });

    it("tracks recent workspaces with a cap", async () => {
        const dir = await makeDir();
        const store = makeStore(dir);

        for (let index = 0; index < 12; index += 1) {
            await store.addRecentWorkspace({
                id: `ws_${index}`,
                name: `workspace ${index}`,
                path: join(dir, `ws_${index}`),
                openedAt: new Date().toISOString(),
            });
        }

        const config = await store.get();
        expect(config.recentWorkspaces).toHaveLength(10);
        expect(config.recentWorkspaces[0]?.id).toBe("ws_11");
    });
});
