import type { ReactElement } from "react";
import { Activity, MessagesSquare, Palette, Settings, Workflow } from "lucide-react";
import {
    IconButton,
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    MenuTrigger,
    Tooltip,
} from "../ui";
import type { ViewId } from "./views";
import styles from "./RibbonBar.module.css";

export type RibbonBarProps = {
    view: ViewId;
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    onSelectView: (view: ViewId) => void;
    onToggleTheme: () => void;
    onOpenSettings: () => void;
};

const VIEW_ITEMS: ReadonlyArray<{
    id: ViewId;
    label: string;
    icon: typeof Workflow;
}> = [
    { id: "designer", label: "设计器", icon: Workflow },
    { id: "diagnostics", label: "诊断", icon: Activity },
    { id: "styleguide", label: "样式指南", icon: Palette },
];

export function RibbonBar({
    view,
    sidebarOpen,
    onToggleSidebar,
    onSelectView,
    onToggleTheme,
    onOpenSettings,
}: RibbonBarProps): ReactElement {
    return (
        <nav className={styles.ribbon} aria-label="工作台切换">
            <div className={styles.group}>
                <Tooltip label={sidebarOpen ? "收起会话栏" : "展开会话栏"} side="right">
                    <IconButton
                        label="切换会话栏"
                        size="md"
                        variant="ghost"
                        aria-pressed={sidebarOpen}
                        className={sidebarOpen ? styles.active : undefined}
                        onClick={onToggleSidebar}
                    >
                        <MessagesSquare size={24} aria-hidden="true" />
                    </IconButton>
                </Tooltip>

                <div className={styles.divider} aria-hidden="true" />

                {VIEW_ITEMS.map(({ id, label, icon: Icon }) => (
                    <Tooltip key={id} label={label} side="right">
                        <IconButton
                            label={label}
                            size="md"
                            variant="ghost"
                            aria-current={view === id ? "page" : undefined}
                            className={view === id ? styles.active : undefined}
                            onClick={() => onSelectView(id)}
                        >
                            <Icon size={24} aria-hidden="true" />
                        </IconButton>
                    </Tooltip>
                ))}
            </div>

            <div className={styles.group}>
                <Menu>
                    <MenuTrigger asChild>
                        <IconButton label="设置" size="md" variant="ghost">
                            <Settings size={24} aria-hidden="true" />
                        </IconButton>
                    </MenuTrigger>
                    <MenuContent side="right" align="end">
                        <MenuLabel>应用</MenuLabel>
                        <MenuItem onSelect={onToggleTheme}>切换主题</MenuItem>
                        <MenuItem onSelect={() => onSelectView("styleguide")}>样式指南</MenuItem>
                        <MenuSeparator />
                        <MenuItem onSelect={onOpenSettings}>
                            Provider 设置…
                        </MenuItem>
                    </MenuContent>
                </Menu>
            </div>
        </nav>
    );
}
