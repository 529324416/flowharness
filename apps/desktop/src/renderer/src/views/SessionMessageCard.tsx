import type { ReactElement } from "react";
import { ImageOff } from "lucide-react";
import type { BlobMeta } from "@flowharness/contracts";
import { Badge } from "../ui";
import { cx } from "../ui/cx";
import type {
    SessionHistoryAttachment,
    SessionHistoryMessage,
} from "../shell/session-history";
import styles from "./SessionHistoryView.module.css";

const ROLE_LABEL: Record<SessionHistoryMessage["role"], string> = {
    user: "用户",
    assistant: "助手",
    system: "系统",
    tool: "工具",
};

/** 一条会话消息（对话回放与 run 会话里的 Agent 记录共用）。 */
export function MessageCard({
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

export function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}
