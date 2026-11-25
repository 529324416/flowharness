# Design Tokens

单一事实来源：`apps/desktop/src/renderer/src/styles/tokens.css`。
命名规则：`--fh-{类别}-{角色}[-{程度}]`，全部小写、连字符分隔。

## 类别

| 类别 | 示例 | 说明 |
| --- | --- | --- |
| 表面 | `--fh-bg`、`--fh-bg-subtle`、`--fh-surface`、`--fh-surface-raised`、`--fh-surface-overlay`、`--fh-surface-solid` | 背景与浮层，靠层级递进；`solid` 用于不透明窗口框 |
| 面板 | `--fh-panel-alpha`、`--fh-panel-bg`、`--fh-panel-header-bg`、`--fh-body-bg` | 浮动面板 0.78 不透明；面板底色比节点更深，头部略亮于面板主体 |
| 文本 | `--fh-text`、`--fh-text-muted`、`--fh-text-subtle`、`--fh-text-inverse` | 三档信息强度 |
| 边框 | `--fh-border`、`--fh-border-strong`、`--fh-border-focus` | 默认/悬停/焦点 |
| 主色 | `--fh-accent`、`--fh-accent-hover`、`--fh-accent-contrast` | 去饱和青绿；只做语义高亮 |
| 状态 | `--fh-success`、`--fh-warning`、`--fh-danger`、`--fh-info`（各带 `-soft`） | 成功/警告/危险/信息 |
| 画布 | `--fh-canvas-bg`、`--fh-canvas-grid`、`--fh-node-bg`、`--fh-node-border`、`--fh-edge`、`--fh-edge-active` | 画布专用；节点背景任何模式下都不透明 |
| 阴影 | `--fh-shadow-1/2/3` | 1 卡片、2 面板、3 浮层 |
| 圆角 | `--fh-radius-xs/sm/md/lg/pill` | 4 / 6 / 10 / 14 / 999 |
| 间距 | `--fh-space-1..8` | 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 |
| 字体 | `--fh-font-ui`、`--fh-font-mono` | 统一 `Microsoft YaHei UI` 优先；mono 仅用于标识符 |
| 字号 | `--fh-text-2xs/xs/sm/md/lg/xl/2xl` + `--fh-ui-scale` | 2xs 12.5 / xs 13.75 / sm 15 / md 16.25 / lg 18.75 / xl 22.5 / 2xl 30 |
| 字重 | `--fh-weight-normal/medium/semibold` | 400 / 500 / 600 |
| 动效 | `--fh-motion-fast/base/slow` + `--fh-ease-standard` | 120 / 160 / 240ms |
| 尺寸 | `--fh-titlebar-height`、`--fh-rail-width`、`--fh-sidebar-*`、`--fh-statusbar-height`、`--fh-control-height` | token 值 40 / 52 / 260 / 26 / 32（sm 28）；侧栏范围 200–360，与 `NavigationPanel` 常量一致；面板尺寸在 `layout-metrics.ts` |
| 布局 | `--fh-panel-gap`、`--fh-panel-inset`、`--fh-window-radius` | Session 与 Canvas 间距 4px；外边距 2px；窗口/Footer 圆角 12px |
| 层级 | `--fh-z-canvas/rail/titlebar/overlay/modal/toast` | 避免魔法数字 |

## 取值（摘要）

| Token | Dark（默认） | Light |
| --- | --- | --- |
| `--fh-bg` | `#07080a` | `#f2f4f6` |
| `--fh-surface` | `#0f1216` | `#ffffff` |
| `--fh-surface-raised` | `#151920` | `#f6f8fa` |
| `--fh-body-bg` | `rgb(5 7 10 / 0.95)` | `rgb(238 241 244 / 0.95)` |
| `--fh-border` | `#232932` | `#d8dee5` |
| `--fh-panel-bg` | `#080a0d` | `#eef1f4` |
| `--fh-panel-header-bg` | `#0b0e12` | `#e7ebef` |
| `--fh-text` | `#e8edf0` | `#12161a` |
| `--fh-text-muted` | `#98a2ac` | `#58626c` |
| `--fh-accent` | `#679a93` | `#335250` |
| `--fh-success` | `#6c9b8a` | `#3a5b46` |
| `--fh-warning` | `#b09e6f` | `#785b45` |
| `--fh-danger` | `#c9a0a0` | `#825353` |
| `--fh-info` | `#7ba3b5` | `#3a596a` |

完整值见 `tokens.css`。

## 使用规则

