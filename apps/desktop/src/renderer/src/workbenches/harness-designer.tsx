import { ArrowLeft } from "lucide-react";
import { DocumentNavigation } from "../shell/navigation/DocumentNavigation";
import { SessionNavigation } from "../shell/navigation/SessionNavigation";
import { Button } from "../ui";
import { PresetLibraryProvider } from "../presets/PresetLibraryProvider";
import { DesignerView } from "../views/DesignerView";
import type { WorkbenchDefinition, WorkbenchViewProps } from "../workbench/types";
import styles from "./harness-designer.module.css";

/**
 * 设计 / 运行共用同一个主视图。
 *
 * 运行阶段只是在画布上方加一条上下文条，不替换视图组件：
 * 切换阶段时 DesignerView / CanvasView 保持挂载，选中节点、视口与
 * React Flow 的本地布局状态都不会被重置。
 */
function HarnessDesignerView({
    mode,
    workspace,
    activeDocumentId,
    busy,
    error,
    shell,
    onCreateDocument,
}: WorkbenchViewProps) {
    return (
        <PresetLibraryProvider workspaceId={workspace.id}>
            <div className={styles.view}>
                {mode === "run" ? (
                    <div className={styles.banner}>
                        <span className={styles.mode}>运行模式</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => shell.onModeChange("design")}
                        >
                            <ArrowLeft size={16} aria-hidden="true" />
                            返回设计
                        </Button>
                        <span className={styles.hint}>
                            从下方会话树选择对话会话，运行时的 Agent / 模型消息会写入该会话
                        </span>
                    </div>
                ) : null}
                <div className={styles.body}>
                    <DesignerView
                        workspace={workspace}
                        documentId={activeDocumentId}
                        busy={busy}
                        error={error}
                        onCreateWorkspace={() => undefined}
                        onCreateDocument={onCreateDocument}
                        onRunWillStart={shell.onRunWillStart}
                        onRunStarted={shell.onRunStarted}
                        onRunControlsChange={shell.onRunControlsChange}
                        onSaveStatusChange={shell.onSaveStatusChange}
                        onInspectorChange={shell.onInspectorChange}
                        onProblemsChange={shell.onProblemsChange}
                        onDocumentActionsChange={shell.onDocumentActionsChange}
                        onControllerChange={shell.onControllerChange}
                        onSaveConflictCopy={() => undefined}
                        panels={shell.panels}
                        onApplyPanelLayout={shell.onApplyPanelLayout}
                    />
                </div>
            </div>
        </PresetLibraryProvider>
    );
}

export const harnessDesignerWorkbench: WorkbenchDefinition = {
    type: "harness-designer",
    title: "Harness Designer",
    description: "画布式 Harness 工作流设计与运行工作台",
    // 允许空绑定：删除最后一条工作流后实例仍可打开，由设计器显示空态。
    canOpen: () => true,
    navigation: { design: DocumentNavigation, run: SessionNavigation },
    // 设计器同时需要工作流与会话两类导航：上半区工作流、下半区 Session 树。
    splitNavigation: { top: "design", bottom: "run" },
    View: HarnessDesignerView,
};
