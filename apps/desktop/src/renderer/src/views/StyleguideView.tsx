import type { ReactElement, ReactNode } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
    Alert,
    Badge,
    Button,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
    Dialog,
    DialogClose,
    DialogContent,
    DialogTrigger,
    EmptyState,
    IconButton,
    Input,
    Kbd,
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    MenuShortcut,
    MenuTrigger,
    StatusDot,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Tooltip,
    type StatusTone,
} from "../ui";
import { MetaList } from "../components/MetaList";
import { NodeVisual } from "../canvas/view/NodeVisual";
import type { CanvasStatus } from "../canvas/core/types";
import { CANVAS_METRICS } from "../canvas/metrics";
import styles from "./StyleguideView.module.css";

const COLOR_TOKENS = [
    ["背景", "--fh-bg"],
    ["表面", "--fh-surface"],
    ["升层表面", "--fh-surface-raised"],
    ["浮层", "--fh-surface-overlay"],
    ["边框", "--fh-border"],
    ["强边框", "--fh-border-strong"],
    ["主色", "--fh-accent"],
    ["成功", "--fh-success"],
    ["警告", "--fh-warning"],
    ["危险", "--fh-danger"],
    ["信息", "--fh-info"],
    ["画布", "--fh-canvas-bg"],
    ["节点", "--fh-node-bg"],
    ["连线", "--fh-edge"],
] as const;

const TYPE_SCALE = [
    ["2xl", "--fh-text-2xl", "页面标题"],
    ["xl", "--fh-text-xl", "区块标题"],
    ["lg", "--fh-text-lg", "对话框标题"],
    ["md", "--fh-text-md", "正文（默认）"],
    ["sm", "--fh-text-sm", "控件与次要信息"],
    ["xs", "--fh-text-xs", "标签与辅助"],
] as const;

const SPACES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const RADII = [
    ["xs", "4px"],
    ["sm", "6px"],
    ["md", "10px"],
    ["lg", "14px"],
] as const;

const STATUS_TONES: ReadonlyArray<[StatusTone, string]> = [
    ["idle", "未运行"],
    ["running", "运行中"],
    ["paused", "已暂停"],
    ["completed", "已完成"],
    ["failed", "失败"],
    ["cancelled", "已取消"],
    ["interrupted", "已中断"],
    ["skipped", "已跳过"],
];

const NODE_SAMPLES = [
    { status: "idle", title: "Idle", kind: "core.input", summary: "等待运行" },
    {
        status: "running",
        title: "Running",
        kind: "core.model-call",
        summary: "deepseek-chat",
        selected: true,
    },
    { status: "completed", title: "Completed", kind: "core.output", summary: "text" },
    { status: "failed", title: "Failed", kind: "core.model-call", summary: "timeout" },
    { status: "paused", title: "Paused", kind: "core.loop", summary: "iteration 2/5" },
    { status: "skipped", title: "Skipped", kind: "core.branch", summary: "condition false" },
] as const;

const EDGE_SAMPLES = [
    ["默认", styles.edgeIdle],
    ["执行中", styles.edgeActive],
    ["失败", styles.edgeError],
] as const;

function Section({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: ReactNode;
}): ReactElement {
    return (
        <section className={styles.section}>
            <header className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{title}</h2>
                {description ? <p className={styles.sectionDescription}>{description}</p> : null}
            </header>
            <div className={styles.sectionBody}>{children}</div>
        </section>
    );
}