- 组件 CSS Modules 只引用变量；**禁止**出现 `#hex`、`rgb()`、任意 px 间距（几何常量除外）。已知例外：Dialog scrim、窗口关闭按钮色、画布小地图状态色，待补 token。
- 状态色成对使用：`--fh-danger`（前景/边框）+ `--fh-danger-soft`（底色）。
- 浮层统一 `--fh-surface-overlay` + `--fh-shadow-3`；浮动面板使用更深的 `--fh-panel-bg` / `--fh-panel-header-bg`（比节点底色更深，保持“沉默”）。
- 画布元素只使用 `--fh-canvas-*` 与 `--fh-node-*`，不直接复用 shell 表面色；画布内字号与节点几何按画布视觉直接写 px（不参与 125% 缩放）。
- 尺寸用 4 的倍数；控件高度用 `--fh-control-height`（32px）/ `-sm`（28px）。
- 非画布文字统一走字号 token：基准比 Phase 2.6 放大 125%（`--fh-ui-scale`），图标按同一比例放大；画布内部字号保持不变。
- 字体统一以 `Microsoft YaHei UI` 优先；`--fh-font-mono` 也把它放在等宽字体之后作 CJK 回退，避免任何位置落回宋体。
- 输入框不提供 focus 高亮（不加 ring、不改变边框），只保留原生光标。
- 其余 UI 仍保持细边距与紧凑间距，不做整体等比放大。

### 色彩角色分工（2026-11-25 调整）

| 角色 | 用途 | 约束 |
| --- | --- | --- |
| 中性色（灰黑） | 背景、表面、边框、正文 | 占画面 90% 以上；不允许用主色铺底 |
| 青绿 `--fh-accent` | 选中边框、焦点环、链接、少量强调文字 | 语义高亮，不做背景填充；**饱和度只有原值 30%** |
| 成功 / 警告 / 危险 / 信息 | 状态表达 | 同为 30% 饱和度；必须同时有图标或文本 |
| 高亮 | 选中/激活 | 只用表面色（`--fh-surface-raised`）或边框，不额外着色 |

**已移除的 token**

- `--fh-accent-soft`：选中底色统一用 `--fh-surface-raised` / `--fh-border`；
- `--fh-energy`、`--fh-energy-soft`、`--fh-energy-glow`：活跃连线改用 `--fh-edge-active`（即主色）。

### UI 基线（2026-11-25）

- 非画布正文 `--fh-text-md` = 16.25px；标题/辅助字号同步 ×1.25；
- 图标：控件 16–20，栏位 24；
- 控件 32 / 28，TitleBar 40，StatusBar 26，Rail 52；
- 窗口层级：TitleBar 与 StatusBar 使用 `--fh-surface-solid` 完全不透明；两者都是全宽 Chrome 层，TitleBar 无底边框，Footer 仅底部使用 `--fh-window-radius` 圆角；中间 Body 使用 `--fh-body-bg` 统一 95% 半透（导航与 Canvas 处于同一层，最终 alpha 相同）；
- 面板：Session 与 Canvas 各自 1px 外框 + 6px 圆角，间隙 `--fh-panel-gap: 4px`；
- 浮动面板默认 78% 不透明，底色为比节点更深的 `--fh-panel-bg`，头部 `--fh-panel-header-bg`；结构上支持通过 `--fh-panel-alpha` 调整。

## 画布几何常量

`apps/desktop/src/renderer/src/canvas/metrics.ts` 导出 `CANVAS_METRICS`；`CanvasView` 在根节点把它们写成 CSS 变量，节点/端口的样式从变量取值：

| 常量 | 值 | CSS 变量 / 使用点 |
| --- | --- | --- |
| `nodeWidth` | 220 | `--fh-node-width` → `NodeVisual` / `SciFiNode` 宽度 |
| `nodeHeaderHeight` | 30 | `--fh-node-header-height` → Header 高度、端口布局 |
| `portSize` | 10 | `--fh-port-size` → Handle 直径与左右偏移 |
| `portHitSize` | 24 | `--fh-port-hit-size` → Handle 透明热区 |
| `edgeWidth` | 1.4 | `--fh-edge-width` → 基础边与流动虚线 |
| `gridSize` | 24 | `Background gap` 与 `snapGrid` 共用 |
| `minimapWidth` / `minimapHeight` | 168 / 96 | 与 `CanvasView.module.css` 一致 |
| `minZoom` / `maxZoom` | 0.25 / 2 | `ReactFlow` props |

Styleguide 直接读取同一常量展示数值；修改画布几何只需改 `metrics.ts`。
