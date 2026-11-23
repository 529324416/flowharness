/**
 * 通用「请求-响应」等待器：main 发请求给 renderer，等待对应 requestId 的回应，
 * 超时后落回默认值（审批默认拒绝、用户输入默认取消）。
 */
export class RequestBroker<TResult> {
    private readonly pending = new Map<
        string,
        { resolve: (value: TResult) => void; timer: NodeJS.Timeout }
    >();

    constructor(
        private readonly timeoutMs: number,
        private readonly onTimeout: (requestId: string) => TResult,
    ) {}

    wait(requestId: string): Promise<TResult> {
        return new Promise<TResult>((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                resolve(this.onTimeout(requestId));
            }, this.timeoutMs);

            this.pending.set(requestId, { resolve, timer });
        });
    }

    settle(requestId: string, value: TResult): boolean {
        const entry = this.pending.get(requestId);
        if (!entry) return false;

        clearTimeout(entry.timer);
        this.pending.delete(requestId);
        entry.resolve(value);
        return true;
    }

    /** 工作区关闭/窗口销毁时取消所有未决请求。 */
    settleAll(value: TResult): void {
        for (const requestId of [...this.pending.keys()]) {
            this.settle(requestId, value);
        }
    }

    get size(): number {
        return this.pending.size;
    }
}
