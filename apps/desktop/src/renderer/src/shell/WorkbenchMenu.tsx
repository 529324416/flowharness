import { Check, PanelsTopLeft, Plus } from "lucide-react";
import type { WorkbenchSummary } from "@flowharness/contracts";
import { Button, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../ui";
import { listWorkbenchDefinitions } from "../workbench/registry";
import styles from "./WorkbenchMenu.module.css";

export type WorkbenchMenuProps = {
    workbenches: readonly WorkbenchSummary[];
    activeWorkbenchId: string | null;
    busy?: boolean;
    onSelectWorkbench: (id: string) => void;
    onCreateWorkbench: (type: string) => void;
};

/** 标题栏工作台切换器：实例列表 + 按注册表生成的新建项。 */
export function WorkbenchMenu({
    workbenches,
    activeWorkbenchId,
    busy = false,
    onSelectWorkbench,
    onCreateWorkbench,
}: WorkbenchMenuProps) {
    const active =
        workbenches.find((workbench) => workbench.id === activeWorkbenchId) ??
        null;

    return (
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
    );
}
