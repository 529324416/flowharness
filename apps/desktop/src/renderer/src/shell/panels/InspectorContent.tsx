import type { ReactElement } from "react";
import { Badge, Button, Input, StatusDot } from "../../ui";
import { MetaList } from "../../components/MetaList";
import styles from "./InspectorContent.module.css";

/** 属性检查面板内容；面板外框由 PanelFrame 提供。 */
export function InspectorContent(): ReactElement {
    return (
        <div className={styles.sections}>
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>节点</h3>
                <div className={styles.nodeRow}>
                    <StatusDot tone="running" pulse />
                    <span className={styles.nodeName}>Model Call</span>
                    <Badge variant="accent">运行中</Badge>
                </div>
                <MetaList
                    rows={[
                        ["类型", "core.model-call"],
                        ["节点 ID", "model"],
                        ["端口", "in 1 / out 1"],
                    ]}
                />
            </section>

            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>参数</h3>
                <Input label="Provider" value="deepseek" readOnly />
                <Input label="Model" value="deepseek-chat" readOnly />
                <div className={styles.checkRow}>
                    <span>流式输出</span>
                    <Badge variant="success">开启</Badge>
                </div>
            </section>

            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>运行</h3>
                <MetaList
                    rows={[
                        ["状态", "运行中"],
                        ["已耗时", "2.4s"],
                        ["runId", "run_01J9Z2K5T4"],
                    ]}
                />
                <Button size="sm" disabled>
                    查看完整日志
                </Button>
            </section>
        </div>
    );
}
