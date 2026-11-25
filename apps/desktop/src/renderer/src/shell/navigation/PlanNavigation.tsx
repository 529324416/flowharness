import type { ReactElement } from "react";
import type { WorkbenchNavigationProps } from "../../workbench/types";
import { Badge } from "../../ui";
import { NavigationPanel } from "./NavigationPanel";
import styles from "./PlanNavigation.module.css";

/** 批量运行工作台左栏：Plan 步骤列表。 */
export function PlanNavigation({
    instance,
    documents,
    width,
    onResize,
    onCollapse,
}: WorkbenchNavigationProps): ReactElement {
    const steps = instance.plan?.graphs ?? instance.graphs;
    const trigger = instance.plan?.trigger ?? "manual";

    return (
        <NavigationPanel
            title="Plan 步骤"
            badge={<Badge variant="neutral">{steps.length}</Badge>}
            footer={`触发：${trigger}`}
            width={width}
            onResize={onResize}
            onCollapse={onCollapse}
        >
            <div className={styles.list}>
                {steps.length === 0 ? (
                    <p className={styles.empty}>还没有 Plan 步骤</p>
                ) : (
                    steps.map((step, index) => {
                        const title =
                            documents.find((document) => document.id === step.graphId)
                                ?.title ?? step.graphId;
                        return (
                            <div
                                key={`${step.graphId}-${String(index)}`}
                                className={styles.item}
                            >
                                <span className={styles.index}>{index + 1}</span>
                                <span className={styles.itemMain}>
                                    <span className={styles.itemTitle}>{title}</span>
                                    <span className={styles.itemMeta}>{step.role}</span>
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
        </NavigationPanel>
    );
}
