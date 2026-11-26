import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactElement,
} from "react";
import type { RunStatus } from "@flowharness/contracts";
import type { GraphDocument } from "wireclaw";
import { Badge, Button, EmptyState, type BadgeVariant } from "../ui";
import type { WorkbenchDefinition, WorkbenchViewProps } from "../workbench/types";
import { PlanNavigation } from "../shell/navigation/PlanNavigation";
import { createWorkbenchPlan, planGraphIds } from "../workbench/plan";
import styles from "./PlanRunnerWorkbench.module.css";

type StepStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

type StepState = {
    graphId: string;
    status: StepStatus;
    error?: string;
};

const TERMINAL: readonly RunStatus[] = [
    "completed",
    "failed",
    "cancelled",
    "interrupted",
];

function statusVariant(status: StepStatus): BadgeVariant {
    switch (status) {
        case "completed":
            return "success";
        case "failed":
            return "danger";
        case "cancelled":
            return "warning";
        case "running":
            return "accent";
        default:
            return "neutral";
    }
}

function PlanRunnerWorkbench({
    instance,
    workspace,
    documents,
    activeDocumentId,
    shell,
    onUpdateInstance,
}: WorkbenchViewProps): ReactElement {
    const initialSelection = () =>
        instance.plan === null
            ? activeDocumentId === null
                ? []
                : [activeDocumentId]
            : planGraphIds(instance.plan);

    const [selected, setSelected] = useState<string[]>(initialSelection);
    const [steps, setSteps] = useState<StepState[]>([]);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        shell.onRunControlsChange(null);
        shell.onSaveStatusChange(null);
        shell.onInspectorChange(null);
        shell.onProblemsChange(null);
        shell.onDocumentActionsChange(null);
        shell.onControllerChange(null);
    }, [shell]);

    useEffect(() => {
        if (instance.id.length === 0) return;
        if (instance.plan !== null) setSelected(planGraphIds(instance.plan));
        setSteps([]);
    }, [instance.id]);

    const toggle = useCallback((graphId: string): void => {
        setSelected((current) =>
            current.includes(graphId)
                ? current.filter((id) => id !== graphId)
                : [...current, graphId],
        );
    }, []);

    const savePlan = useCallback((): void => {
        onUpdateInstance((current) => ({
            ...current,
            plan: createWorkbenchPlan(selected),
            updatedAt: new Date().toISOString(),
        }));
    }, [onUpdateInstance, selected]);

    const runPlan = useCallback(async (): Promise<void> => {
        if (running || selected.length === 0) return;

        savePlan();
        setRunning(true);
        setError(null);
        setSteps(
            selected.map((graphId) => ({ graphId, status: "idle" as const })),
        );

        for (const [index, graphId] of selected.entries()) {
            if (!mountedRef.current) return;
            setSteps((current) =>
                current.map((step, stepIndex) =>
                    stepIndex === index
                        ? { graphId, status: "running" }
                        : step,
                ),
            );

            const snapshot = await window.flowharness.readDocument(
                workspace.id,
                { kind: "harness", id: graphId },
            );
            if (!snapshot.ok || snapshot.data === null) {
                setSteps((current) =>
                    current.map((step, stepIndex) =>
                        stepIndex === index
                            ? {
                                  graphId,
                                  status: "failed",
                                  error: snapshot.ok
                                      ? "图不存在"
                                      : snapshot.error.message,
                              }
                            : step,
                    ),
                );
                setError(snapshot.ok ? "图不存在" : snapshot.error.message);
                break;
            }

            const started = await window.flowharness.startRun({
                workspaceId: workspace.id,
                graph: snapshot.data.document as GraphDocument,
                input: { text: "" },
            });
            if (!started.ok) {
                setSteps((current) =>
                    current.map((step, stepIndex) =>
                        stepIndex === index
                            ? {
                                  graphId,
                                  status: "failed",
                                  error: started.error.message,
                              }
                            : step,
                    ),
                );
                setError(started.error.message);
                break;
            }

            const finalStatus = await waitForRun(started.data.runId);
            if (!mountedRef.current) return;

            setSteps((current) =>
                current.map((step, stepIndex) =>
                    stepIndex === index
                        ? {
                              graphId,
                              status:
                                  finalStatus === "completed"
                                      ? "completed"
                                      : finalStatus === "cancelled"
                                          ? "cancelled"
                                          : "failed",
                          }
                        : step,
                ),
            );

            if (finalStatus !== "completed") {
                setError(`步骤 ${String(index + 1)} 未完成：${finalStatus}`);
                break;
            }
        }

        if (mountedRef.current) setRunning(false);
    }, [running, savePlan, selected, workspace.id]);

    if (documents.length === 0) {
        return <EmptyState title="没有可编排的图" description="先新建一个工作流。" />;
    }

    return (
        <div className={styles.root}>
            <header className={styles.header}>
                <div>
                    <h2 className={styles.title}>{instance.title}</h2>
                    <p className={styles.meta}>
                        WorkbenchPlan · {selected.length} 个独立 run · 顺序执行
                    </p>
                </div>
                <div className={styles.actions}>
                    <Button size="sm" variant="secondary" onClick={savePlan}>
                        保存计划
                    </Button>
                    <Button
                        size="sm"
                        variant="primary"
                        disabled={running || selected.length === 0}
                        onClick={() => void runPlan()}
                    >
                        {running ? "运行中…" : "运行计划"}
                    </Button>
                </div>
            </header>

            {error === null ? null : <p className={styles.error}>{error}</p>}

            <div className={styles.columns}>
                <section className={styles.panel}>
                    <h3 className={styles.sectionTitle}>选择图</h3>
                    <ul className={styles.list}>
                        {documents.map((document) => (
                            <li key={document.id}>
                                <label className={styles.checkRow}>
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(document.id)}
                                        disabled={running}
                                        onChange={() => toggle(document.id)}
                                    />
                                    <span className={styles.docTitle}>
                                        {document.title}
                                    </span>
                                    <code className={styles.docId}>{document.id}</code>
                                </label>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={styles.panel}>
                    <h3 className={styles.sectionTitle}>执行</h3>
                    {steps.length === 0 ? (
                        <p className={styles.hint}>
                            勾选图并点击「运行计划」，每个图会作为独立 run 顺序执行。
                        </p>
                    ) : (
                        <ol className={styles.steps}>
                            {steps.map((step, index) => {
                                const document = documents.find(
                                    (item) => item.id === step.graphId,
                                );
                                return (
                                    <li key={`${step.graphId}-${String(index)}`} className={styles.step}>
                                        <span className={styles.stepIndex}>
                                            {index + 1}
                                        </span>
                                        <span className={styles.docTitle}>
                                            {document?.title ?? step.graphId}
                                        </span>
                                        <Badge variant={statusVariant(step.status)}>
                                            {step.status}
                                        </Badge>
                                        {step.error === undefined ? null : (
                                            <span className={styles.stepError}>
                                                {step.error}
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </section>
            </div>
        </div>
    );
}

async function waitForRun(runId: string): Promise<RunStatus> {
    for (;;) {
        const snapshot = await window.flowharness.getRun(runId);
        if (!snapshot.ok) return "failed";
        if (snapshot.data !== null && TERMINAL.includes(snapshot.data.status)) {
            return snapshot.data.status;
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
    }
}

export const planRunnerWorkbench: WorkbenchDefinition = {
    type: "plan-runner",
    title: "批量运行",
    description: "把多张图作为独立 run 顺序执行，验证 WorkbenchPlan",
    canOpen: () => true,
    navigation: { design: PlanNavigation },
    View: PlanRunnerWorkbench,
};
