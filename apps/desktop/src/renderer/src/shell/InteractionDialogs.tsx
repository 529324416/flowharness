import { useEffect, useState, type ReactElement } from "react";
import type {
    ApprovalRequestPayload,
    UserInputAnswerDto,
    UserInputRequestPayload,
} from "@flowharness/contracts";
import { Button, Dialog, DialogContent } from "../ui";
import styles from "./InteractionDialogs.module.css";

export function ApprovalDialog({
    request,
    onDecide,
}: {
    request: ApprovalRequestPayload;
    onDecide: (decision: "approve" | "deny") => void;
}): ReactElement {
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onDecide("deny");
            }}
        >
            <DialogContent
                title="工具调用需要审批"
                description={`${request.toolName} · node ${request.nodeId}`}
                footer={
                    <>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDecide("deny")}
                        >
                            拒绝
                        </Button>
                        <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onDecide("approve")}
                        >
                            批准执行
                        </Button>
                    </>
                }
            >
                <p className={styles.note}>
                    请确认以下工具参数；批准后本次 run 将继续执行。
                </p>
                <pre className={styles.code}>
                    {JSON.stringify(request.arguments, null, 2)}
                </pre>
            </DialogContent>
        </Dialog>
    );
}

type AnswerDraft = {
    selected: string[];
    other: string;
};

export function UserInputDialog({
    request,
    onSubmit,
}: {
    request: UserInputRequestPayload;
    onSubmit: (
        answers: UserInputAnswerDto[],
        cancelled?: boolean,
    ) => void;
}): ReactElement {
    const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});

    useEffect(() => {
        setAnswers(
            Object.fromEntries(
                request.questions.map((question) => [
                    question.id,
                    { selected: [], other: "" },
                ]),
            ),
        );
    }, [request.requestId, request.questions]);

    const setAnswer = (
        questionId: string,
        patch: Partial<AnswerDraft>,
    ): void => {
        setAnswers((current) => ({
            ...current,
            [questionId]: {
                ...(current[questionId] ?? { selected: [], other: "" }),
                ...patch,
            },
        }));
    };

    const submit = (): void => {
        onSubmit(
            request.questions.map((question) => {
                const draft = answers[question.id] ?? {
                    selected: [],
                    other: "",
                };
                return {
                    questionId: question.id,
                    selected: draft.selected,
                    ...(draft.other.trim().length === 0
                        ? {}
                        : { other: draft.other.trim() }),
                };
            }),
        );
    };

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onSubmit([], true);
            }}
        >
            <DialogContent
                title={request.title ?? "需要你的输入"}
                description={`node ${request.nodeId}`}
                footer={
                    <>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onSubmit([], true)}
                        >
                            取消
                        </Button>
                        <Button size="sm" variant="primary" onClick={submit}>
                            提交
                        </Button>
                    </>
                }
            >
                <div className={styles.questions}>
                    {request.questions.map((question) => {
                        const draft = answers[question.id] ?? {
                            selected: [],
                            other: "",
                        };
                        return (
                            <section key={question.id} className={styles.question}>
                                <h3 className={styles.questionTitle}>
                                    {question.header ?? question.question}
                                </h3>
                                {question.header === undefined ? null : (
                                    <p className={styles.note}>{question.question}</p>
                                )}

                                <div className={styles.options}>
                                    {question.options.map((option) => (
                                        <label key={option.id} className={styles.option}>
                                            <input
                                                type={
                                                    question.multiSelect === true
                                                        ? "checkbox"
                                                        : "radio"
                                                }
                                                name={question.id}
                                                checked={draft.selected.includes(
                                                    option.id,
                                                )}
                                                onChange={(event) => {
                                                    if (
                                                        question.multiSelect === true
                                                    ) {
                                                        setAnswer(question.id, {
                                                            selected: event.target
                                                                .checked
                                                                ? [
                                                                      ...draft.selected,
                                                                      option.id,
                                                                  ]
                                                                : draft.selected.filter(
                                                                      (id) =>
                                                                          id !==
                                                                          option.id,
                                                                  ),
                                                        });
                                                    } else {
                                                        setAnswer(question.id, {
                                                            selected: [option.id],
                                                        });
                                                    }
                                                }}
                                            />
                                            <span>
                                                {option.label}
                                                {option.description === undefined ? null : (
                                                    <small className={styles.optionHint}>
                                                        {option.description}
                                                    </small>
                                                )}
                                            </span>
                                        </label>
                                    ))}
                                </div>

                                {question.allowOther === false ? null : (
                                    <input
                                        className={styles.other}
                                        value={draft.other}
                                        placeholder="其他（可选）"
                                        aria-label={`${question.question} 其他`}
                                        onChange={(event) =>
                                            setAnswer(question.id, {
                                                other: event.target.value,
                                            })
                                        }
                                    />
                                )}
                            </section>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
