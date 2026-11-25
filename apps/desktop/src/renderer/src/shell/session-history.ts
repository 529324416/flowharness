import {
    ChatRoleAssistant,
    ChatRoleTool,
    isContentHash,
    SessionSerializer,
    type ChatUsage,
    type MessageContent,
} from "wireclaw";

/** 回放模型里的附件引用；文件名 / MIME 由 Blob 元信息补充。 */
export type SessionHistoryAttachment = {
    contentHash: string;
};

export type SessionHistoryToolCall = {
    id: string;
    name: string;
    params: unknown;
};

export type SessionHistoryToolResult = {
    name: string;
    callId: string;
    isSuccess: boolean;
    duration: number;
    error?: string;
};

export type SessionHistoryMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    text: string;
    attachments: SessionHistoryAttachment[];
    thinking?: string;
    usage?: ChatUsage;
    toolCalls: SessionHistoryToolCall[];
    tool?: SessionHistoryToolResult;
    structuredContent?: unknown;
    stopReason?: string;
    failureReason?: string;
    isCompressed: boolean;
};

export type SessionHistoryModel = {
    /** 历史文档自己的 id；旧记录可能为空，回退到 FH session id。 */
    historyId: string;
    isArchived: boolean;
    messages: SessionHistoryMessage[];
    /** 所有消息引用到的附件，去重后供 Blob 元信息查询。 */
    attachmentHashes: string[];
};

export const EMPTY_SESSION_HISTORY: SessionHistoryModel = {
    historyId: "",
    isArchived: false,
    messages: [],
    attachmentHashes: [],
};

/**
 * 把 `SessionRecord.history` 解析为回放模型。
 *
 * - 历史格式归 wireclaw：先用 `SessionSerializer` 校验并迁移，再读取规范化后的数据；
 * - M6.2 的 `[]` 空数组视为空会话；
 * - 其他未知形状直接抛错，由视图展示错误态，不静默吞掉。
 */
export function parseSessionHistory(
    raw: unknown,
    fallbackId: string,
): SessionHistoryModel {
    if (Array.isArray(raw)) {
        if (raw.length === 0) {
            return { ...EMPTY_SESSION_HISTORY, historyId: fallbackId };
        }
        throw new Error("旧版会话历史只支持空数组");
    }

    const history = SessionSerializer.deserialize(raw);
    const data = SessionSerializer.serialize(history);

    const messages = data.messages.map((message, index) => {
        const content = readContent(message.content);
        const base: SessionHistoryMessage = {
            id: `message-${index}`,
            role: message.role,
            text: content.text,
            attachments: content.attachments,
            toolCalls: [],
            isCompressed: message.isCompressed,
        };

        if (message.role === ChatRoleAssistant) {
            base.thinking = message.thinking;
            base.usage = message.usage;
            base.toolCalls = message.toolCalls.map((call) => ({
                id: call.id,
                name: call.name,
                params: call.params,
            }));
            base.stopReason = message.stopReason;
            base.failureReason = message.failureReason;
        }

        if (message.role === ChatRoleTool) {
            base.tool = {
                name: message.toolName,
                callId: message.callId,
                isSuccess: message.details.isSuccess,
                duration: message.details.duration,
                ...(message.details.error === undefined
                    ? {}
                    : { error: message.details.error.message }),
            };
            base.structuredContent = message.structuredContent;
        }

        return base;
    });

    const attachmentHashes = [
        ...new Set(
            messages
                .flatMap((message) =>
                    message.attachments.map((attachment) => attachment.contentHash),
                )
                .filter(isContentHash),
        ),
    ];

    return {
        historyId: data.id.length > 0 ? data.id : fallbackId,
        isArchived: data.isArchived,
        messages,
        attachmentHashes,
    };
}

function readContent(content: MessageContent): {
    text: string;
    attachments: SessionHistoryAttachment[];
} {
    if (typeof content === "string") {
        return { text: content, attachments: [] };
    }

    const texts: string[] = [];
    const attachments: SessionHistoryAttachment[] = [];

    for (const part of content) {
        if (part.type === "text") {
            texts.push(part.text);
        } else {
            attachments.push({ contentHash: part.attachment.contentHash });
        }
    }

    return { text: texts.join("\n"), attachments };
}
