import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WindowStateStore } from "./window-state";

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fh-window-state-"));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("WindowStateStore", () => {
    it("returns null when the file does not exist", async () => {
        const store = new WindowStateStore(join(dir, "window-state.json"));
        await expect(store.load()).resolves.toBeNull();
    });

    it("persists and reloads bounds", async () => {
        const store = new WindowStateStore(join(dir, "window-state.json"));
        await store.save({ x: 120, y: 80, width: 1440, height: 900, maximized: true });

        await expect(store.load()).resolves.toEqual({
            x: 120,
            y: 80,
            width: 1440,
            height: 900,
            maximized: true,
        });
    });

    it("ignores corrupt or too-small state", async () => {
        const file = join(dir, "window-state.json");
        const store = new WindowStateStore(file);

        await writeFile(file, "{not-json", "utf8");
        await expect(store.load()).resolves.toBeNull();

        await writeFile(
            file,
            JSON.stringify({ x: 0, y: 0, width: 200, height: 200, maximized: false }),
            "utf8",
        );
        await expect(store.load()).resolves.toBeNull();
    });
});
