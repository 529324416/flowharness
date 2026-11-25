import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceToolRegistry } from "./workspace-tools";

const dirs: string[] = [];

afterEach(async () => {
    await Promise.all(
        dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
});

describe("createWorkspaceToolRegistry", () => {
    it("registers workspace-scoped file tools", async () => {
        const dir = await mkdtemp(join(tmpdir(), "fh-tools-"));
        dirs.push(dir);

        const registry = createWorkspaceToolRegistry(dir);
        const tools = await registry.listTools();

        expect(tools.map((tool) => tool.name).sort()).toEqual([
            "workspace__readFile",
            "workspace__writeFile",
        ]);
    });
});
