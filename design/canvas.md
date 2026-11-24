# 画布视觉与交互语言

画布是 FH 的核心工作面。Step 3 已用 `@xyflow/react` 12 实现受控画布；Step 4 收口为**商务扁平 + 中性黑 + 真透明**。

## 1. 背景

- 画布本体透明，露出 Body 的 95% 底色；`--fh-canvas-bg` 目前只用于连线端点填充（`SciFiEdge`）与 Styleguide 色块；
- **网格线**（不是网点）：24px 间距、1px、`--fh-canvas-grid`，整体 opacity 0.45，由 React Flow `Background` 绘制；拖拽吸附共用 `CANVAS_METRICS.gridSize`（24px），与可见网格一致；
- 不使用装饰性渐变/发光；左上角显示 `CANVAS / LIVE`、图标题（缺省回退工作区名）、节点/边计数。

## 2. 节点（Node）

```text
┌──────────────────────────────┐  6px 圆角，整体不透明
│ [icon] 节点标题        ● 状态 │  HeaderBar 30
├──────────────────────────────┤
│ CORE.MODEL-CALL              │  9px mono
│ deepseek-chat · stream       │  11px
└──────────────────────────────┘  220 宽 · 1px 边框 · 纯色底
```

- 220 宽，`border-radius: 6px`，**纯色不透明背景**（透明窗口下也不透桌面）；
- 描边为屏幕 1px：`border-width: calc(1px / var(--fh-canvas-zoom))`，由 React Flow 的 `onMove` 写入缩放值（50% 时本地 2px）。圆角仍按 6px 正常比例缩放；这是为了解决缩小后圆角与边框发虚的问题；
- 结构固定为 **HeaderBar + Body** 两层；Footer 已移除，不再展示 type/meta/ports/id；
- HeaderBar 30px（`--fh-surface-raised`），body padding 8/9px；
- 节点内字体与画布外统一为 `Microsoft YaHei UI`；标题 12px/600，kind 9px mono，summary 11px（画布内字号不参与 125% 缩放）；
- 状态点位于 Header 右侧；端口左入右出，10px 圆点、24px 透明热区（`--fh-port-size` / `--fh-port-hit-size`），hover 仅换边框色；
- 选中只改变边框颜色为 `--fh-accent`，**没有辉光/外描边**。

## 3. 状态

| 状态 | 边框 | 状态点 | 其他 |
| --- | --- | --- | --- |
| idle | `--fh-border-strong` | muted | — |
| selected | `--fh-accent` | — | 仅换边框色 |
| running | `--fh-border-strong` | accent（StatusDot） | 不额外发光 |
| paused | warning 混色 | warning | — |
| completed | success 混色 | success | — |
| failed | danger 混色 | danger | — |
| skipped | `--fh-border` | muted | 只用低对比颜色，**不降透明度** |

状态必须有**颜色 + 文本/图标**，不只靠颜色区分。

## 4. 连线（Edge）

- 三次贝塞尔，默认 1.4px；
- 默认 `--fh-edge`（低对比）；
- 活跃：`--fh-edge-active`（主色）+ 流动虚线（`stroke-dashoffset`），`prefers-reduced-motion` 时静止；
- 失败：danger 虚线；
- 失效连线（节点或端口不存在）：能渲染的边用 danger 虚线，同时在画布顶部提示「存在失效连线」并列出原因；
- 不使用 drop-shadow / 发光；能量色 token 已移除；
- 重复端口由稳定 `edgeKey` 去重。

## 5. 画布附属控件

| 控件 | 位置 | 规格 |
| --- | --- | --- |
| 小地图 | 右下 15px 内边距（React Flow 默认 margin） | 168×96，圆角 10，状态色块 |
| 画布状态条 | 左上 | `CANVAS / LIVE`、图标题（缺省回退工作区名）、节点/边计数 |
| 右键菜单 | 跟随指针 | 任何位置「添加节点」与「适配视图」；选中节点时另有「删除节点」（Del） |

> 左下角的微型缩放工具栏已移除；缩放交给滚轮 / Ctrl+滚轮，适配视图放在右键菜单。

## 6. 交互语法

| 操作 | 状态 |
| --- | --- |
| 平移 / 缩放 | ✅ 拖拽/滚轮/Ctrl+滚轮；25%–200% |
| 选择 / 框选 | ✅ |
| 连线 | ✅ 端口拖拽，重复边去重 |
| 删除 | ✅ Delete / Backspace / 右键菜单 |
| 适配视图 | ✅ 右键菜单（缩放工具栏已移除） |
| 节点库 | ✅ 右键「添加节点」；预设 + 分类 + 搜索，选中即插入 |
| 撤销/重做、复制 | ⬜ M4 |
| 右键 | ✅ 空白/节点菜单；边菜单后续 |

## 7. 空状态与异常

- 无工作区：由设计器空状态承担；
- 空画布：节点库（分类 + 搜索 + 预设）已可用，但画布还没有空态引导，待后续补；
- 运行失败：节点 failed；校验/运行错误目前以设计器内 Alert 横幅展示，问题面板留到 M3。

## 8. 窗口与面板

- 默认真透明，窗口内容 12px 圆角（透明窗口的圆角外露出桌面）；
- TitleBar 与 StatusBar 完全不透明（`--fh-surface-solid`）；中间的 Body（Session + Canvas）统一 95% 半透（`--fh-body-bg`），两者最终 alpha 相同；
- 浮动 Panel：默认 95% 不透明（`--fh-panel-alpha`），底色为比节点更深的 `--fh-panel-bg`、头部 `--fh-panel-header-bg`，圆角 8；默认尺寸为属性 280×432、运行日志 448×224；不加 backdrop-filter（透明窗口下会变黑）；
- 桌面本身**不会模糊**（Chromium/Electron 限制，见 ADR-009）；
- `prefers-reduced-motion` 下关闭连线流动。
