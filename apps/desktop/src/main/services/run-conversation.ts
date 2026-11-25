import {
    assistant,
    ChatFailureReason,
    ChatStopReason,
    SessionSerializer,
    system,
    user,
} from "wireclaw";
import type {
    AttachmentRef,
    ChatFailureReason as ChatFailureReasonType,
    ChatStopReason as ChatStopReasonType,
    ContentPart,
    Message,
    MessageContent,
    RunResult,
} from "wireclaw";

/**
 * 把一次运行的 Agent / ModelCall 条目转换为 conversation 消息。
 *
 * - AgentRun 条目保留完整的 `SessionData`（system / user / assistant / tool）；
 * - ModelCall 条目按实际输入与输出重建 user / assistant 消息；
 * - 只写消息，不把 `RunResult` 或运行状态混进 conversation session。
 */
export function conversationMessagesFromRun(result: RunResult): Message[] {
    const messages: Message[] = [];

    for (const entry of result.entries) {
        if (entry.kind === "session") {
            const history = SessionSerializer.deserialize(entry.session);
            messages.push(...history.messages);
            continue;
        }

        if (entry.input.system !== undefined && entry.input.system.length > 0) {
            messages.push(system(entry.input.system));
        }

        messages.push(
            user(
                buildUserContent(
                    entry.input.prompt,
                    entry.input.attachments ?? [],
                ),
            ),
        );

        if (entry.output !== undefined) {
            messages.push(
                assistant(
                    entry.output.text,
                    entry.output.thinking,
                    entry.output.usage,
                    undefined,
                    asStopReason(entry.output.stopReason),
                    asFailureReason(entry.output.failureReason),
                ),
            );
        }
    }

    return messages;
}

function buildUserContent(
    prompt: string,
    attachments: readonly AttachmentRef[],
): MessageContent {
    if (attachments.length === 0) return prompt;

    const parts: ContentPart[] = [];
    if (prompt.length > 0) parts.push({ type: "text", text: prompt });
    for (const attachment of attachments) {
        parts.push({ type: "attachment", attachment });
    }
    return parts;
}

function asStopReason(value: string | undefined): ChatStopReasonType | undefined {
    if (value === undefined) return undefined;
    const allowed = Object.values(ChatStopReason) as string[];
    return allowed.includes(value) ? (value as ChatStopReasonType) : undefined;
}

function asFailureReason(
    value: string | undefined,
): ChatFailureReasonType | undefined {
    if (value === undefined) return undefined;
    const allowed = Object.values(ChatFailureReason) as string[];
    return allowed.includes(value) ? (value as ChatFailureReasonType) : undefined;
}
