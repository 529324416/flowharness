import { describe, expect, it } from "vitest";
import { parseSessionHistory } from "./session-history";

const ATTACHMENT_HASH = "b".repeat(64);

const history = {
    version: 2,
    id: "ses_demo",
    isArchived: false,
    messages: [
        {
            role: "user",
            isCompressed: false,
            content: [
                { type: "text", text: "帮我看看这个文件" },
                {
                    type: "attachment",
                    attachment: { contentHash: ATTACHMENT_HASH },
                },
            ],
        },
        {
            role: "assistant",
            isCompressed: false,
            content: "我先读取文件。",
            thinking: "用户需要文件内容。",
            usage: {
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15,
            },
            toolCalls: [
                {
                    id: "call-1",
                    name: "workspace__readFile",
                    params: { path: "a.txt" },
                },
            ],
            stopReason: "tool_call",
        },
        {
            role: "tool",
            isCompressed: false,
            content: "读取失败",
            toolName: "workspace__readFile",
            callId: "call-1",
            details: {
                isSuccess: false,
                duration: 1200,
                error: {
                    type: "Timeout",
                    retryable: true,
                    message: "读取超时",
                },
            },
            structuredContent: { ok: false },
        },
        {
            role: "system",
            isCompressed: true,
            content: "你是 FlowHarness 助手。",
        },
    ],
};

describe("parseSessionHistory", () => {
    it("projects wireclaw messages, tool calls and attachments", () => {
        const model = parseSessionHistory(history, "ses_fallback");

        expect(model.historyId).toBe("ses_demo");
        expect(model.attachmentHashes).toEqual([ATTACHMENT_HASH]);
        expect(model.messages).toHaveLength(4);

        const [user, assistant, tool, system] = model.messages;

        expect(user?.role).toBe("user");
        expect(user?.text).toBe("帮我看看这个文件");
        expect(user?.attachments).toEqual([
            { contentHash: ATTACHMENT_HASH },
        ]);

        expect(assistant?.role).toBe("assistant");
        expect(assistant?.thinking).toBe("用户需要文件内容。");
        expect(assistant?.usage?.totalTokens).toBe(15);
        expect(assistant?.toolCalls).toEqual([
            {
                id: "call-1",
                name: "workspace__readFile",
                params: { path: "a.txt" },
            },
        ]);
        expect(assistant?.stopReason).toBe("tool_call");

        expect(tool?.role).toBe("tool");
        expect(tool?.tool).toEqual({
            name: "workspace__readFile",
            callId: "call-1",
            isSuccess: false,
            duration: 1200,
            error: "读取超时",
        });
        expect(tool?.structuredContent).toEqual({ ok: false });

        expect(system?.role).toBe("system");
        expect(system?.isCompressed).toBe(true);
    });

    it("treats the M6.2 empty array as an empty history", () => {
        const model = parseSessionHistory([], "ses_empty");

        expect(model).toEqual({
            historyId: "ses_empty",
            isArchived: false,
            messages: [],
            attachmentHashes: [],
        });
    });

    it("rejects unknown history shapes", () => {
        expect(() => parseSessionHistory([{ role: "user" }], "ses_bad")).toThrow(
            /旧版会话历史/,
        );
        expect(() => parseSessionHistory({ version: 99 }, "ses_bad")).toThrow();
    });
});
