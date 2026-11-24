import { useEffect, useState, type ReactElement } from "react";
import {
    FolderOpen,
    Moon,
    PanelBottom,
    PanelLeft,
    PanelLeftClose,
    PanelRight,
    Plus,
    Search,
    Sun,
} from "lucide-react";
import type { ResolvedTheme } from "@flowharness/contracts";
import {
    Button,
    IconButton,
    Kbd,
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    MenuShortcut,
    MenuTrigger,
    Tooltip,
} from "../ui";
import { cx } from "../ui/cx";
import { WindowControls } from "./WindowControls";
import type { ViewId } from "./views";
import styles from "./TitleBar.module.css";

export type TitleBarProps = {
    activeSessionTitle: string | null;
    theme: ResolvedTheme;
    sidebarOpen: boolean;
    busy: boolean;
    onNewSession: () => void;
    onCreateWorkspace: () => void;
    onSelectView: (view: ViewId) => void;
    onToggleSidebar: () => void;
    onToggleTheme: () => void;
    onCloseWindow: () => void;
    panelsEnabled: boolean;
    runLogOpen: boolean;
    inspectorOpen: boolean;
    onToggleRunLog: () => void;
    onToggleInspector: () => void;
};

export function TitleBar({
    activeSessionTitle,
    theme,
    sidebarOpen,
    busy,
    onNewSession,
    onCreateWorkspace,
    onSelectView,
    onToggleSidebar,
    onToggleTheme,
    onCloseWindow,
    panelsEnabled,
    runLogOpen,
    inspectorOpen,
    onToggleRunLog,
    onToggleInspector,
}: TitleBarProps): ReactElement {
    const windowMode = window.flowharness.windowMode;
    const overlay = windowMode === "overlay";
    const [commandOpen, setCommandOpen] = useState(false);

    useEffect(() => {
        const open = (): void => setCommandOpen(true);
        window.addEventListener("fh:command", open);
        return () => window.removeEventListener("fh:command", open);
    }, []);

    const handleDoubleClick = (event: React.MouseEvent<HTMLElement>): void => {
        const target = event.target as HTMLElement;
        if (target.closest("button, input, select, textarea, a, [data-no-drag]")) return;
        void window.flowharness.windowToggleMaximize();
    };

    return (
        <header
            className={cx(styles.root, overlay && styles.overlay)}
            onDoubleClick={handleDoubleClick}
        >
            <div className={styles.left}>
                <div className={styles.brand}>
                    <span className={styles.mark} aria-hidden="true">
                        FH
                    </span>
                    <span className={styles.name}>FlowHarness</span>
                </div>

                <nav className={styles.menus} aria-label="应用菜单">
                    <Menu>
                        <MenuTrigger asChild>
                            <Button variant="ghost" size="sm" className={styles.menuButton}>
                                文件
                            </Button>
                        </MenuTrigger>
                        <MenuContent align="start">
                            <MenuLabel>文件</MenuLabel>
                            <MenuItem onSelect={onNewSession}>
                                <Plus size={13} aria-hidden="true" />
                                新建会话
                                <MenuShortcut>Ctrl N</MenuShortcut>
                            </MenuItem>
                            <MenuItem onSelect={onCreateWorkspace} disabled={busy}>
                                <FolderOpen size={13} aria-hidden="true" />
                                新建示例工作区
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem onSelect={onCloseWindow}>关闭窗口</MenuItem>
                        </MenuContent>
                    </Menu>

                    <Menu>
                        <MenuTrigger asChild>
                            <Button variant="ghost" size="sm" className={styles.menuButton}>
                                视图
                            </Button>
                        </MenuTrigger>
                        <MenuContent align="start">
                            <MenuLabel>视图</MenuLabel>
                            <MenuItem onSelect={() => onSelectView("designer")}>
                                设计器
                                <MenuShortcut>Ctrl 1</MenuShortcut>
                            </MenuItem>
                            <MenuItem onSelect={() => onSelectView("diagnostics")}>
                                诊断
                                <MenuShortcut>Ctrl 2</MenuShortcut>
                            </MenuItem>
                            <MenuItem onSelect={() => onSelectView("styleguide")}>
                                样式指南
                                <MenuShortcut>Ctrl 3</MenuShortcut>
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem onSelect={onToggleSidebar}>
                                切换会话栏
                                <MenuShortcut>Ctrl B</MenuShortcut>
                            </MenuItem>
                            <MenuItem onSelect={onToggleTheme}>
                                {theme === "dark" ? "切换到亮色主题" : "切换到暗色主题"}
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem onSelect={onToggleRunLog} disabled={!panelsEnabled}>
                                运行日志
                                <MenuShortcut>Ctrl J</MenuShortcut>
                            </MenuItem>
                            <MenuItem
                                onSelect={onToggleInspector}
                                disabled={!panelsEnabled}
                            >
                                属性检查
                            </MenuItem>
                        </MenuContent>
                    </Menu>
                </nav>
            </div>

            <div className={styles.center}>
                <Menu open={commandOpen} onOpenChange={setCommandOpen}>
                    <MenuTrigger asChild>
                        <button type="button" className={styles.command}>
                            <Search size={13} aria-hidden="true" />
                            <span className={styles.commandText}>
                                {activeSessionTitle ?? "搜索或跳转…"}
                            </span>
                            <Kbd>Ctrl K</Kbd>
                        </button>
                    </MenuTrigger>
                    <MenuContent align="center" className={styles.commandMenu}>
                        <MenuLabel>命令</MenuLabel>
                        <MenuItem onSelect={onNewSession}>
                            <Plus size={13} aria-hidden="true" />
                            新建会话
                            <MenuShortcut>Ctrl N</MenuShortcut>
                        </MenuItem>
                        <MenuItem onSelect={onToggleSidebar}>
                            <PanelLeft size={13} aria-hidden="true" />
                            切换会话栏
                            <MenuShortcut>Ctrl B</MenuShortcut>
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem onSelect={() => onSelectView("designer")}>
                            设计器
                            <MenuShortcut>Ctrl 1</MenuShortcut>
                        </MenuItem>
                        <MenuItem onSelect={() => onSelectView("diagnostics")}>
                            诊断
                            <MenuShortcut>Ctrl 2</MenuShortcut>
                        </MenuItem>
                        <MenuItem onSelect={() => onSelectView("styleguide")}>
                            样式指南
                            <MenuShortcut>Ctrl 3</MenuShortcut>
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem onSelect={onToggleTheme}>切换主题</MenuItem>
                        <MenuSeparator />
                        <MenuItem onSelect={onToggleRunLog} disabled={!panelsEnabled}>
                            运行日志
                            <MenuShortcut>Ctrl J</MenuShortcut>
                        </MenuItem>
                        <MenuItem onSelect={onToggleInspector} disabled={!panelsEnabled}>
                            属性检查
                        </MenuItem>
                    </MenuContent>
                </Menu>
            </div>

            <div className={styles.right}>
                <Tooltip label={theme === "dark" ? "切换到亮色主题" : "切换到暗色主题"}>
                    <IconButton label="切换主题" size="sm" onClick={onToggleTheme}>
                        {theme === "dark" ? (
                            <Sun size={15} aria-hidden="true" />
                        ) : (
                            <Moon size={15} aria-hidden="true" />
                        )}
                    </IconButton>
                </Tooltip>

                <Tooltip label={sidebarOpen ? "收起会话栏" : "展开会话栏"}>
                    <IconButton
                        label="切换会话栏"
                        size="sm"
                        aria-pressed={sidebarOpen}
                        onClick={onToggleSidebar}
                    >
                        {sidebarOpen ? (
                            <PanelLeftClose size={15} aria-hidden="true" />
                        ) : (
                            <PanelLeft size={15} aria-hidden="true" />
                        )}
                    </IconButton>
                </Tooltip>

                <Tooltip label="运行日志">
                    <IconButton
                        label="切换运行日志"
                        size="sm"
                        variant={runLogOpen ? "secondary" : "ghost"}
                        aria-pressed={runLogOpen}
                        disabled={!panelsEnabled}
                        onClick={onToggleRunLog}
                    >
                        <PanelBottom size={15} aria-hidden="true" />
                    </IconButton>
                </Tooltip>

                <Tooltip label="属性检查">
                    <IconButton
                        label="切换属性检查"
                        size="sm"
                        variant={inspectorOpen ? "secondary" : "ghost"}
                        aria-pressed={inspectorOpen}
                        disabled={!panelsEnabled}
                        onClick={onToggleInspector}
                    >
                        <PanelRight size={15} aria-hidden="true" />
                    </IconButton>
                </Tooltip>

                <WindowControls mode={windowMode} />
            </div>
        </header>
    );
}
