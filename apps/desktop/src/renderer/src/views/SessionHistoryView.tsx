import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { History, ImageOff, RefreshCw, Workflow } from "lucide-react";
import type { BlobMeta, SessionRecord, WorkspaceSummary } from "@flowharness/contracts";
import { Alert, Badge, Button, EmptyState, StatusDot } from "../ui";
import { cx } from "../ui/cx";
import { SESSION_TONE, type SessionSummary } from "../shell/sessions";
import {
    parseSessionHistory,
    type SessionHistoryAttachment,
    type SessionHistoryMessage,
    type SessionHistoryModel,
} from "../shell/session-history";
import styles from "./SessionHistoryView.module.css";

export type SessionHistoryViewProps = {
    workspace: WorkspaceSummary | null;
    session: SessionSummary | null;
    onOpenDesigner: () => void;
    /** 嵌入浮动面板时隐藏整页标题，只保留紧凑工具栏。 */
    embedded?: boolean;
};

const ROLE_LABEL: Record<SessionHistoryMessage["role"], string> = {
    user: "用户",
    assistant: "助手",
    system: "系统",
    tool: "工具",
};

/** 会话历史回放：消息、工具调用与附件。 */
export function SessionHistoryView({
    workspace,
    session,
    onOpenDesigner,
    embedded = false,
}: SessionHistoryViewProps): ReactElement {
    const workspaceId = workspace?.id ?? null;
    const sessionId = session?.id ?? null;

    const [record, setRecord] = useState<SessionRecord | null>(null);
    const [model, setModel] = useState<SessionHistoryModel | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    const [attachmentMeta, setAttachmentMeta] = useState<
        Record<string, BlobMeta | null>
    >({});

    useEffect(() => {
        if (workspaceId === null || sessionId === null) {
            setRecord(null);
            setModel(null);
            setError(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        void (async () => {
            try {
                const result = await window.flowharness.openSession({
                    workspaceId,
                    sessionId,
                });
                if (cancelled) return;

                if (!result.ok) {
                    setRecord(null);
                    setModel(null);
                    setError(result.error.message);
                    return;
                }

                setRecord(result.data);
                setModel(parseSessionHistory(result.data.history, result.data.id));
            } catch (cause) {
                if (cancelled) return;
                setRecord(null);
                setModel(null);
                setError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [workspaceId, sessionId, reloadToken]);

    const hashes = useMemo(
        () => model?.attachmentHashes ?? [],
        [model],
    );
    const hashKey = hashes.join(",");

    useEffect(() => {
        if (workspaceId === null || hashes.length === 0) {
            setAttachmentMeta({});
            return;
        }

        let cancelled = false;
        void Promise.all(
            hashes.map(async (hash) => {
                const result = await window.flowharness.statBlob(workspaceId, hash);
                return [hash, result.ok ? result.data : null] as const;
            }),
        ).then((entries) => {
            if (!cancelled) setAttachmentMeta(Object.fromEntries(entries));
        });

        return () => {
            cancelled = true;
        };
    }, [workspaceId, hashKey]);

    const reload = useCallback(() => {
        setReloadToken((current) => current + 1);
    }, []);

    const messageActions =
        model !== null && model.messages.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={onOpenDesigner}>
                <Workflow size={17} aria-hidden="true" />
                打开设计器
            </Button>
        ) : undefined;

    const countLabel =
        record !== null
            ? record.kind === "run"
                ? `${record.entryCount} 条结果`
                : `${record.messageCount} 条消息`
            : (session?.subtitle ?? "");

    return (
        <section
            className={cx(styles.root, embedded && styles.rootEmbedded)}
            aria-label="会话历史"
        >
            {embedded ? (
                <div className={styles.embeddedBar}>
                    <div className={styles.meta}>
                        <StatusDot
                            tone={
                                SESSION_TONE[
                                    record?.status ?? session?.status ?? "idle"
                                ]
                            }
                        />
                        <span>{countLabel}</span>
                        {record !== null ? (
                            <Badge variant="neutral">{record.id}</Badge>
                        ) : null}
                    </div>
                    <div className={styles.actions}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={reload}
                            disabled={
                                loading ||
                                workspaceId === null ||
                                sessionId === null
                            }
                        >
                            <RefreshCw size={17} aria-hidden="true" />
                            刷新
                        </Button>
                        {messageActions}
                    </div>
                </div>
            ) : (
                <header className={styles.header}>
                    <div className={styles.heading}>
                        <p className={styles.eyebrow}>SESSION HISTORY</p>
                        <h1 className={styles.title}>
                            {session?.title ?? "会话历史"}
                        </h1>
                        {session !== null ? (
                            <div className={styles.meta}>
                                <StatusDot
                                    tone={
                                        SESSION_TONE[
                                            record?.status ?? session.status
                                        ]
                                    }
                                />
                                <span>{countLabel}</span>
                                <span aria-hidden="true">·</span>
                                <span>{session.updatedAt}</span>
                                {workspace !== null ? (
                                    <>
                                        <span aria-hidden="true">·</span>
                                        <span>{workspace.name}</span>
                                    </>
                                ) : null}
                            </div>
                        ) : null}
                        {record !== null ? (
                            <div className={styles.meta}>
                                <Badge variant="neutral">{record.id}</Badge>
                                {model?.isArchived === true ? (
                                    <Badge variant="warning">已归档</Badge>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    <div className={styles.actions}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={reload}
                            disabled={
                                loading ||
                                workspaceId === null ||
                                sessionId === null
                            }
                        >
                            <RefreshCw size={17} aria-hidden="true" />
                            刷新
                        </Button>
                        {messageActions}
                    </div>
                </header>
            )}

            <div className={styles.body}>
                {workspaceId === null ? (
                    <EmptyState
                        icon={<History size={28} aria-hidden="true" />}
                        title="还没有工作区"
                        description="打开或新建一个工作区后，才能读取会话历史。"
                    />
                ) : sessionId === null ? (
                    <EmptyState
                        icon={<History size={28} aria-hidden="true" />}
                        title="选择一条会话"
                        description="左侧会话列表会展示当前工作区的持久化会话。"
                    />
                ) : loading ? (
                    <p className={styles.loading}>正在读取会话历史…</p>
                ) : error !== null ? (
                    <Alert tone="danger" title="无法读取会话历史">
                        {error}
                    </Alert>
                ) : model === null || model.messages.length === 0 ? (
                    <EmptyState
                        icon={<History size={28} aria-hidden="true" />}
                        title="这条会话还没有消息"
                        description="历史消息由 wireclaw SessionData 写入；跑一次 Agent 节点或保存历史后，会在这里回放消息、工具调用与附件。"
                        action={
                            <Button variant="secondary" size="sm" onClick={onOpenDesigner}>
                                <Workflow size={17} aria-hidden="true" />
                                打开设计器
                            </Button>
                        }
                    />
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
            </div>
        </section>
    );
}

function MessageCard({
    message,
    workspaceId,
    attachmentMeta,
}: {
    message: SessionHistoryMessage;
    workspaceId: string;
    attachmentMeta: Record<string, BlobMeta | null>;
}): ReactElement {
    return (
        <li className={cx(styles.message, styles[`role-${message.role}`])}>
            <header className={styles.messageHeader}>
                <span className={styles.role}>{ROLE_LABEL[message.role]}</span>
                {message.isCompressed ? (
                    <Badge variant="neutral">已压缩</Badge>
                ) : null}
                {message.failureReason !== undefined ? (
                    <Badge variant="danger">{message.failureReason}</Badge>
                ) : null}
                {message.usage !== undefined ? (
                    <span className={styles.usage}>
                        {message.usage.totalTokens} tokens
                    </span>
                ) : null}
            </header>

            {message.thinking !== undefined && message.thinking.length > 0 ? (
                <details className={styles.details}>
                    <summary>思考过程</summary>
                    <pre>{message.thinking}</pre>
                </details>
            ) : null}

            {message.text.length > 0 ? (
                <p className={styles.text}>{message.text}</p>
            ) : null}

            {message.attachments.length > 0 ? (
                <div className={styles.attachments}>
                    {message.attachments.map((attachment) => (
                        <AttachmentCard
                            key={attachment.contentHash}
                            workspaceId={workspaceId}
                            attachment={attachment}
                            meta={attachmentMeta[attachment.contentHash] ?? null}
                        />
                    ))}
                </div>
            ) : null}

            {message.toolCalls.length > 0 ? (
                <div className={styles.toolCalls}>
                    {message.toolCalls.map((call) => (
                        <details key={call.id} className={styles.details}>
                            <summary>
                                调用工具 <strong>{call.name}</strong>
                            </summary>
                            <pre>{JSON.stringify(call.params, null, 2)}</pre>
                        </details>
                    ))}
                </div>
            ) : null}

            {message.tool !== undefined ? (
                <div className={styles.toolResult}>
                    <div className={styles.toolResultHeader}>
                        <span className={styles.toolName}>{message.tool.name}</span>
                        <Badge
                            variant={message.tool.isSuccess ? "success" : "danger"}
                        >
                            {message.tool.isSuccess ? "成功" : "失败"}
                        </Badge>
                        <span className={styles.usage}>
                            {formatDuration(message.tool.duration)}
                        </span>
                    </div>
                    {message.tool.error !== undefined ? (
                        <p className={styles.errorText}>{message.tool.error}</p>
                    ) : null}
                    {message.structuredContent !== undefined ? (
                        <details className={styles.details}>
                            <summary>结构化结果</summary>
                            <pre>{JSON.stringify(message.structuredContent, null, 2)}</pre>
                        </details>
                    ) : null}
                </div>
            ) : null}

            {message.stopReason !== undefined ? (
                <p className={styles.footnote}>停止原因：{message.stopReason}</p>
            ) : null}
        </li>
    );
}

function AttachmentCard({
    workspaceId,
    attachment,
    meta,
}: {
    workspaceId: string;
    attachment: SessionHistoryAttachment;
    meta: BlobMeta | null;
}): ReactElement {
    const url = `fh-asset://${workspaceId}/${attachment.contentHash}`;
    const isImage =
        meta !== null && meta.mimeType.toLowerCase().startsWith("image/");

    return (
        <figure className={styles.attachment}>
            {isImage ? (
                <img
                    src={url}
                    alt={meta?.name ?? attachment.contentHash}
                    loading="lazy"
                />
            ) : (
                <div className={styles.attachmentPlaceholder}>
                    <ImageOff size={22} aria-hidden="true" />
                </div>
            )}
            <figcaption>
                <span className={styles.attachmentName}>
                    {meta?.name ?? `${attachment.contentHash.slice(0, 12)}…`}
                </span>
                <span className={styles.attachmentMeta}>
                    {meta === null ? "附件不可用" : formatBytes(meta.size)}
                </span>
            </figcaption>
        </figure>
    );
}

function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}