export function StyleguideView(): ReactElement {
    return (
        <div className={styles.root}>
            <header className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>样式指南</h1>
                <p className={styles.pageDescription}>
                    Phase 2.6 / Step 3 视觉契约：tokens、组件状态与 SciFi 节点样张。
                    所有颜色与间距均来自 tokens.css。
                </p>
            </header>

            <div className={styles.sections}>
                <Section title="色彩" description="深色为默认主题；亮色通过 data-theme 覆盖。">
                    <div className={styles.swatches}>
                        {COLOR_TOKENS.map(([label, token]) => (
                            <div key={token} className={styles.swatch}>
                                <div
                                    className={styles.swatchColor}
                                    style={{ background: `var(${token})` }}
                                />
                                <span className={styles.swatchLabel}>{label}</span>
                                <code className={styles.swatchToken}>{token}</code>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="字体" description="界面使用系统 UI 字体，标识符使用等宽字体。">
                    <div className={styles.typeList}>
                        {TYPE_SCALE.map(([name, token, sample]) => (
                            <div key={name} className={styles.typeRow}>
                                <code className={styles.typeToken}>{token}</code>
                                <span style={{ fontSize: `var(${token})` }}>{sample}</span>
                            </div>
                        ))}
                        <div className={styles.typeRow}>
                            <code className={styles.typeToken}>--fh-font-mono</code>
                            <span className={styles.mono}>run_01J9Z2K5T4</span>
                        </div>
                    </div>
                </Section>

                <Section title="间距与圆角" description="4px 基线；圆角 4 / 6 / 10 / 14。">
                    <div className={styles.spaceList}>
                        {SPACES.map((n) => (
                            <div key={n} className={styles.spaceRow}>
                                <code className={styles.typeToken}>--fh-space-{n}</code>
                                <span
                                    className={styles.spaceBar}
                                    style={{ width: `var(--fh-space-${n})` }}
                                />
                            </div>
                        ))}
                    </div>
                    <div className={styles.radiusRow}>
                        {RADII.map(([name, value]) => (
                            <div key={name} className={styles.radiusItem}>
                                <span
                                    className={styles.radiusBox}
                                    style={{ borderRadius: `var(--fh-radius-${name})` }}
                                />
                                <code className={styles.typeToken}>{value}</code>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="按钮" description="primary / secondary / ghost / danger，两种尺寸。">
                    <div className={styles.buttonRow}>
                        <Button variant="primary">主操作</Button>
                        <Button variant="secondary">次操作</Button>
                        <Button variant="ghost">幽灵</Button>
                        <Button variant="danger">危险操作</Button>
                        <Button variant="primary" size="sm">
                            小号主操作
                        </Button>
                        <Button variant="secondary" disabled>
                            禁用
                        </Button>
                        <IconButton label="新增">
                            <Plus size={20} aria-hidden="true" />
                        </IconButton>
                        <IconButton label="删除" variant="secondary">
                            <Trash2 size={20} aria-hidden="true" />
                        </IconButton>
                    </div>
                </Section>

                <Section title="徽标与状态" description="颜色 + 文本双重表达，不允许只靠颜色。">
                    <div className={styles.badgeRow}>
                        <Badge>neutral</Badge>
                        <Badge variant="accent">accent</Badge>
                        <Badge variant="success">success</Badge>
                        <Badge variant="warning">warning</Badge>
                        <Badge variant="danger">danger</Badge>
                        <Badge variant="info">info</Badge>
                    </div>
                    <div className={styles.statusRow}>
                        {STATUS_TONES.map(([tone, label]) => (
                            <span key={tone} className={styles.statusItem}>
                                <StatusDot tone={tone} pulse={tone === "running"} />
                                {label}
                            </span>
                        ))}
                    </div>
                </Section>

                <Section title="输入" description="label / hint / error 三段式。">
                    <div className={styles.inputGrid}>
                        <Input label="名称" placeholder="例如：我的工作流" />
                        <Input
                            label="工作区路径"
                            defaultValue="C:\\Users\\biscuit\\Documents\\FlowHarness"
                            hint="用于存放工作区数据"
                        />
                        <Input
                            label="Provider"
                            defaultValue="deepseek"
                            error="该 Provider 尚未配置密钥"
                        />
                    </div>
                </Section>

                <Section
                    title="浮层"
                    description="Radix 负责无障碍与键盘行为，样式由 tokens 控制。"
                >
                    <div className={styles.overlayGrid}>
                        <div className={styles.overlayItem}>
                            <span className={styles.overlayLabel}>Tooltip</span>
                            <Tooltip label="运行当前工作流">
                                <Button size="sm">悬浮查看</Button>
                            </Tooltip>
                        </div>

                        <div className={styles.overlayItem}>
                            <span className={styles.overlayLabel}>DropdownMenu</span>
                            <Menu>
                                <MenuTrigger asChild>
                                    <Button size="sm">
                                        打开菜单
                                        <ChevronDown size={15} aria-hidden="true" />
                                    </Button>
                                </MenuTrigger>
                                <MenuContent align="start">
                                    <MenuLabel>节点</MenuLabel>
                                    <MenuItem>
                                        复制
                                        <MenuShortcut>Ctrl C</MenuShortcut>
                                    </MenuItem>
                                    <MenuItem>
                                        删除
                                        <MenuShortcut>Del</MenuShortcut>
                                    </MenuItem>
                                    <MenuSeparator />
                                    <MenuItem disabled>设为入口</MenuItem>
                                </MenuContent>
                            </Menu>
                        </div>

                        <div className={styles.overlayItem}>
                            <span className={styles.overlayLabel}>ContextMenu</span>
                            <ContextMenu>
                                <ContextMenuTrigger asChild>
                                    <div className={styles.contextArea}>右键打开菜单</div>
                                </ContextMenuTrigger>
                                <ContextMenuContent>
                                    <ContextMenuLabel>画布</ContextMenuLabel>
                                    <ContextMenuItem>粘贴</ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem>适配视图</ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>
                        </div>

                        <div className={styles.overlayItem}>
                            <span className={styles.overlayLabel}>Dialog</span>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button size="sm">打开对话框</Button>
                                </DialogTrigger>
                                <DialogContent
                                    title="删除工作区？"
                                    description="此操作不会删除磁盘上的文件。"
                                    footer={
                                        <>
                                            <DialogClose asChild>
                                                <Button size="sm">取消</Button>
                                            </DialogClose>
                                            <Button size="sm" variant="danger">
                                                删除
                                            </Button>
                                        </>
                                    }
                                >
                                    <Input
                                        label="输入工作区名称以确认"
                                        placeholder="my-workspace"
                                    />
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </Section>

                <Section title="Tabs" description="底部面板与设置页使用同一套样式。">
                    <Tabs defaultValue="overview">
                        <TabsList>
                            <TabsTrigger value="overview">概览</TabsTrigger>
                            <TabsTrigger value="logs">日志</TabsTrigger>
                            <TabsTrigger value="settings">设置</TabsTrigger>
                        </TabsList>
                        <TabsContent value="overview" className={styles.tabBody}>
                            工作台概览与运行状态。
                        </TabsContent>
                        <TabsContent value="logs" className={styles.tabBody}>
                            运行事件与诊断日志。
                        </TabsContent>
                        <TabsContent value="settings" className={styles.tabBody}>
                            工作区与 Provider 设置。
                        </TabsContent>
                    </Tabs>
                </Section>

                <Section
                    title="画布节点"
                    description="HeaderBar + Body 双层，无 Footer；节点始终不透明。"
                >
                    <div className={styles.nodeRow}>
                        {NODE_SAMPLES.map((node) => (
                            <NodeVisual
                                key={node.status}
                                title={node.title}
                                kind={node.kind}
                                status={node.status as CanvasStatus}
                                summary={node.summary}
                                selected={"selected" in node ? node.selected : false}
                            />
                        ))}
                    </div>
                    <MetaList
                        rows={[
                            ["节点宽", `${CANVAS_METRICS.nodeWidth}px`],
                            ["头部高", `${CANVAS_METRICS.nodeHeaderHeight}px`],
                            ["端口", `${CANVAS_METRICS.portSize}px / 命中 ${CANVAS_METRICS.portHitRadius}px`],
                            ["连线", `${CANVAS_METRICS.edgeWidth}px 贝塞尔`],
                            ["网格", `${CANVAS_METRICS.gridSize}px`],
                        ]}
                    />
                </Section>

                <Section title="连线" description="默认低对比；执行中流动；失败虚线。">
                    <div className={styles.edgeList}>
                        {EDGE_SAMPLES.map(([label, className]) => (
                            <div key={label} className={styles.edgeItem}>
                                <span className={styles.edgeLabel}>{label}</span>
                                <svg viewBox="0 0 240 40" className={styles.edgeSvg} aria-hidden="true">
                                    <path className={className} d="M 4 20 C 60 20, 180 20, 236 20" />
                                </svg>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="提示与空状态">
                    <div className={styles.alertStack}>
                        <Alert tone="info" title="信息">
                            运行时会显示在底部面板。
                        </Alert>
                        <Alert tone="success" title="成功">
                            Graph 已完成，耗时 2.4s。
                        </Alert>
                        <Alert tone="warning" title="警告">
                            节点 “Branch” 被跳过。
                        </Alert>
                        <Alert tone="danger" title="失败">
                            Provider 未配置，模型调用失败。
                        </Alert>
                    </div>
                    <EmptyState
                        title="还没有工作区"
                        description="创建一个工作区，开始编排第一个 Harness 工作流。"
                        action={
                            <Button size="sm" variant="primary">
                                新建工作区
                            </Button>
                        }
                    />
                </Section>

                <Section title="快捷键" description="统一使用 Kbd 展示，不写裸文本。">
                    <div className={styles.kbdRow}>
                        <span>
                            <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> 命令面板
                        </span>
                        <span>
                            <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd> 撤销
                        </span>
                        <span>
                            <Kbd>Del</Kbd> 删除选中
                        </span>
                        <span>
                            <Kbd>Esc</Kbd> 取消连线
                        </span>
                    </div>
                </Section>
            </div>
        </div>
    );
}
