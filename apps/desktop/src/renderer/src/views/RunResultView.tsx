import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import type { BlobMeta } from "@flowharness/contracts";
import type {
    AttachmentRef,
    HarnessValue,
    RunResult,
    RunResultEntry,
    RunResultModelCallEntry,
    RunResultSessionEntry,
} from "wireclaw";
import { Alert, Badge, EmptyState, type BadgeVariant } from "../ui";
import { parseSessionHistory } from "../shell/session-history";
import { MessageCard, formatBytes, formatDuration } from "./SessionMessageCard";
import styles from "./RunResultView.module.css";

export type RunResultViewProps = {
    workspaceId: string;
    result: RunResult;
    /** 面板工具栏动作（例如「保存到会话」）。 */
    actions?: ReactNode;
};

/** 运行结果回放：输出、模型调用与 Agent 会话条目。 */
export function RunResultView({
    workspaceId,
    result,
    actions,
}: RunResultViewProps): ReactElement {
    const outputHashes = useMemo(
        () =>
            Object.values(result.outputs).flatMap((value) =>
                attachmentRefsOf(value).map((ref) => ref.contentHash),
            ),
        [result.outputs],
    );
    const entryHashes = useMemo(
        () => result.entries.flatMap(entryAttachmentHashes),
        [result.entries],
    );
    const attachmentMeta = useAttachmentMeta(workspaceId, [
        ...outputHashes,
        ...entryHashes,
    ]);

    return (
        <section className={styles.root} aria-label="运行结果">
            <header className={styles.header}>
                <div className={styles.heading}>
                    <div className={styles.meta}>
                        <Badge variant={statusTone(result.status)}>
                            {statusLabel(result.status)}
                        </Badge>
                        <span className={styles.graphId}>{result.graphId}</span>
                        <span>{result.runId}</span>
                    </div>
                    <p className={styles.timing}>
                        开始 {formatTime(result.startedAt)} · 耗时{" "}
                        {formatDuration(result.endedAt - result.startedAt)} ·{" "}
                        {result.entries.length} 条结果
                    </p>
                </div>
                {actions !== undefined ? (
                    <div className={styles.actions}>{actions}</div>
                ) : null}
            </header>

            {result.error !== undefined ? (
                <Alert tone="danger" title="运行失败">
                    {result.error}
                </Alert>
            ) : null}

            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>输出</h3>
                {Object.keys(result.outputs).length === 0 ? (
                    <p className={styles.empty}>这次运行没有输出值。</p>
                ) : (
                    <div className={styles.outputs}>
                        {Object.entries(result.outputs).map(([name, value]) => (
                            <article key={name} className={styles.output}>
                                <h4 className={styles.outputName}>{name}</h4>
                                <HarnessValueView
                                    value={value}
                                    workspaceId={workspaceId}
                                    attachmentMeta={attachmentMeta}
                                />
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>结果条目</h3>
                {result.entries.length === 0 ? (
                    <EmptyState
                        compact
                        title="没有模型或 Agent 记录"
                        description="纯 Constant / Output 运行不会产生结果条目；Agent 与模型调用会在这里汇总。"
                    />
                ) : (
                    <div className={styles.entries}>
                        {result.entries.map((entry) => (
                            <EntryCard
                                key={entry.id}
                                entry={entry}
                                workspaceId={workspaceId}
                                attachmentMeta={attachmentMeta}
                            />
                        ))}
                    </div>
                )}
            </section>
        </section>
    );
}

function EntryCard({
    entry,
    workspaceId,
    attachmentMeta,
}: {
    entry: RunResultEntry;
    workspaceId: string;
    attachmentMeta: Record<string, BlobMeta | null>;
}): ReactElement {
    return entry.kind === "model-call" ? (
        <ModelCallEntry
            entry={entry}
            workspaceId={workspaceId}
            attachmentMeta={attachmentMeta}
        />
    ) : (
        <SessionEntry
            entry={entry}
            workspaceId={workspaceId}
            attachmentMeta={attachmentMeta}
        />
    );
}

function ModelCallEntry({
    entry,
    workspaceId,
    attachmentMeta,
}: {
    entry: RunResultModelCallEntry;
    workspaceId: string;
    attachmentMeta: Record<string, BlobMeta | null>;
}): ReactElement {
    const outputAttachments = entry.output?.attachments ?? [];

    return (
        <article className={styles.entry}>
            <header className={styles.entryHeader}>
                <Badge variant="accent">模型</Badge>
                <Badge variant={entryStatusTone(entry)}>{entry.status}</Badge>
                <span className={styles.entryTitle}>
                    {entry.nodeId} · {entry.mode}
                </span>
                <span className={styles.entryMeta}>
                    {entry.providerId}/{entry.modelId}
                </span>
                <span className={styles.entryMeta}>
                    {formatDuration(entry.endedAt - entry.startedAt)}
                </span>
            </header>

            {entry.graphPath !== undefined ? (
                <p className={styles.graphPath}>{entry.graphPath.join(" / ")}</p>
            ) : null}

            {entry.input.system !== undefined ? (
                <div className={styles.block}>
                    <span className={styles.blockLabel}>system</span>
                    <pre className={styles.code}>{entry.input.system}</pre>
                </div>
            ) : null}

            <div className={styles.block}>
                <span className={styles.blockLabel}>prompt</span>
                <pre className={styles.code}>{entry.input.prompt}</pre>
            </div>

            <AttachmentGrid
                workspaceId={workspaceId}
                refs={entry.input.attachments ?? []}
                attachmentMeta={attachmentMeta}
            />

            {entry.output?.thinking !== undefined ? (
                <details className={styles.details}>
                    <summary>思考过程</summary>
                    <pre className={styles.code}>{entry.output.thinking}</pre>
                </details>
            ) : null}

            {entry.output?.text !== undefined && entry.output.text.length > 0 ? (
                <div className={styles.block}>
                    <span className={styles.blockLabel}>输出</span>
                    <pre className={styles.code}>{entry.output.text}</pre>
                </div>
            ) : null}

            <AttachmentGrid
                workspaceId={workspaceId}
                refs={outputAttachments}
                attachmentMeta={attachmentMeta}
            />

            <footer className={styles.entryFooter}>
                {entry.output?.usage !== undefined ? (
                    <span>{entry.output.usage.totalTokens} tokens</span>
                ) : null}
                {entry.output?.stopReason !== undefined ? (
                    <span>停止原因：{entry.output.stopReason}</span>
                ) : null}
                {entry.output?.failureReason !== undefined ? (
                    <span>失败原因：{entry.output.failureReason}</span>
                ) : null}
            </footer>

            {entry.error !== undefined ? (
                <p className={styles.error}>{entry.error}</p>
            ) : null}
        </article>
    );
}

function SessionEntry({
    entry,
    workspaceId,
    attachmentMeta,
}: {
    entry: RunResultSessionEntry;
    workspaceId: string;
    attachmentMeta: Record<string, BlobMeta | null>;
}): ReactElement {
    const model = useMemo(
        () => parseSessionHistory(entry.session, entry.id),
        [entry.session, entry.id],
    );

    return (
        <article className={styles.entry}>
            <header className={styles.entryHeader}>
                <Badge variant="accent">Agent</Badge>
                <Badge variant={entryStatusTone(entry)}>{entry.status}</Badge>
                <span className={styles.entryTitle}>{entry.nodeId}</span>
                <span className={styles.entryMeta}>
                    {entry.providerId}/{entry.modelId}
                </span>
                <span className={styles.entryMeta}>
                    {model.messages.length} 条消息
                </span>
                <span className={styles.entryMeta}>
                    {formatDuration(entry.endedAt - entry.startedAt)}
                </span>
            </header>

            {entry.graphPath !== undefined ? (
                <p className={styles.graphPath}>{entry.graphPath.join(" / ")}</p>
            ) : null}

            {model.messages.length === 0 ? (
                <p className={styles.empty}>这次 Agent 运行没有留下会话消息。</p>
            ) : (
                <ol className={styles.timeline}>
                    {model.messages.map((message) => (
                        <MessageCard
                            key={message.id}
                            message={message}
                            workspaceId={workspaceId}
                            attachmentMeta={attachmentMeta}
                        />
                    ))}
                </ol>
            )}

            {entry.error !== undefined ? (
                <p className={styles.error}>{entry.error}</p>
            ) : null}
        </article>
    );
}

function HarnessValueView({
    value,
    workspaceId,
    attachmentMeta,
}: {
    value: HarnessValue;
    workspaceId: string;
    attachmentMeta: Record<string, BlobMeta | null>;
}): ReactElement {
    if (value.type === "text") {
        return <pre className={styles.code}>{value.text}</pre>;
    }
    if (value.type === "attachments") {
        return (
            <AttachmentGrid
                workspaceId={workspaceId}
                refs={value.attachments}
                attachmentMeta={attachmentMeta}
            />
        );
    }
    if (value.type === "attachment") {
        return (
            <AttachmentGrid
                workspaceId={workspaceId}
                refs={[value.attachment]}
                attachmentMeta={attachmentMeta}
            />
        );
    }
    const json = value.type === "json" ? value.value : value;
    return <pre className={styles.code}>{jsonText(json)}</pre>;
}

function AttachmentGrid({
    workspaceId,
    refs,
    attachmentMeta,
}: {
    workspaceId: string;
    refs: readonly AttachmentRef[];
    attachmentMeta: Record<string, BlobMeta | null>;
}): ReactElement | null {
    if (refs.length === 0) return null;

    return (
        <div className={styles.attachments}>
            {refs.map((ref) => {
                const meta = attachmentMeta[ref.contentHash] ?? null;
                const url = `fh-asset://${workspaceId}/${ref.contentHash}`;
                const isImage =
                    meta !== null &&
                    meta.mimeType.toLowerCase().startsWith("image/");
                return (
                    <figure key={ref.contentHash} className={styles.attachment}>
                        {isImage ? (
                            <img
                                src={url}
                                alt={meta?.name ?? ref.contentHash}
                                loading="lazy"
                            />
                        ) : (
                            <div className={styles.attachmentPlaceholder}>
                                <ImageOff size={20} aria-hidden="true" />
                            </div>
                        )}
                        <figcaption>
                            <span className={styles.attachmentName}>
                                {meta?.name ?? `${ref.contentHash.slice(0, 12)}…`}
                            </span>
                            <span className={styles.attachmentSize}>
                                {meta === null ? "附件不可用" : formatBytes(meta.size)}
                            </span>
                        </figcaption>
                    </figure>
                );
            })}
        </div>
    );
}

function useAttachmentMeta(
    workspaceId: string,
    hashes: readonly string[],
): Record<string, BlobMeta | null> {
    const [meta, setMeta] = useState<Record<string, BlobMeta | null>>({});
    const key = [...new Set(hashes)].join(",");

    useEffect(() => {
        const unique = key.length === 0 ? [] : key.split(",");
        if (unique.length === 0) {
            setMeta({});
            return;
        }

        let cancelled = false;
        void Promise.all(
            unique.map(async (hash) => {
                const result = await window.flowharness.statBlob(
                    workspaceId,
                    hash,
                );
                return [hash, result.ok ? result.data : null] as const;
            }),
        ).then((entries) => {
            if (!cancelled) setMeta(Object.fromEntries(entries));
        });

        return () => {
            cancelled = true;
        };
    }, [workspaceId, key]);

    return meta;
}

function attachmentRefsOf(value: HarnessValue): readonly AttachmentRef[] {
    if (value.type === "attachments") return value.attachments;
    if (value.type === "attachment") return [value.attachment];
    return [];
}

function entryAttachmentHashes(entry: RunResultEntry): string[] {
    if (entry.kind === "model-call") {
        return [
            ...(entry.input.attachments ?? []),
            ...(entry.output?.attachments ?? []),
        ].map((ref) => ref.contentHash);
    }

    try {
        return parseSessionHistory(entry.session, entry.id).attachmentHashes;
    } catch {
        return [];
    }
}

function jsonText(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function formatTime(at: number): string {
    return new Date(at).toLocaleString("zh-CN", { hour12: false });
}

function statusLabel(status: RunResult["status"]): string {
    switch (status) {
        case "completed":
            return "已完成";
        case "failed":
            return "失败";
        case "cancelled":
            return "已取消";
        case "paused":
            return "已暂停";
        default:
            return "运行中";
    }
}

function statusTone(status: RunResult["status"]): BadgeVariant {
    switch (status) {
        case "completed":
            return "success";
        case "failed":
            return "danger";
        case "cancelled":
        case "paused":
            return "warning";
        default:
            return "accent";
    }
}

function entryStatusTone(
    entry: RunResultEntry,
): BadgeVariant {
    return entry.status === "completed" ? "success" : "danger";
}
