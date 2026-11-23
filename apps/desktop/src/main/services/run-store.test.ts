import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunEventDto, RunSnapshot } from "@flowharness/contracts";
import { RunStore } from "./run-store";

const dirs: string[] = [];

async function makeStore(): Promise<RunStore> {
    const dir = await mkdtemp(join(tmpdir(), "fh-runs-"));
    dirs.push(dir);
    return new RunStore(join(dir, "runs"));
}

function snapshot(runId: string, status: RunSnapshot["status"]): RunSnapshot {
    return {
        runId,
        workspaceId: "ws_test",
        graphId: "graph-1",
        status,
        startedAt: 1000,
    };
}

const event: RunEventDto = {
    type: "node:start",
    runId: "run_1",
    nodeId: "n1",
    at: 1001,
};

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("RunStore", () => {
    it("persists meta, graph and events", async () => {
        const store = await makeStore();

        await store.start(snapshot("run_1", "running"), { id: "graph-1" });
        await store.appendEvents("run_1", [event]);
        await store.finish("run_1", "completed", 2000);

        const meta = await store.loadMeta("run_1");
        expect(meta?.status).toBe("completed");
        expect(meta?.endedAt).toBe(2000);
        expect(await store.loadGraph("run_1")).toEqual({ id: "graph-1" });
        expect(await store.list("ws_test")).toHaveLength(1);
    });

    it("persists and reloads checkpoints", async () => {
        const store = await makeStore();
        await store.start(snapshot("run_1", "running"), {});

        await store.saveCheckpoint("run_1", { version: 1, runId: "run_1" });

        expect(await store.loadCheckpoint("run_1")).toEqual({
            version: 1,
            runId: "run_1",
        });
    });

    it("marks leftover running runs as interrupted", async () => {
        const store = await makeStore();
        await store.start(snapshot("run_1", "running"), {});
        await store.start(snapshot("run_2", "completed"), {});

        const count = await store.markInterrupted();

        expect(count).toBe(1);
        expect((await store.loadMeta("run_1"))?.status).toBe("interrupted");
        expect((await store.loadMeta("run_2"))?.status).toBe("completed");
    });
});
