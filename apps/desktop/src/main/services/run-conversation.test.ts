import { describe, expect, it } from "vitest";
import {
    assistant,
    ChatStopReason,
    SessionHistory,
    SessionSerializer,
    system,
    user,
} from "wireclaw";
import type { RunResult } from "wireclaw";
import { conversationMessagesFromRun } from "./run-conversation";

function runResult(entries: RunResult["entries"]): RunResult {
    return {
        version: 1,
        runId: "run_1",
        graphId: "main",
        status: "completed",
        startedAt: 1,
        endedAt: 2,
        outputs: {},
        entries,
    };
}

describe("conversationMessagesFromRun", () => {
    it("rebuilds ModelCall system / user / assistant messages", () => {
        const messages = conversationMessagesFromRun(
            runResult([
                {
                    kind: "model-call",
                    id: "entry-1",
                    nodeId: "call",
                    nodeType: "core.model.call",
                    providerId: "fake",
                    modelId: "echo",
                    mode: "chat",
                    status: "completed",
                    startedAt: 1,
                    endedAt: 2,
                    input: {
                        prompt: "hello",
                        system: "be brief",
                        attachments: [{ contentHash: "a".repeat(64) }],
                    },
                    output: {
                        text: "hi",
                        thinking: "reasoning",
                        usage: {
                            promptTokens: 1,
                            completionTokens: 2,
                            totalTokens: 3,
                        },
                        stopReason: ChatStopReason.Stop,
                    },
                },
            ]),
        );

        expect(messages.map((message) => message.role)).toEqual([
            "system",
            "user",
            "assistant",
        ]);
        expect(messages[1]?.content).toEqual([
            { type: "text", text: "hello" },
            {
                type: "attachment",
                attachment: { contentHash: "a".repeat(64) },
            },
        ]);
        expect(messages[2]?.content).toBe("hi");
    });

    it("keeps Agent SessionData messages in order", () => {
        const history = new SessionHistory("ses_1", [
            system("agent system"),
            user("agent input"),
            assistant("agent reply"),
        ]);

        const messages = conversationMessagesFromRun(
            runResult([
                {
                    kind: "session",
                    id: "entry-2",
                    nodeId: "agent",
                    nodeType: "core.agent.run",
                    providerId: "fake",
                    modelId: "echo",
                    status: "completed",
                    startedAt: 1,
                    endedAt: 2,
                    session: SessionSerializer.serialize(history),
                },
            ]),
        );

        expect(messages.map((message) => message.role)).toEqual([
            "system",
            "user",
            "assistant",
        ]);
        expect(messages.map((message) => message.content)).toEqual([
            "agent system",
            "agent input",
            "agent reply",
        ]);
    });
});
