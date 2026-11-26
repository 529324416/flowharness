import { randomBytes } from "node:crypto";
import {
    createBuiltinNodeRegistry,
    createRunResult,
    deserializeGraph,
    RunResultSerializer,
    type AttachmentFileManager,
    type Graph,
    type GraphCheckpoint,
    type GraphEvent,
    type GraphHost,
    type GraphProviderResolver,
    type GraphRun,
    type GraphRunInput,
    type GraphRunOptions,
    type GraphRunResult,
    type NodeTypeRegistry,
    type RunResult,
    type ToolRegistry,
    type ToolApprovalDecision,
    type ToolApprovalRequest,
    type UserInputRequest,
    type UserInputResult,
} from "wireclaw";
import {
    FhError,
    type RunEventBatch,
    type RunEventDto,
    type RunSnapshot,
    type RunStartRequest,
    type RunStatus,
} from "@flowharness/contracts";
import type { RunStorePort } from "./run-store";

export type ApprovalAsk = {
    requestId: string;
    runId: string;
    nodeId: string;
    request: ToolApprovalRequest;
};

export type UserInputAsk = {
    requestId: string;
    runId: string;
    nodeId: string;
    request: UserInputRequest;
};

export type RuntimeHostOptions = {
    /** 批量事件出口（main 侧接 IPC 广播）。 */
    publish: (batch: RunEventBatch) => void;
    approval: { ask: (request: ApprovalAsk) => Promise<ToolApprovalDecision> };
    userInput: { ask: (request: UserInputAsk) => Promise<UserInputResult> };
    registry?: NodeTypeRegistry;
    attachmentsFor?: (workspaceId: string) => AttachmentFileManager | undefined;
    toolsFor?: (workspaceId: string) => ToolRegistry | undefined;
    resolveProvider?: GraphProviderResolver;
    storeFor?: (workspaceId: string) => RunStorePort | undefined;
    now?: () => number;
    flushIntervalMs?: number;
};

type ActiveRun = {
    snapshot: RunSnapshot;
    graph: Graph;
    run: GraphRun;
    controller: AbortController;
    store?: RunStorePort;
    buffer: RunEventDto[];
    flushTimer?: NodeJS.Timeout;
    /** 启动请求的 input，用于生成 RunResult。 */
    input?: GraphRunInput;
    /** 运行结束后聚合的版本化结果。 */
    result?: RunResult;
};

type FinishedRun = {
    snapshot: RunSnapshot;
    result?: RunResult;
};

const MAX_FINISHED_RUNS = 100;

/**
 * FH 唯一的执行入口：反序列化 GraphDocument、装配 GraphHost、管理 run 生命周期，
 * 把 wireclaw 事件投影成 FH DTO 并节流广播。
 */
export class RuntimeHost {
    private readonly registry: NodeTypeRegistry;
    private readonly active = new Map<string, ActiveRun>();
    private readonly finished = new Map<string, FinishedRun>();
    private readonly now: () => number;
    private readonly flushIntervalMs: number;

    constructor(private readonly options: RuntimeHostOptions) {
        this.registry = options.registry ?? createBuiltinNodeRegistry();
        this.now = options.now ?? Date.now;
        this.flushIntervalMs = options.flushIntervalMs ?? 16;
    }

    async start(request: RunStartRequest): Promise<RunSnapshot> {
        const graph = this.deserialize(request.graph);
        const runId = `run_${randomBytes(6).toString("hex")}`;
        const startedAt = this.now();
        const controller = new AbortController();
        const store =
            request.workspaceId === undefined
                ? undefined
                : this.options.storeFor?.(request.workspaceId);

        const snapshot: RunSnapshot = {
            runId,
            graphId: graph.id,
            status: "running",
            startedAt,
            ...(request.workspaceId === undefined ? {} : { workspaceId: request.workspaceId }),
            ...(request.workbenchId === undefined ? {} : { workbenchId: request.workbenchId }),
        };

        const active: ActiveRun = {
            snapshot,
            graph,
            // 先用占位，随后立即替换；事件在 start 返回前通过 pending 缓冲。
            run: undefined as unknown as GraphRun,
            controller,
            store,
            buffer: [],
            ...(request.input === undefined
                ? {}
                : { input: request.input as GraphRunInput }),
        };

        const pending: GraphEvent[] = [];
        let live = false;

        active.run = graph.run({
            host: this.createHost(runId, request),
            input: request.input as GraphRunOptions["input"],
            signal: controller.signal,
            maxConcurrency: request.maxConcurrency,
            ...(request.checkpoint === undefined
                ? {}
                : { checkpoint: request.checkpoint as GraphCheckpoint }),
            listener: (event) => {
                if (live) this.handleEvent(active, event);
                else pending.push(event);
            },
        });

        live = true;
        this.active.set(runId, active);

        for (const event of pending) {
            this.handleEvent(active, event);
        }

        void active.run.done.then(
            (result) => this.complete(active, result),
            (error) => this.fail(active, error),
        );

        if (store) {
            void store.start(snapshot, request.graph).catch(() => undefined);
        }

        return { ...snapshot };
    }

