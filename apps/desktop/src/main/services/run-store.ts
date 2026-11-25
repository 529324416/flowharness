import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { RunEventDto, RunSnapshot, RunStatus } from "@flowharness/contracts";
import { readJsonFile, writeJsonFile } from "./atomic-file";

export type RunMeta = RunSnapshot;

/** RuntimeHost 依赖的持久化接口；测试可用内存实现。 */
export interface RunStorePort {
    start(meta: RunSnapshot, graph: unknown): Promise<void>;
    appendEvents(runId: string, events: readonly RunEventDto[]): Promise<void>;
    finish(runId: string, status: RunStatus, endedAt: number, error?: string): Promise<void>;
    /** 非终态状态切换（paused / running）；不写 endedAt。 */
    updateStatus?(runId: string, status: RunStatus): Promise<void>;
    saveCheckpoint(runId: string, checkpoint: unknown): Promise<void>;
    /** 持久化版本化 RunResult（`runs/<runId>/result.json`）。 */
    saveResult?(runId: string, result: unknown): Promise<void>;
    loadMeta(runId: string): Promise<RunSnapshot | undefined>;
    loadGraph(runId: string): Promise<unknown | undefined>;
    loadCheckpoint(runId: string): Promise<unknown | undefined>;
    loadResult?(runId: string): Promise<unknown | undefined>;
    list(workspaceId?: string): Promise<RunSnapshot[]>;
    /** 启动/打开工作区时调用：把遗留的 running 标记为 interrupted。 */
    markInterrupted(): Promise<number>;
}

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * run 持久化：`runs/<runId>/{meta.json,graph.json,events.jsonl,checkpoint.json}`。
 *
 * 写入失败（受限环境/磁盘问题）只告警一次并继续运行，内存中的 run 不受影响。
 */
export class RunStore implements RunStorePort {
    private readonly queues = new Map<string, Promise<void>>();
    private warned = false;

    constructor(private readonly root: string) {}

    async start(meta: RunSnapshot, graph: unknown): Promise<void> {
        await this.safeWrite(async () => {
            const dir = this.runDir(meta.runId);
            await fs.mkdir(dir, { recursive: true });
            await writeJsonFile(join(dir, "graph.json"), graph);
            await writeJsonFile(join(dir, "meta.json"), meta);
        });
    }

    async appendEvents(runId: string, events: readonly RunEventDto[]): Promise<void> {
        if (events.length === 0) return;

        const payload = events.map((event) => `${JSON.stringify(event)}\n`).join("");

        await this.safeWrite(async () => {
            const dir = this.runDir(runId);
            await fs.mkdir(dir, { recursive: true });
            await this.enqueue(runId, () =>
                fs.appendFile(join(dir, "events.jsonl"), payload, "utf8"),
            );
        });
    }

    async finish(
        runId: string,
        status: RunStatus,
        endedAt: number,
        error?: string,
    ): Promise<void> {
        await this.safeWrite(async () => {
            const meta = await this.loadMeta(runId);
            if (!meta) return;
            await writeJsonFile(join(this.runDir(runId), "meta.json"), {
                ...meta,
                status,
                endedAt,
                ...(error === undefined ? {} : { error }),
            });
        });
    }

    async updateStatus(runId: string, status: RunStatus): Promise<void> {
        await this.safeWrite(async () => {
            const meta = await this.loadMeta(runId);
            if (!meta) return;
            await writeJsonFile(join(this.runDir(runId), "meta.json"), {
                ...meta,
                status,
            });
        });
    }

    async saveCheckpoint(runId: string, checkpoint: unknown): Promise<void> {
        await this.safeWrite(async () => {
            await writeJsonFile(join(this.runDir(runId), "checkpoint.json"), checkpoint);
        });
    }

    async saveResult(runId: string, result: unknown): Promise<void> {
        await this.safeWrite(async () => {
            await writeJsonFile(join(this.runDir(runId), "result.json"), result);
        });
    }

    async loadMeta(runId: string): Promise<RunSnapshot | undefined> {
        return this.safeRead(() => readJsonFile<RunSnapshot>(join(this.runDir(runId), "meta.json")));
    }

    async loadGraph(runId: string): Promise<unknown | undefined> {
        return this.safeRead(() => readJsonFile<unknown>(join(this.runDir(runId), "graph.json")));
    }

    async loadCheckpoint(runId: string): Promise<unknown | undefined> {
        return this.safeRead(() =>
            readJsonFile<unknown>(join(this.runDir(runId), "checkpoint.json")),
        );
    }

    async loadResult(runId: string): Promise<unknown | undefined> {
        return this.safeRead(() =>
            readJsonFile<unknown>(join(this.runDir(runId), "result.json")),
        );
    }

    async list(workspaceId?: string): Promise<RunSnapshot[]> {
        let entries;
        try {
            entries = await fs.readdir(this.root, { withFileTypes: true });
        } catch {
            return [];
        }

        const metas: RunSnapshot[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name)) continue;
            const meta = await this.loadMeta(entry.name);
            if (!meta) continue;
            if (workspaceId !== undefined && meta.workspaceId !== workspaceId) continue;
            metas.push(meta);
        }

        return metas.sort((a, b) => b.startedAt - a.startedAt);
    }

    async markInterrupted(): Promise<number> {
        const metas = await this.list();
        let count = 0;

        for (const meta of metas) {
            if (meta.status !== "running") continue;
            await this.safeWrite(async () => {
                await writeJsonFile(join(this.runDir(meta.runId), "meta.json"), {
                    ...meta,
                    status: "interrupted",
                    endedAt: Date.now(),
                });
            });
            count += 1;
        }

        return count;
    }

    private runDir(runId: string): string {
        if (!RUN_ID_PATTERN.test(runId)) {
            throw new Error(`invalid run id: ${runId}`);
        }
        return join(this.root, runId);
    }

    private async enqueue(runId: string, task: () => Promise<void>): Promise<void> {
        const previous = this.queues.get(runId) ?? Promise.resolve();
        const next = previous.then(task, task);
        this.queues.set(
            runId,
            next.then(
                () => undefined,
                () => undefined,
            ),
        );
        await next;
    }

    private async safeWrite(action: () => Promise<void>): Promise<void> {
        try {
            await action();
        } catch (error) {
            if (!this.warned) {
                this.warned = true;
                console.warn(
                    "[run-store] persistence unavailable; continuing in memory",
                    (error as Error).message,
                );
            }
        }
    }

    private async safeRead<T>(action: () => Promise<T | undefined>): Promise<T | undefined> {
        try {
            return await action();
        } catch {
            return undefined;
        }
    }
}
