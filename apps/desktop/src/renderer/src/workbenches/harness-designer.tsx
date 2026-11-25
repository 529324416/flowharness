import { useEffect } from "react";
import { DesignerView } from "../views/DesignerView";
import type { WorkbenchDefinition, WorkbenchViewProps } from "../workbench/types";
import { primaryGraphId, withPrimaryGraph } from "../workbench/instance";

function HarnessDesignerView({
    instance,
    workspace,
    activeDocumentId,
    busy,
    error,
    shell,
    onUpdateInstance,
}: WorkbenchViewProps) {
    useEffect(() => {
        if (activeDocumentId === null) return;
        if (primaryGraphId(instance) === activeDocumentId) return;
        onUpdateInstance((current) => withPrimaryGraph(current, activeDocumentId));
    }, [activeDocumentId, instance, onUpdateInstance]);

    return (
        <DesignerView
            workspace={workspace}
            documentId={activeDocumentId}
            busy={busy}
            error={error}
            onCreateWorkspace={() => undefined}
            onRunWillStart={shell.onRunWillStart}
            onRunStarted={shell.onRunStarted}
            onRunControlsChange={shell.onRunControlsChange}
            onSaveStatusChange={shell.onSaveStatusChange}
            onInspectorChange={shell.onInspectorChange}
            onProblemsChange={shell.onProblemsChange}
            onDocumentActionsChange={shell.onDocumentActionsChange}
            onControllerChange={shell.onControllerChange}
            onSaveConflictCopy={() => undefined}
        />
    );
}

export const harnessDesignerWorkbench: WorkbenchDefinition = {
    type: "harness-designer",
    title: "Harness Designer",
    description: "画布式 Harness 工作流设计与运行工作台",
    canOpen: (instance) => instance.graphs.length > 0,
    View: HarnessDesignerView,
};