    /**
     * 从 RunStore 恢复暂停/中断的 run。
     *
     * graph 与 checkpoint 都来自持久化记录；恢复会创建新的 runId，
     * 旧 run 保留在历史中。
     */
    async resumeInterrupted(
        workspaceId: string,
        runId: string,
    ): Promise<RunSnapshot> {
        const store = this.options.storeFor?.(workspaceId);
        if (store === undefined) {
            throw new FhError("E_INVALID_ARGUMENT", "workspace has no run store");
        }

        const meta = await store.loadMeta(runId);
        if (meta === undefined) {
            throw new FhError("E_NOT_FOUND", `run not found: ${runId}`);
        }
        // running 也可能来自异常退出（meta 尚未 markInterrupted），只要有 checkpoint 就允许恢复。
        if (
            meta.status !== "paused" &&
            meta.status !== "interrupted" &&
            meta.status !== "running"
        ) {
            throw new FhError(
                "E_CONFLICT",
                `run cannot be resumed from status ${meta.status}`,
            );
        }

        const graph = await store.loadGraph(runId);
        if (graph === undefined) {
            throw new FhError("E_NOT_FOUND", `graph snapshot not found: ${runId}`);
        }
        const checkpoint = await store.loadCheckpoint(runId);
        if (checkpoint === undefined) {
            throw new FhError(
                "E_NOT_FOUND",
                `checkpoint not found: ${runId}`,
            );
        }

        return this.start({
            workspaceId,
            graph,
            checkpoint,
            ...(meta.workbenchId === undefined
                ? {}
                : { workbenchId: meta.workbenchId }),
        });
    }

    async pause(runId: string): Promise<RunSnapshot> {
        const active = this.requireActive(runId);

        if (active.snapshot.status !== "running") {
            throw new FhError("E_CONFLICT", `run is not running: ${active.snapshot.status}`);
        }

        let checkpoint: GraphCheckpoint;

        try {
            checkpoint = await active.run.pause();
        } catch (error) {
            throw new FhError("E_RUNTIME", `failed to pause run: ${errorMessage(error)}`);
        }

        active.snapshot.status = "paused";
        this.flush(active);

        if (active.store) {
            void active.store
                .saveCheckpoint(runId, checkpoint)
                .then(() => active.store?.updateStatus?.(runId, "paused"))
                .catch(() => undefined);
        }

        return { ...active.snapshot };
    }

    resume(runId: string): RunSnapshot {
        const active = this.requireActive(runId);

        if (active.snapshot.status !== "paused") {
            throw new FhError("E_CONFLICT", `run is not paused: ${active.snapshot.status}`);
        }

        if (!active.run.resume()) {
            throw new FhError("E_CONFLICT", "run cannot be resumed");
        }

        active.snapshot.status = "running";
        void active.store?.updateStatus?.(runId, "running").catch(() => undefined);
        this.flush(active);
        return { ...active.snapshot };
    }

    cancel(runId: string): void {
        const active = this.requireActive(runId);
        active.controller.abort();
        active.run.cancel();
    }

    get(runId: string): RunSnapshot | null {
        const active = this.active.get(runId);
        if (active) return { ...active.snapshot };
        const finished = this.finished.get(runId);
        return finished ? { ...finished.snapshot } : null;
    }

