import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
    Badge,
    Button,
    CodeArea,
    EmptyState,
    StatusDot,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    type StatusTone,
} from "../../ui";
import { MetaList } from "../../components/MetaList";
import type {
    InspectorGraphModel,
    InspectorModel,
    InspectorNodeModel,
} from "../../inspector/model";
import { NodeConfigForm } from "../../inspector/NodeConfigForm";
import type { CanvasStatus } from "../../canvas/core/types";
import styles from "./InspectorContent.module.css";

const STATUS_LABEL: Record<CanvasStatus, string> = {
    idle: "未运行",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    skipped: "已跳过",
};

const STATUS_TONE: Record<CanvasStatus, StatusTone> = {
    idle: "idle",
    running: "running",
    paused: "paused",
    completed: "completed",
    failed: "failed",
    skipped: "skipped",
};

/** 属性检查面板内容；面板外框由 PanelFrame 提供。 */
export function InspectorContent({
    model,
}: {
    model: InspectorModel | null;
}): ReactElement {
    if (model === null || model.graph === null) {
        return (
            <EmptyState
                compact
                title="尚无工作流"
                description="打开工作区后，这里显示图与节点属性"
            />
        );
    }

    return model.node === null ? (
        <GraphInspector graph={model.graph} />
    ) : (
        <NodeInspector
            node={model.node}
            canEdit={model.canEdit}
            onUpdateConfig={model.onUpdateConfig}
        />
    );
}

function GraphInspector({ graph }: { graph: InspectorGraphModel }): ReactElement {
    return (
        <div className={styles.sections}>
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>工作流</h3>
                <div className={styles.nodeRow}>
                    <span className={styles.nodeName}>{graph.title ?? "未命名工作流"}</span>
                </div>
                <MetaList
                    rows={[
                        ["Graph ID", graph.id],
                        ["节点", String(graph.nodeCount)],
                        ["连线", String(graph.edgeCount)],
                        [
                            "视口",
                            `${Math.round(graph.viewport.x)}, ${Math.round(
                                graph.viewport.y,
                            )} · ${Math.round(graph.viewport.zoom * 100)}%`,
                        ],
                    ]}
                />
            </section>

            <section className={styles.section}>
                <EmptyState
                    compact
                    title="选择节点查看属性"
                    description="节点信息、端口、依赖与 config 会显示在这里"
                />
            </section>
        </div>
    );
}

function NodeInspector({
    node,
    canEdit,
    onUpdateConfig,
}: {
    node: InspectorNodeModel;
    canEdit: boolean;
    onUpdateConfig: (nodeId: string, config: unknown) => void;
}): ReactElement {
    return (
        <div className={styles.sections}>
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>节点</h3>
                <div className={styles.nodeRow}>
                    <StatusDot
                        tone={STATUS_TONE[node.status]}
                        pulse={node.status === "running"}
                        label={STATUS_LABEL[node.status]}
                    />
                    <span className={styles.nodeName}>{node.title}</span>
                    <Badge variant={statusVariant(node.status)}>
                        {STATUS_LABEL[node.status]}
                    </Badge>
                </div>
                {node.description === undefined ? null : (
                    <p className={styles.description}>{node.description}</p>
                )}
                <MetaList
                    rows={[
                        ["类型", node.type],
                        ["节点 ID", node.id],
                        ["类型版本", String(node.typeVersion)],
                        [
                            "端口",
                            `${node.inputs.length} in / ${node.outputs.length} out`,
                        ],
                    ]}
                />
                {node.error ? (
                    <p className={styles.error}>{node.error}</p>
                ) : null}
            </section>

            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>端口</h3>
                <div className={styles.ports}>
                    <PortColumn title="输入" ports={node.inputs} />
                    <PortColumn title="输出" ports={node.outputs} />
                </div>
            </section>

            {node.requirements.length > 0 ? (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>依赖</h3>
                    <ul className={styles.requirements}>
                        {node.requirements.map((requirement) => (
                            <li key={requirement}>{requirement}</li>
                        ))}
                    </ul>
                </section>
            ) : null}

            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>参数</h3>
                {node.configSchema === undefined ? (
                    <ConfigJsonEditor
                        node={node}
                        canEdit={canEdit}
                        onUpdateConfig={onUpdateConfig}
                    />
                ) : (
                    <Tabs defaultValue="form">
                        <TabsList>
                            <TabsTrigger value="form">表单</TabsTrigger>
                            <TabsTrigger value="json">JSON</TabsTrigger>
                        </TabsList>
                        <TabsContent value="form">
                            <NodeConfigForm
                                schema={node.configSchema}
                                config={node.config}
                                disabled={!canEdit}
                                fieldOptions={node.fieldOptions}
                                fieldValues={node.fieldValues}
                                fieldHints={node.fieldHints}
                                fieldLocks={node.fieldLocks}
                                onChange={(next) => onUpdateConfig(node.id, next)}
                            />
                        </TabsContent>
                        <TabsContent value="json">
                            <ConfigJsonEditor
                                node={node}
                                canEdit={canEdit}
                                onUpdateConfig={onUpdateConfig}
                            />
                        </TabsContent>
                    </Tabs>
                )}
            </section>
        </div>
    );
}

