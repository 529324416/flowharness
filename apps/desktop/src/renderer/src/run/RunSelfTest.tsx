import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { RunEventBatch, RunSnapshot, RunStatus } from "@flowharness/contracts";
import { MetaList } from "../components/MetaList";
import { SELF_TEST_GRAPH, SELF_TEST_GRAPH_ID } from "./self-test-graph";

const STATUS_LABEL: Record<RunStatus, string> = {
    idle: "未运行",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    interrupted: "已中断",
};

function extractText(outputs: unknown): string | null {
    if (!outputs || typeof outputs !== "object") return null;

    const text = (outputs as { text?: unknown }).text;
    if (text && typeof text === "object" && "text" in text) {
        const value = (text as { text?: unknown }).text;
        return typeof value === "string" ? value : null;
    }

    try {
        return JSON.stringify(outputs);
    } catch {
        return null;
    }
}

type RunSelfTestProps = {
    autoStart?: boolean;
    onFinished?: (snapshot: RunSnapshot) => void;
};

/** Phase 2 自检：启动一个无 Provider 的最小 Graph，并消费 IPC 事件流。 */
export function RunSelfTest({
    autoStart = false,
    onFinished,
}: RunSelfTestProps): ReactElement {
    const [status, setStatus] = useState<RunStatus>("idle");
    const [runId, setRunId] = useState<string | null>(null);
    const [eventCount, setEventCount] = useState(0);
    const [output, setOutput] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const finishedRef = useRef(onFinished);
    finishedRef.current = onFinished;
    const autoStarted = useRef(false);

    useEffect(() => {
        return window.flowharness.onEvent((envelope) => {
            if (envelope.topic !== "run") return;
            const batch = envelope.payload as RunEventBatch;

            setEventCount((count) => count + batch.events.length);

            for (const event of batch.events) {
                if (event.type === "node:end") {
                    const text = extractText(event.outputs);
                    if (text !== null) setOutput(text);
                }

                if (event.type === "run:end") {
                    setStatus(event.status);
                    setOutput((current) => extractText(event.outputs) ?? current);
                    setRunId(batch.runId);
                    finishedRef.current?.({
                        ...batch.snapshot,
                        status: event.status,
                    });
                }
            }
        });
    }, []);

    const start = useCallback(async () => {
        setStatus("running");
        setError(null);
        setEventCount(0);
        setOutput(null);

        const result = await window.flowharness.startRun({ graph: SELF_TEST_GRAPH });

        if (!result.ok) {
            const message = result.error.message;
            setStatus("failed");
            setError(message);
            finishedRef.current?.({
                runId: "",
                graphId: SELF_TEST_GRAPH_ID,
                status: "failed",
                startedAt: Date.now(),
                error: message,
            });
            return;
        }

        setRunId(result.data.runId);
    }, []);

    useEffect(() => {
        if (!autoStart || autoStarted.current) return;
        autoStarted.current = true;
        void start();
    }, [autoStart, start]);

    return (
        <article className="card">
            <h2 className="card__title">运行自检</h2>
            <MetaList
                rows={[
                    ["状态", STATUS_LABEL[status]],
                    ["runId", runId ?? "—"],
                    ["事件数", String(eventCount)],
                    ["输出", output ?? "—"],
                ]}
            />
            <div className="card__actions">
                <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void start()}
                    disabled={status === "running"}
                >
                    {status === "running" ? "运行中…" : "运行最小 Graph"}
                </button>
            </div>
            {error ? <p className="card__error">{error}</p> : null}
        </article>
    );
}
