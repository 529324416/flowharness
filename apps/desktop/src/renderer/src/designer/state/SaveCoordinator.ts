import type { GraphDocument } from "wireclaw";

export type SaveState =
    | { status: "saved"; error: null }
    | { status: "pending"; error: null }
    | { status: "saving"; error: null }
    | { status: "conflict"; error: string }
    | { status: "error"; error: string };

export type SaveOutcome =
    | { ok: true; revision: string }
    | { ok: false; code: string; message: string };

export type SaveFunction = (
    document: GraphDocument,
    baseRevision: string,
) => Promise<SaveOutcome>;

/**
 * 自动保存协调器。
 *
 * - update 后 400ms 保存；
 * - 保存串行化，编辑期间不会并发写；
 * - E_CONFLICT 停止自动保存并进入 conflict 状态，等待重新加载；
 * - dispose 取消计时，已发出的请求仍会完成但不再回调。
 */
export class SaveCoordinator {
    private revision: string;
    private document: GraphDocument;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private chain: Promise<void> = Promise.resolve();
    private stopped = false;
    private dirty = false;
    private state: SaveState = { status: "saved", error: null };

    constructor(
        document: GraphDocument,
        revision: string,
        private readonly save: SaveFunction,
        private readonly onState: (state: SaveState) => void,
        private readonly delayMs = 400,
    ) {
        this.document = document;
        this.revision = revision;
    }

    update(document: GraphDocument): void {
        this.document = document;
        if (this.stopped) return;

        this.dirty = true;
        this.set({ status: "pending", error: null });
        this.schedule();
    }

    async flush(): Promise<SaveState> {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.stopped || !this.dirty) return this.state;

        await this.enqueue();
        return this.state;
    }

    dispose(): void {
        this.stopped = true;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    getState(): SaveState {
        return this.state;
    }

    private schedule(): void {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.enqueue();
        }, this.delayMs);
    }

    private enqueue(): Promise<void> {
        this.chain = this.chain.then(() => this.performSave());
        return this.chain;
    }

    private async performSave(): Promise<void> {
        if (this.stopped) return;

        const document = this.document;
        const baseRevision = this.revision;
        this.set({ status: "saving", error: null });

        try {
            const outcome = await this.save(document, baseRevision);
            if (this.stopped) return;

            if (outcome.ok) {
                this.revision = outcome.revision;
                if (this.document === document) {
                    this.dirty = false;
                    this.set({ status: "saved", error: null });
                } else {
                    this.set({ status: "pending", error: null });
                }
                return;
            }

            if (outcome.code === "E_CONFLICT") {
                this.stopped = true;
                this.set({ status: "conflict", error: outcome.message });
                return;
            }

            this.set({ status: "error", error: outcome.message });
        } catch (error) {
            if (this.stopped) return;
            this.set({
                status: "error",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private set(state: SaveState): void {
        this.state = state;
        this.onState(state);
    }
}