    /**
     * 读取一次运行的 RunResult。
     *
     * 当前进程内完成的 run 直接命中内存；提供 workspaceId 时可从 RunStore
     * 跨重启读取。结果始终经过 wireclaw 的序列化校验。
     */
    async getResult(
        runId: string,
        workspaceId?: string,
    ): Promise<RunResult | null> {
        const finished = this.finished.get(runId);
        if (finished?.result !== undefined) return finished.result;

        if (workspaceId !== undefined) {
            const store = this.options.storeFor?.(workspaceId);
            const raw = await store?.loadResult?.(runId);
            if (raw !== undefined) {
                try {
                    return RunResultSerializer.deserialize(raw);
                } catch {
                    return null;
                }
            }
        }

        return null;
    }

    /** 运行中已采集的 RunResult entries；结束后返回最终结果里的 entries。 */
    getEntries(runId: string): readonly unknown[] {
        const active = this.active.get(runId);
        if (active) return active.run.resultEntries;

        const finished = this.finished.get(runId);
        return finished?.result?.entries ?? [];
    }

    list(workspaceId?: string): RunSnapshot[] {
        const snapshots = [
            ...this.active.values(),
            ...this.finished.values(),
        ]
            .map((entry) => ({ ...entry.snapshot }))
            .filter(
                (snapshot) =>
                    workspaceId === undefined || snapshot.workspaceId === workspaceId,
            );

        return snapshots.sort((a, b) => b.startedAt - a.startedAt);
    }

    private createHost(runId: string, request: RunStartRequest): GraphHost {
        const attachments =
            request.workspaceId === undefined
                ? undefined
                : this.options.attachmentsFor?.(request.workspaceId);

        const tools =
            request.workspaceId === undefined
                ? undefined
                : this.options.toolsFor?.(request.workspaceId);

        return {
            resolveProvider: this.options.resolveProvider ?? (() => undefined),
            ...(tools === undefined ? {} : { tools }),
            attachments,
            onToolApproval: (toolRequest, nodeId) =>
                this.options.approval.ask({
                    requestId: `req_${randomBytes(5).toString("hex")}`,
                    runId,
                    nodeId,
                    request: toolRequest,
                }),
            onUserInput: (inputRequest, nodeId) =>
                this.options.userInput.ask({
                    requestId: `req_${randomBytes(5).toString("hex")}`,
                    runId,
                    nodeId,
                    request: inputRequest,
                }),
            parameters: request.parameters,
            log: (level, message, data) => {
                if (level === "error") console.error("[run]", message, data);
                else console.log(`[run] ${level}: ${message}`, data ?? "");
            },
        };
    }

    private handleEvent(active: ActiveRun, event: GraphEvent): void {
        const dto = toRunEventDto(event);
        active.buffer.push(dto);

        if (event.type === "run:end") {
            active.snapshot.status = mapStatus(event.status);
            active.snapshot.endedAt = event.at;
            this.flush(active);
            return;
        }

        this.scheduleFlush(active);
    }

    private scheduleFlush(active: ActiveRun): void {
        if (active.flushTimer) return;

        active.flushTimer = setTimeout(() => {
            active.flushTimer = undefined;
            this.flush(active);
        }, this.flushIntervalMs);
    }

    private flush(active: ActiveRun): void {
        if (active.flushTimer) {
            clearTimeout(active.flushTimer);
            active.flushTimer = undefined;
        }

        const events = active.buffer.splice(0);
        if (events.length === 0) return;

        this.options.publish({
            runId: active.snapshot.runId,
            snapshot: { ...active.snapshot },
            events,
        });

        if (active.store) {
            void active.store
                .appendEvents(active.snapshot.runId, events)
                .catch(() => undefined);
        }
    }

    private complete(active: ActiveRun, result: GraphRunResult): void {
        active.snapshot.status = mapStatus(result.status);
        active.snapshot.endedAt = result.endedAt;

        if (result.error !== undefined) {
            active.snapshot.error = errorMessage(result.error);
        }

        // wireclaw 结果里的 runId 是引擎内部 id；FH 以自身 runId 持久化与展示，
        // 因此落盘前统一改写为稳定 runId（graphId 与快照一致）。
        active.result = {
            ...createRunResult(result, active.input),
            runId: active.snapshot.runId,
            graphId: active.snapshot.graphId,
        };
        this.persistResult(active);
        this.flush(active);
        this.retire(active);
    }

