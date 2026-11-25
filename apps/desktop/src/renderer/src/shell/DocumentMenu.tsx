import { Fragment, type ReactElement } from "react";
import { Check, FileText, MoreHorizontal } from "lucide-react";
import type { HarnessDocumentSummary } from "@flowharness/contracts";
import {
    Button,
    IconButton,
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    MenuTrigger,
} from "../ui";
import {
    buildWorkflowActions,
    useWorkflowActions,
    type WorkflowAction,
} from "./workflow-actions";
import styles from "./DocumentMenu.module.css";

export type DocumentMenuProps = {
    documents: readonly HarnessDocumentSummary[];
    recentDocumentIds?: readonly string[];
    activeDocumentId: string | null;
    busy?: boolean;
    /** false 时只保留动作菜单，不渲染工作流列表。 */
    showList?: boolean;
    /** title 显示当前工作流名；icon 使用紧凑的操作按钮。 */
    trigger?: "title" | "icon";
    onSelectDocument: (id: string) => void;
    onCreateDocument: () => void;
    onRenameDocument: (id: string, title: string) => void;
    onDuplicateDocument: (id: string) => void;
    onDeleteDocument: (id: string) => void;
    onImportDocument: (text: string, fileName: string) => void;
    onExportDocument: (options: { stripUi: boolean }, documentId?: string) => void;
};

function formatUpdatedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** 工作流切换 / 管理菜单；动作列表与右键菜单共用。 */
export function DocumentMenu({
    documents,
    recentDocumentIds = [],
    activeDocumentId,
    busy = false,
    showList = true,
    trigger = "title",
    onSelectDocument,
    onCreateDocument,
    onRenameDocument,
    onDuplicateDocument,
    onDeleteDocument,
    onImportDocument,
    onExportDocument,
}: DocumentMenuProps): ReactElement {
    const active =
        documents.find((document) => document.id === activeDocumentId) ?? null;
    const recent = recentDocumentIds
        .map((id) => documents.find((document) => document.id === id))
        .filter(
            (document): document is HarnessDocumentSummary =>
                document !== undefined,
        )
        .slice(0, 3);
    const recentIds = new Set(recent.map((document) => document.id));
    const others = documents.filter((document) => !recentIds.has(document.id));

    const workflowActions = useWorkflowActions({
        onRenameDocument,
        onDeleteDocument,
        onImportDocument,
    });
    const actions = buildWorkflowActions({
        document: active,
        onCreate: onCreateDocument,
        onRename: workflowActions.requestRename,
        onDuplicate: (document) => onDuplicateDocument(document.id),
        onDelete: workflowActions.requestDelete,
        onImport: workflowActions.openImport,
        onExport: (document, stripUi) =>
            onExportDocument({ stripUi }, document.id),
    });

    const renderAction = (action: WorkflowAction): ReactElement => (
        <MenuItem
            key={action.id}
            disabled={action.disabled}
            onSelect={action.run}
        >
            <action.icon size={15} aria-hidden="true" />
            {action.label}
        </MenuItem>
    );

    const renderDocument = (
        document: HarnessDocumentSummary,
        keyPrefix: string,
    ): ReactElement => (
        <MenuItem
            key={`${keyPrefix}:${document.id}`}
            className={styles.item}
            onSelect={() => onSelectDocument(document.id)}
        >
            <span className={styles.check}>
                {document.id === activeDocumentId ? (
                    <Check size={14} aria-hidden="true" />
                ) : null}
            </span>
            <span className={styles.title}>{document.title}</span>
            <span className={styles.meta}>
                {formatUpdatedAt(document.updatedAt)}
            </span>
        </MenuItem>
    );

    return (
        <>
            <Menu>
                <MenuTrigger asChild>
                    {trigger === "icon" ? (
                        <IconButton
                            label="工作流操作"
                            size="sm"
                            disabled={busy}
                        >
                            <MoreHorizontal size={19} aria-hidden="true" />
                        </IconButton>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            className={styles.trigger}
                            disabled={busy}
                            aria-label="切换或管理工作流"
                        >
                            <FileText size={15} aria-hidden="true" />
                            <span className={styles.name}>
                                {active?.title ?? "工作流"}
                            </span>
                        </Button>
                    )}
                </MenuTrigger>
                <MenuContent align="start" className={styles.menu}>
                    {showList ? (
                        documents.length === 0 ? (
                            <>
                                <MenuLabel>工作流</MenuLabel>
                                <div className={styles.empty}>还没有工作流</div>
                            </>
                        ) : (
                            <>
                                {recent.length > 0 ? (
                                    <>
                                        <MenuLabel>最近打开</MenuLabel>
                                        {recent.map((document) =>
                                            renderDocument(document, "recent"),
                                        )}
                                        {others.length > 0 ? (
                                            <>
                                                <MenuSeparator />
                                                <MenuLabel>更多工作流</MenuLabel>
                                                {others.map((document) =>
                                                    renderDocument(
                                                        document,
                                                        "other",
                                                    ),
                                                )}
                                            </>
                                        ) : null}
                                    </>
                                ) : (
                                    <>
                                        <MenuLabel>工作流</MenuLabel>
                                        {documents.map((document) =>
                                            renderDocument(document, "all"),
                                        )}
                                    </>
                                )}
                            </>
                        )
                    ) : null}

                    {showList ? <MenuSeparator /> : null}
                    {actions.map((action) => (
                        <Fragment key={action.id}>
                            {action.separatorBefore ? <MenuSeparator /> : null}
                            {renderAction(action)}
                        </Fragment>
                    ))}
                </MenuContent>
            </Menu>

            {workflowActions.dialogs}
        </>
    );
}
