import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecretsStore, type SecretCipher } from "./secrets";

const dirs: string[] = [];

async function makeDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "fh-secrets-"));
    dirs.push(dir);
    return dir;
}

const fakeCipher: SecretCipher = {
    isAvailable: () => true,
    encrypt: (value) => new TextEncoder().encode(`enc:${value}`),
    decrypt: (value) => new TextDecoder().decode(value).replace(/^enc:/, ""),
};

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SecretsStore", () => {
    it("stores, reads and deletes secrets", async () => {
        const dir = await makeDir();
        const store = new SecretsStore(join(dir, "secrets.bin"), fakeCipher);

        expect(await store.has("deepseek")).toBe(false);

        await store.set("deepseek", "sk-test-value");
        expect(await store.has("deepseek")).toBe(true);
        expect(await store.get("deepseek")).toBe("sk-test-value");

        expect(await store.delete("deepseek")).toBe(true);
        expect(await store.get("deepseek")).toBeUndefined();
        expect(await store.delete("deepseek")).toBe(false);
    });

    it("never writes the plaintext value", async () => {
        const dir = await makeDir();
        const file = join(dir, "secrets.bin");
        const store = new SecretsStore(file, fakeCipher);

        await store.set("deepseek", "sk-plain-secret");
        const raw = await readFile(file, "utf8");

        expect(raw).not.toContain("sk-plain-secret");
        expect(raw).toContain("deepseek");
    });

    it("fails closed when secure storage is unavailable", async () => {
        const dir = await makeDir();
        const store = new SecretsStore(join(dir, "secrets.bin"), {
            ...fakeCipher,
            isAvailable: () => false,
        });

        await expect(store.set("deepseek", "value")).rejects.toMatchObject({
            code: "E_PERMISSION",
        });
    });

    it("rejects unsafe provider ids", async () => {
        const dir = await makeDir();
        const store = new SecretsStore(join(dir, "secrets.bin"), fakeCipher);

        await expect(store.set("../evil", "value")).rejects.toMatchObject({
            code: "E_INVALID_ARGUMENT",
        });
    });
});