    private fail(active: ActiveRun, error: unknown): void {
        active.snapshot.status = "failed";
        active.snapshot.endedAt = this.now();
        active.snapshot.error = errorMessage(error);

        active.result = createRunResult({
            runId: active.snapshot.runId,
            graphId: active.graph.id,
            status: "failed",
            outputs: {},
            records: [],
            entries: [],
            startedAt: active.snapshot.startedAt,
            endedAt: active.snapshot.endedAt,
            error,
        }, active.input);
        this.persistResult(active);
        this.flush(active);
        this.retire(active);
    }

    private persistResult(active: ActiveRun): void {
        if (active.result === undefined || active.store?.saveResult === undefined) {
            return;
        }

        void active.store
            .saveResult(active.snapshot.runId, active.result)
            .catch(() => undefined);
    }

    private retire(active: ActiveRun): void {
        const { runId } = active.snapshot;

        if (active.flushTimer) {
            clearTimeout(active.flushTimer);
            active.flushTimer = undefined;
        }

        this.flush(active);
        this.active.delete(runId);
        this.finished.set(runId, {
            snapshot: { ...active.snapshot },
            ...(active.result === undefined ? {} : { result: active.result }),
        });

        if (active.store) {
            void active.store
                .finish(
                    runId,
                    active.snapshot.status,
                    active.snapshot.endedAt ?? this.now(),
                    active.snapshot.error,
                )
                .catch(() => undefined);
        }

        if (this.finished.size > MAX_FINISHED_RUNS) {
            const oldest = this.finished.keys().next().value;
            if (oldest !== undefined) this.finished.delete(oldest);
        }
    }

    private requireActive(runId: string): ActiveRun {
        const active = this.active.get(runId);
        if (!active) {
            throw new FhError("E_NOT_FOUND", `run is not active: ${runId}`);
        }
        return active;
    }

    private deserialize(graph: unknown): Graph {
        try {
            return deserializeGraph(graph, { registry: this.registry });
        } catch (error) {
            throw new FhError(
                "E_INVALID_ARGUMENT",
                `invalid harness graph: ${errorMessage(error)}`,
            );
        }
    }
}

function toRunEventDto(event: GraphEvent): RunEventDto {
    switch (event.type) {
        case "run:start":
            return {
                type: "run:start",
                runId: event.runId,
                graphId: event.graphId,
                at: event.at,
            };
        case "node:start":
            return { type: "node:start", runId: event.runId, nodeId: event.nodeId, at: event.at };
        case "node:stream":
            return {
                type: "node:stream",
                runId: event.runId,
                nodeId: event.nodeId,
                port: event.port,
                chunk: event.chunk,
                at: event.at,
            };
        case "node:end":
            return {
                type: "node:end",
                runId: event.runId,
                nodeId: event.nodeId,
                outputs: event.outputs,
                at: event.at,
            };
        case "node:skipped":
            return {
                type: "node:skipped",
                runId: event.runId,
                nodeId: event.nodeId,
                at: event.at,
            };
        case "node:error":
            return {
                type: "node:error",
                runId: event.runId,
                nodeId: event.nodeId,
                message: errorMessage(event.error),
                at: event.at,
            };
        case "custom":
            return {
                type: "custom",
                runId: event.runId,
                nodeId: event.nodeId,
                name: event.name,
                payload: event.payload,
                seq: event.seq,
                at: event.at,
            };
        case "run:paused":
            return { type: "run:paused", runId: event.runId, at: event.at };
        case "run:resumed":
            return { type: "run:resumed", runId: event.runId, at: event.at };
        case "run:end":
            return {
                type: "run:end",
                runId: event.runId,
                status: mapStatus(event.status),
                outputs: event.outputs,
                at: event.at,
            };
    }
}

function mapStatus(status: GraphRun["status"]): RunStatus {
    switch (status) {
        case "running":
        case "paused":
        case "completed":
        case "failed":
        case "cancelled":
            return status;
        default:
            return "failed";
    }
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}
