import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    AssistantMessage,
    GraphNode,
    createBuiltinNodeRegistry,
    type AIProvider,
    type ChatResult,
    type GraphProviderResolver,
    type InputPortSpec,
    type Message,
    type NodeContext,
    type NodeInputValues,
    type NodeOutputValues,
    type OutputPortSpec,
    type SessionRuntimeOptions,
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

function createRuntime(
    store?: RunStore,
    resolveProvider?: GraphProviderResolver,
): {
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
        ...(resolveProvider ? { resolveProvider } : {}),
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

    it("resolves a provider and runs a Model -> Model Call graph", async () => {
        const fakeProvider = {
            title: "Fake",
            modelProvider: null,
            async chat(
                _messages: readonly Message[],
                _options: SessionRuntimeOptions,
            ): Promise<ChatResult> {
                return { message: new AssistantMessage("hello from fake") };
            },
        } as unknown as AIProvider;

        const { host, batches } = createRuntime(undefined, (providerId) =>
            providerId === "fake" ? fakeProvider : undefined,
        );

        const graph = {
            version: 1,
            id: "provider-graph",
            nodes: [
                {
                    id: "model",
                    type: "core.model",
                    typeVersion: 1,
                    config: { providerId: "fake", modelId: "fake-model" },
                },
                {
                    id: "prompt",
                    type: "core.constant",
                    typeVersion: 1,
                    config: { value: { type: "text", text: "hi" } },
                },
                {
                    id: "call",
                    type: "core.model.call",
                    typeVersion: 1,
                    config: { mode: "chat" },
                },
                { id: "output", type: "core.output", typeVersion: 1 },
            ],
            edges: [
                {
                    from: { nodeId: "model", port: "model" },
                    to: { nodeId: "call", port: "model" },
                },
                {
                    from: { nodeId: "prompt", port: "value" },
                    to: { nodeId: "call", port: "prompt" },
                },
                {
                    from: { nodeId: "call", port: "text" },
                    to: { nodeId: "output", port: "text" },
                },
            ],
        };

        const snapshot = await host.start({ graph });
        await waitFor(() => host.get(snapshot.runId)?.status === "completed");

        const events = batches.flatMap((batch) => batch.events);
        expect(events.find((event) => event.type === "run:end")).toMatchObject({
            status: "completed",
        });
        expect(
            events.find(
                (event) =>
                    event.type === "node:end" && event.nodeId === "output",
            ),
        ).toMatchObject({
            type: "node:end",
            outputs: {
                text: { type: "text", text: "hello from fake" },
            },
        });
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

        await waitForAsync(
            async () => (await store.loadResult(snapshot.runId)) !== undefined,
        );
        const result = await host.getResult(snapshot.runId);
        expect(result?.runId).toBe(snapshot.runId);
        expect(result?.graphId).toBe(snapshot.graphId);
        expect(result?.entries).toEqual([]);
    });

    it("resumes an interrupted run from persisted graph + checkpoint", async () => {
        const dir = await mkdtemp(join(tmpdir(), "fh-runtime-"));
        dirs.push(dir);
        const store = new RunStore(join(dir, "runs"));
        const first = createRuntime(store);

        const paused = await first.host.start({
            graph: SLOW_GRAPH,
            workspaceId: "ws_test",
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        await first.host.pause(paused.runId);
        await waitForAsync(
            async () => (await store.loadCheckpoint(paused.runId)) !== undefined,
        );

        const second = createRuntime(store);
        const resumed = await second.host.resumeInterrupted(
            "ws_test",
            paused.runId,
        );

        expect(resumed.runId).not.toBe(paused.runId);
        await waitFor(
            () => second.host.get(resumed.runId)?.status === "completed",
        );
        await waitForAsync(
            async () =>
                (await store.loadMeta(resumed.runId))?.status === "completed",
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
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
