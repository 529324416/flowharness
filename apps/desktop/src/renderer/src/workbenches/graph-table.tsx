import { useEffect, useState, type ReactElement } from "react";
import type { GraphDocument } from "wireclaw";
import { Button, EmptyState } from "../ui";
import { DocumentNavigation } from "../shell/navigation/DocumentNavigation";
import type { WorkbenchDefinition, WorkbenchViewProps } from "../workbench/types";
import styles from "./GraphTableWorkbench.module.css";

type TableState =
    | { status: "loading"; graph: null; error: null }
    | { status: "empty"; graph: null; error: null }
    | { status: "ready"; graph: GraphDocument; error: null }
    | { status: "error"; graph: null; error: string };

function GraphTableWorkbench({
    workspace,
    activeDocumentId,
    shell,
}: WorkbenchViewProps): ReactElement {
    const [state, setState] = useState<TableState>({
        status: "loading",
        graph: null,
        error: null,
    });
    const [reloadToken, setReloadToken] = useState(0);

    useEffect(() => {
        shell.onRunControlsChange(null);
        shell.onSaveStatusChange(null);
        shell.onInspectorChange(null);
        shell.onProblemsChange(null);
        shell.onDocumentActionsChange(null);
        shell.onControllerChange(null);
    }, [shell]);

    useEffect(() => {
        if (activeDocumentId === null) {
            setState({ status: "empty", graph: null, error: null });
            return;
        }

        let cancelled = false;
        setState({ status: "loading", graph: null, error: null });

        void (async () => {
            const snapshot = await window.flowharness.readDocument(workspace.id, {
                kind: "harness",
                id: activeDocumentId,
            });
            if (cancelled) return;

            if (!snapshot.ok) {
                setState({
                    status: "error",
                    graph: null,
                    error: snapshot.error.message,
                });
                return;
            }
            if (snapshot.data === null) {
                setState({ status: "empty", graph: null, error: null });
                return;
            }

            setState({
                status: "ready",
                graph: snapshot.data.document as GraphDocument,
                error: null,
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [activeDocumentId, reloadToken, workspace.id]);

    if (state.status === "loading") {
        return <EmptyState title="正在读取图…" description={activeDocumentId ?? ""} />;
    }
    if (state.status === "empty") {
        return (
            <EmptyState
                title="没有可展示的图"
                description="先在文档菜单里新建或选择一份 Harness 文档。"
            />
        );
    }
    if (state.status === "error") {
        return <EmptyState title="读取失败" description={state.error} />;
    }

    const graph = state.graph;

    return (
        <div className={styles.root}>
            <header className={styles.header}>
                <div>
                    <h2 className={styles.title}>{graph.title ?? graph.id}</h2>
                    <p className={styles.meta}>
                        {graph.nodes.length} nodes · {graph.edges.length} edges · {graph.id}
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setReloadToken((token) => token + 1)}
                >
                    刷新
                </Button>
            </header>

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>节点</th>
                            <th>类型</th>
                            <th>版本</th>
                            <th>配置</th>
                        </tr>
                    </thead>
                    <tbody>
                        {graph.nodes.map((node) => (
                            <tr key={node.id}>
                                <td className={styles.mono}>{node.id}</td>
                                <td className={styles.mono}>{node.type}</td>
                                <td>{node.typeVersion}</td>
                                <td className={styles.config}>
                                    {node.config === undefined
                                        ? "—"
                                        : JSON.stringify(node.config)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export const graphTableWorkbench: WorkbenchDefinition = {
    type: "graph-table",
    title: "节点清单",
    description: "以表格方式审阅当前图的节点，验证工作台框架复用",
    canOpen: (instance) => instance.graphs.length > 0,
    navigation: { design: DocumentNavigation },
    View: GraphTableWorkbench,
};
