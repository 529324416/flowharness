import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    GraphNode,
    createBuiltinNodeRegistry,
    type InputPortSpec,
    type NodeContext,
    type NodeInputValues,
    type NodeOutputValues,
    type OutputPortSpec,
} from "wireclaw";
import type { RunEventBatch } from "@flowharness/contracts";
import { RunStore } from "./run-store";
import { RuntimeHost } from "./runtime-host";

const dirs: string[] = [];

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const SELF_TEST_GRAPH = {
    version: 1,
    id: "self-test",
    nodes: [
        {
            id: "constant",
            type: "core.constant",
            typeVersion: 1,
            config: { value: { type: "text", text: "hello" } },
        },
        { id: "output", type: "core.output", typeVersion: 1 },
    ],
    edges: [
        {
            from: { nodeId: "constant", port: "value" },
            to: { nodeId: "output", port: "text" },
        },
    ],
} as const;

class SlowNode extends GraphNode {
    override readonly type = "test.slow";

    override get inputs(): readonly InputPortSpec[] {
        return [];
    }

    override get outputs(): readonly OutputPortSpec[] {
        return [
            {
                name: "value",
                type: "any",
                supportedModes: ["value"],
                defaultMode: "value",
            },
        ];
    }

    override async execute(
        _ctx: NodeContext,
        _inputs: NodeInputValues,
    ): Promise<NodeOutputValues> {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return { value: { type: "text", text: "slow done" } };
    }
}

const SLOW_GRAPH = {
    version: 1,
    id: "slow-graph",
    nodes: [
        { id: "slow", type: "test.slow", typeVersion: 1 },
        { id: "output", type: "core.output", typeVersion: 1 },
    ],
    edges: [
        {
            from: { nodeId: "slow", port: "value" },
            to: { nodeId: "output", port: "text" },
        },
    ],
} as const;

function createRuntime(store?: RunStore): {
    host: RuntimeHost;
    batches: RunEventBatch[];
} {
    const registry = createBuiltinNodeRegistry();
    registry.register({
        type: "test.slow",
        version: 1,
        title: "Slow",
        create: (id, config, inputs, ui) => new SlowNode(id, config, inputs, ui),
    });

    const batches: RunEventBatch[] = [];

    const host = new RuntimeHost({
        registry,
        publish: (batch) => {
            batches.push(batch);
        },
        approval: { ask: async () => "deny" },
        userInput: {
            ask: async (ask) => ({
                requestId: ask.requestId,
                answers: [],
                cancelled: true,
            }),
        },
        flushIntervalMs: 1,
        ...(store ? { storeFor: () => store } : {}),
    });

    return { host, batches };
}

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("condition not met in time");
}

async function waitForAsync(
    check: () => Promise<boolean>,
    timeoutMs = 5000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("condition not met in time");
}

describe("RuntimeHost", () => {
    it("runs a provider-free graph and publishes projected events", async () => {
        const { host, batches } = createRuntime();
        const snapshot = await host.start({ graph: SELF_TEST_GRAPH });

        expect(snapshot.status).toBe("running");
        await waitFor(() => host.get(snapshot.runId)?.status === "completed");

        const events = batches.flatMap((batch) => batch.events);

        expect(events.some((event) => event.type === "run:start")).toBe(true);
        expect(events.some((event) => event.type === "node:end")).toBe(true);
        expect(events.find((event) => event.type === "run:end")).toMatchObject({
            type: "run:end",
            status: "completed",
        });
        expect(host.list()).toHaveLength(1);
    });

    it("rejects an invalid graph document", async () => {
        const { host } = createRuntime();

        await expect(
            host.start({ graph: { nodes: "not-an-array" } }),
        ).rejects.toMatchObject({ code: "E_INVALID_ARGUMENT" });
    });

    it("pauses and resumes a running graph", async () => {
        const { host } = createRuntime();
        const snapshot = await host.start({ graph: SLOW_GRAPH });

        await new Promise((resolve) => setTimeout(resolve, 20));
        const paused = await host.pause(snapshot.runId);
        expect(paused.status).toBe("paused");

        const resumed = host.resume(snapshot.runId);
        expect(resumed.status).toBe("running");

        await waitFor(() => host.get(snapshot.runId)?.status === "completed");
    });

    it("persists a completed run when a workspace is provided", async () => {
        const dir = await mkdtemp(join(tmpdir(), "fh-runtime-"));
        dirs.push(dir);
        const store = new RunStore(join(dir, "runs"));
        const { host } = createRuntime(store);

        const snapshot = await host.start({
            graph: SELF_TEST_GRAPH,
            workspaceId: "ws_test",
        });

        await waitFor(() => host.get(snapshot.runId)?.status === "completed");
        await waitForAsync(
            async () => (await store.loadMeta(snapshot.runId))?.status === "completed",
        );

        expect((await store.list("ws_test"))[0]?.runId).toBe(snapshot.runId);
    });

    it("persists a checkpoint when the run is paused", async () => {
        const dir = await mkdtemp(join(tmpdir(), "fh-runtime-"));
        dirs.push(dir);
        const store = new RunStore(join(dir, "runs"));
        const { host } = createRuntime(store);

        const snapshot = await host.start({
            graph: SLOW_GRAPH,
            workspaceId: "ws_test",
        });

        await new Promise((resolve) => setTimeout(resolve, 20));
        await host.pause(snapshot.runId);

        await waitForAsync(
            async () => (await store.loadCheckpoint(snapshot.runId)) !== undefined,
        );

        host.resume(snapshot.runId);
        await waitFor(() => host.get(snapshot.runId)?.status === "completed");
    });
});
