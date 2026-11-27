import type { ComponentType } from "react";
import type { GraphDocument } from "wireclaw";
import type {
    HarnessDocumentSummary,
    RunSnapshot,
    RunStatus,
    SessionSummary,
    WorkbenchInstanceDocument,
    WorkspaceSummary,
} from "@flowharness/contracts";
import type { DesignerProblemsModel } from "../designer/core/problems";
import type { DesignerDocumentActions } from "../designer/state/useDesignerDocument";
import type { PanelLayoutState } from "../layout-metrics";
import type { InspectorModel } from "../inspector/model";
import type { RunControls } from "../run/run-controls";

/** 工作台对运行 + 编辑历史的统一控制面；M5 先由设计器实现。 */
export type WorkbenchController = {
    readonly status: RunStatus;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    run: () => void;
    pause: () => void;
    resume: () => void;
    cancel: () => void;
    undo: () => void;
    redo: () => void;
    save: () => Promise<void>;
};

/** 工作台向 Shell 汇报的 UI 模型；由 App 提供并转交 TitleBar / PanelLayer。 */
export type WorkbenchShell = {
    /** 浮动面板当前布局；由 App 的 useFloatingPanels 提供。 */
    panels: readonly PanelLayoutState[];
    /** 应用当前图保存的浮动面板布局；null 表示恢复默认。 */
    onApplyPanelLayout: (layout: readonly PanelLayoutState[] | null) => void;
    onRunWillStart: () => void | Promise<void>;
    onRunStarted: (snapshot: RunSnapshot) => void;
    onRunControlsChange: (controls: RunControls | null) => void;
    onSaveStatusChange: (status: "saved" | "saving" | "conflict" | "error" | null) => void;
    onInspectorChange: (model: InspectorModel | null) => void;
    onProblemsChange: (model: DesignerProblemsModel | null) => void;
    onDocumentActionsChange: (actions: DesignerDocumentActions | null) => void;
    onControllerChange: (controller: WorkbenchController | null) => void;
    /** 主视图在 design / run 阶段之间切换。 */
    onModeChange: (mode: WorkbenchMode) => void;
    /** 设计器保存冲突时把当前内存文档另存为副本。 */
    onSaveConflictCopy: (graph: GraphDocument) => void;
};

export type WorkbenchViewProps = {
    instance: WorkbenchInstanceDocument;
    workspace: WorkspaceSummary;
    documents: readonly HarnessDocumentSummary[];
    activeDocumentId: string | null;
    /** 当前工作台阶段（design / run）。 */
    mode: WorkbenchMode;
    busy: boolean;
    error: string | null;
    shell: WorkbenchShell;
    /** 新建工作流（空态 CTA 等使用）；由 App 提供。 */
    onCreateDocument: () => void;
    /** 只在实例字段变化时调用；由 Host/App 负责持久化。 */
    onUpdateInstance: (
        mutate: (current: WorkbenchInstanceDocument) => WorkbenchInstanceDocument,
    ) => void;
};

export type WorkbenchMode = "design" | "run";

/** 左栏 PanelContent 的公共契约；由 App 提供数据与动作。 */
export type WorkbenchNavigationProps = {
    instance: WorkbenchInstanceDocument;
    workspace: WorkspaceSummary;
    mode: WorkbenchMode;
    documents: readonly HarnessDocumentSummary[];
    recentDocumentIds: readonly string[];
    activeDocumentId: string | null;
    busy: boolean;
    width: number;
    onResize: (width: number) => void;
    onCollapse: () => void;
    /** 在当前工作台的 design / run 模式之间切换。 */
    onModeChange: (mode: WorkbenchMode) => void;
    /** 当前打开的会话；run 模式的 Session 树与历史面板共用。 */
    activeSessionId: string | null;
    /** 外部新增 / 变更会话后递增，用于让 Session 树刷新。 */
    sessionRevision?: number;
    /** 上下分区中的槽位；由 Shell 注入，导航组件据此切换紧凑样式。 */
    navSection?: "top" | "bottom";
    onOpenSession: (session: SessionSummary) => void;
    onSelectDocument: (id: string) => void;
    onCreateDocument: () => void;
    onRenameDocument: (id: string, title: string) => void;
    onDuplicateDocument: (id: string) => void;
    onDeleteDocument: (id: string) => void;
    onImportDocument: (text: string, fileName: string) => void;
    onExportDocument: (
        options: { stripUi: boolean },
        documentId?: string,
    ) => void;
};

/** 左栏上下分区的槽位定义；用于同时展示两类导航的工作台。 */
export type WorkbenchSplitNavigation = {
    /** 上半区使用的导航槽位（通常是工作流列表）。 */
    top: WorkbenchMode;
    /** 下半区使用的导航槽位（通常是 Session 树）。 */
    bottom: WorkbenchMode;
};

export type WorkbenchNavigation = Partial<
    Record<WorkbenchMode, ComponentType<WorkbenchNavigationProps>>
>;

/**
 * 工作台定义：同一份实例文档 + 同一套 Shell 模型，可插拔不同的 View。
 *
 * 当前由 React View 自持状态（通过 hooks），`canOpen` 负责实例兼容性检查。
 */
export type WorkbenchDefinition = {
    type: string;
    title: string;
    description: string;
    canOpen: (instance: WorkbenchInstanceDocument) => boolean;
    /** 左栏内容：按模式提供，Shell 只负责 Panel 宿主。 */
    navigation?: WorkbenchNavigation;
    /**
     * 某些工作台需要同时展示两类导航（例如工作流 + 会话）。
     * 声明后左栏改为上下两区，mode 只影响主视图。
     */
    splitNavigation?: WorkbenchSplitNavigation;
    /** run 阶段的专用主视图；缺省复用 View。 */
    RunView?: ComponentType<WorkbenchViewProps>;
    View: ComponentType<WorkbenchViewProps>;
};