/** 原始 JSON 编辑：解析失败只提示、不写回；「应用」整体替换 config。 */
function ConfigJsonEditor({
    node,
    canEdit,
    onUpdateConfig,
}: {
    node: InspectorNodeModel;
    canEdit: boolean;
    onUpdateConfig: (nodeId: string, config: unknown) => void;
}): ReactElement {
    const configText = useMemo(() => formatConfig(node.config), [node.config]);
    const [draft, setDraft] = useState(configText);
    const [parseError, setParseError] = useState<string | null>(null);

    useEffect(() => {
        setDraft(configText);
        setParseError(null);
    }, [node.id, configText]);

    const apply = (): void => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(draft);
        } catch (error) {
            setParseError(`JSON 解析失败：${errorMessage(error)}`);
            return;
        }

        setParseError(null);
        setDraft(JSON.stringify(parsed, null, 2));
        onUpdateConfig(node.id, parsed);
    };

    const format = (): void => {
        try {
            const parsed: unknown = JSON.parse(draft);
            setDraft(JSON.stringify(parsed, null, 2));
            setParseError(null);
        } catch (error) {
            setParseError(`JSON 解析失败：${errorMessage(error)}`);
        }
    };

    return (
        <>
            <CodeArea
                className={styles.editorArea}
                value={draft}
                onChange={setDraft}
                readOnly={!canEdit}
                ariaLabel="节点 config JSON"
                minHeight={148}
            />
            {parseError ? <p className={styles.error}>{parseError}</p> : null}
            {!canEdit ? (
                <p className={styles.hint}>运行时或保存冲突时不可编辑</p>
            ) : null}
            <div className={styles.actions}>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canEdit}
                    onClick={format}
                >
                    格式化
                </Button>
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canEdit}
                    onClick={apply}
                >
                    应用
                </Button>
            </div>
        </>
    );
}

function PortColumn({
    title,
    ports,
}: {
    title: string;
    ports: ReadonlyArray<{ name: string; type: string }>;
}): ReactElement {
    return (
        <div className={styles.portColumn}>
            <span className={styles.portTitle}>{title}</span>
            {ports.length === 0 ? (
                <span className={styles.hint}>无</span>
            ) : (
                <ul className={styles.portList}>
                    {ports.map((port) => (
                        <li key={port.name} className={styles.portItem}>
                            <code className={styles.portName}>{port.name}</code>
                            <span className={styles.portType}>{port.type}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function statusVariant(status: CanvasStatus): "neutral" | "accent" | "success" | "warning" | "danger" {
    switch (status) {
        case "running":
            return "accent";
        case "completed":
            return "success";
        case "paused":
            return "warning";
        case "failed":
            return "danger";
        default:
            return "neutral";
    }
}

function formatConfig(config: unknown): string {
    if (config === undefined) return "{}";
    try {
        return JSON.stringify(config, null, 2);
    } catch {
        return "{}";
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
