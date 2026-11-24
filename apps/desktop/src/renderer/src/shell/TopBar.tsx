import type { ReactElement } from "react";
import {
    ChevronDown,
    FolderOpen,
    Moon,
    PanelBottom,
    PanelRight,
    Pause,
    Play,
    Settings,
    Square,
    Sun,
} from "lucide-react";
import type { ResolvedTheme, RunStatus } from "@flowharness/contracts";
import {
    Badge,
    Button,
    IconButton,
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    MenuShortcut,
    MenuTrigger,
    StatusDot,
    Tooltip,
} from "../ui";
import { cx } from "../ui/cx";
import { RUN_STATUS_LABEL } from "./labels";
import { WindowControls } from "./WindowControls";
import styles from "./TopBar.module.css";

export type TopBarProps = {
    workspaceName: string;
    runStatus: RunStatus;
    theme: ResolvedTheme;
    onToggleTheme: () => void;
    inspectorOpen: boolean;
    onToggleInspector: () => void;
    panelOpen: boolean;
    onTogglePanel: () => void;
    onCreateWorkspace: () => void;
    busy: boolean;
};

export function TopBar({
    workspaceName,
    runStatus,
    theme,
    onToggleTheme,
    inspectorOpen,
    onToggleInspector,
    panelOpen,
    onTogglePanel,
    onCreateWorkspace,
    busy,
}: TopBarProps): ReactElement {
    const windowMode = window.flowharness.windowMode;
    const overlay = windowMode === "overlay";

    const handleTitleBarDoubleClick = (event: React.MouseEvent<HTMLElement>): void => {
        const target = event.target as HTMLElement;
        if (target.closest("button, input, select, textarea, a, [data-no-drag]")) return;
        void window.flowharness.windowToggleMaximize();
    };

    return (
        <header
            className={cx(styles.root, overlay && styles.overlay)}
            onDoubleClick={handleTitleBarDoubleClick}
        >
            <div className={styles.left}>
                <div className={styles.brand}>
                    <span className={styles.mark} aria-hidden="true">
                        FH
                    </span>
                    <span className={styles.name}>FlowHarness</span>
                    <Badge>Phase 2.5</Badge>
                </div>

                <Menu>
                    <MenuTrigger asChild>
                        <Button variant="ghost" size="sm" className={styles.workspace} disabled={busy}>
                            <FolderOpen size={14} aria-hidden="true" />
                            <span className={styles.workspaceName}>{workspaceName}</span>
                            <ChevronDown size={12} aria-hidden="true" />
                        </Button>
                    </MenuTrigger>
                    <MenuContent align="start">
                        <MenuLabel>工作区</MenuLabel>
                        <MenuItem onSelect={onCreateWorkspace} disabled={busy}>
                            新建示例工作区
                            <MenuShortcut>Ctrl N</MenuShortcut>
                        </MenuItem>
                        <MenuItem disabled>
                            打开工作区…
                            <MenuShortcut>Ctrl O</MenuShortcut>
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem disabled>导出 .fhws…</MenuItem>
                    </MenuContent>
                </Menu>
            </div>

            <div className={styles.center}>
                <Button variant="primary" size="sm" disabled title="Phase 3 接入真实运行控制">
                    <Play size={14} aria-hidden="true" />
                    运行
                </Button>
                <IconButton label="暂停（Phase 3）" size="sm" disabled>
                    <Pause size={14} aria-hidden="true" />
                </IconButton>
                <IconButton label="停止（Phase 3）" size="sm" disabled>
                    <Square size={14} aria-hidden="true" />
                </IconButton>
                <span className={styles.runStatus}>
                    <StatusDot tone={runStatus} pulse={runStatus === "running"} />
                    {RUN_STATUS_LABEL[runStatus]}
                </span>
            </div>

            <div className={styles.right}>
                <Tooltip label={theme === "dark" ? "切换到亮色主题" : "切换到暗色主题"}>
                    <IconButton label="切换主题" onClick={onToggleTheme}>
                        {theme === "dark" ? (
                            <Sun size={16} aria-hidden="true" />
                        ) : (
                            <Moon size={16} aria-hidden="true" />
                        )}
                    </IconButton>
                </Tooltip>

                <Tooltip label="检查器">
                    <IconButton
                        label="切换检查器"
                        variant={inspectorOpen ? "secondary" : "ghost"}
                        aria-pressed={inspectorOpen}
                        onClick={onToggleInspector}
                    >
                        <PanelRight size={16} aria-hidden="true" />
                    </IconButton>
                </Tooltip>

                <Tooltip label="底部面板">
                    <IconButton
                        label="切换底部面板"
                        variant={panelOpen ? "secondary" : "ghost"}
                        aria-pressed={panelOpen}
                        onClick={onTogglePanel}
                    >
                        <PanelBottom size={16} aria-hidden="true" />
                    </IconButton>
                </Tooltip>

                <Menu>
                    <MenuTrigger asChild>
                        <IconButton label="设置">
                            <Settings size={16} aria-hidden="true" />
                        </IconButton>
                    </MenuTrigger>
                    <MenuContent align="end">
                        <MenuLabel>应用</MenuLabel>
                        <MenuItem disabled>偏好设置…</MenuItem>
                        <MenuItem disabled>关于 FlowHarness</MenuItem>
                    </MenuContent>
                </Menu>

                <WindowControls mode={windowMode} />
            </div>
        </header>
    );
}
