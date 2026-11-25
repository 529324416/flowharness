import { useState } from "react";
import { Check, PanelsTopLeft, Pencil, Plus, Trash2 } from "lucide-react";
import type { WorkbenchSummary } from "@flowharness/contracts";
import {
    Button,
    Dialog,
    DialogContent,
    Input,
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    MenuTrigger,
} from "../ui";
import { listWorkbenchDefinitions } from "../workbench/registry";
import styles from "./WorkbenchMenu.module.css";

export type WorkbenchMenuProps = {
    workbenches: readonly WorkbenchSummary[];
    activeWorkbenchId: string | null;
    busy?: boolean;
    onSelectWorkbench: (id: string) => void;
    onCreateWorkbench: (type: string) => void;
    onRenameWorkbench: (id: string, title: string) => void;
    onDeleteWorkbench: (id: string) => void;
};

/** 标题栏工作台切换器：实例列表 + 按注册表生成的新建项。 */
export function WorkbenchMenu({
    workbenches,
    activeWorkbenchId,
    busy = false,
    onSelectWorkbench,
    onCreateWorkbench,
    onRenameWorkbench,
    onDeleteWorkbench,
}: WorkbenchMenuProps) {
    const active =
        workbenches.find((workbench) => workbench.id === activeWorkbenchId) ??
        null;
    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");

    const submitRename = (): void => {
        if (active === null) return;
        const title = draftTitle.trim();
        if (title.length === 0) return;
        onRenameWorkbench(active.id, title);
        setRenameOpen(false);
    };

    return (
        <>
        <Menu>
            <MenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={styles.trigger}
                    disabled={busy}
                    aria-label="切换或新建工作台"
                >
                    <PanelsTopLeft size={15} aria-hidden="true" />
                    <span className={styles.name}>
                        {active?.title ?? "工作台"}
                    </span>
                </Button>
            </MenuTrigger>
            <MenuContent align="start" className={styles.menu}>
                <MenuLabel>工作台</MenuLabel>
                {workbenches.length === 0 ? (
                    <div className={styles.empty}>还没有工作台</div>
                ) : (
                    workbenches.map((workbench) => (
                        <MenuItem
                            key={workbench.id}
                            onSelect={() => onSelectWorkbench(workbench.id)}
                        >
                            <span className={styles.check}>
                                {workbench.id === activeWorkbenchId ? (
                                    <Check size={14} aria-hidden="true" />
                                ) : null}
                            </span>
                            <span className={styles.title}>{workbench.title}</span>
                            <span className={styles.type}>{workbench.type}</span>
                        </MenuItem>
                    ))
                )}

                <MenuSeparator />
                <MenuItem
                    disabled={active === null}
                    onSelect={() => {
                        if (active === null) return;
                        setDraftTitle(active.title);
                        setRenameOpen(true);
                    }}
                >
                    <Pencil size={15} aria-hidden="true" />
                    重命名当前工作台
                </MenuItem>
                <MenuItem
                    disabled={active === null}
                    onSelect={() => setDeleteOpen(true)}
                >
                    <Trash2 size={15} aria-hidden="true" />
                    删除当前工作台
                </MenuItem>

                <MenuSeparator />
                <MenuLabel>新建工作台</MenuLabel>
                {listWorkbenchDefinitions().map((definition) => (
                    <MenuItem
                        key={definition.type}
                        onSelect={() => onCreateWorkbench(definition.type)}
                    >
                        <Plus size={15} aria-hidden="true" />
                        {definition.title}
                    </MenuItem>
                ))}
            </MenuContent>
        </Menu>

        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
            <DialogContent
                title="重命名工作台"
                description="只修改实例标题，不改变类型与 id。"
                footer={
                    <>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRenameOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            size="sm"
                            variant="primary"
                            disabled={draftTitle.trim().length === 0}
                            onClick={submitRename}
                        >
                            保存
                        </Button>
                    </>
                }
            >
                <Input
                    label="标题"
                    value={draftTitle}
                    autoFocus
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") submitRename();
                    }}
                />
            </DialogContent>
        </Dialog>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent
                title="删除工作台"
                description="只删除工作台实例，不删除它绑定的工作流。"
                footer={
                    <>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                                if (active === null) return;
                                onDeleteWorkbench(active.id);
                                setDeleteOpen(false);
                            }}
                        >
                            删除
                        </Button>
                    </>
                }
            >
                <p className={styles.empty}>
                    确定删除「{active?.title ?? ""}」？
                </p>
            </DialogContent>
        </Dialog>
        </>
    );
}
