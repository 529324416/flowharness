# 画布视觉与交互语言

画布是 FH 的核心工作面。本文定义画布的视觉与交互契约；Step 3 已用 `@xyflow/react` 12 实现受控画布与 SciFi 节点/边，静态 `canvas-preview/` 已移除。

## 1. 背景

- 底色 `--fh-canvas-bg`，比 shell 背景略深/略浅一档，形成“工作面”感；
- 点阵网格：间距 16px（`CANVAS_METRICS.gridSize`），点 1px、`--fh-canvas-grid`，随 viewport 缩放；
- 无装饰性渐变/纹理；左上角显示 `CANVAS / LIVE` 状态条（节点/边计数）。

## 2. 节点（Node）

```text
╭──────────────────────────────╮  切角 10/4px
│ [icon] 节点标题        ● 状态 │  header 32
├──────────────────────────────┤
│ CORE.MODEL-CALL              │  mono kind 9
│ deepseek-chat · stream       │  summary 11
├──────────────────────────────┤
│ MODEL     IN 1 / OUT 1  ID…  │  footer 9
╰──────────────────────────────╯
  220 宽 · 1px 边框 · 无圆角（切角）
```

- 宽度 220；高度自适应；
- 标题 11px/600；kind 与 footer 用等宽字体大写，强调“仪器/图纸”感；
- frame 使用 clip-path 切角 + 1px 状态色边框；选中时边框变 accent 并带青绿 glow；
- 状态点在 header 右侧；running 节点使用 energy 橙 + 轻微呼吸；
- 端口：左入右出，10px 圆点，hover 发光；端口名 `IN/OUT` 在节点外侧；
- 节点拖动使用 React Flow 内置手势，snap 到 16px 网格。

## 3. 状态

| 状态 | 边框 | 状态点 | 其他 |
| --- | --- | --- | --- |
| idle | `--fh-border-strong` | muted | — |
| hover | 强边框 | — | 可点击光标 |
| selected | accent 1px + glow | — | 不改变内部底色 |
| running | energy 橙 | energy，脉冲 | kind 文本偏橙、轻微呼吸 |
| paused | warning | warning | — |
| completed | success | success | — |
| failed | danger | danger | 错误图标/红色 |
| skipped | muted | muted | 72% 透明度 |

状态同时有**颜色 + 文本/图标**，不只靠颜色区分。

## 4. 连线（Edge）

- 三次贝塞尔（水平控制点），默认 `1.6px`；
- 默认 `--fh-edge`（低对比）；
- 活跃：energy 橙 + 流动虚线（`stroke-dashoffset` 动画），`prefers-reduced-motion` 时静止；
- 失败：danger 虚线 + 更细的暗红 overlay；
- 方向：左→右；连接从端口拖拽，重复端口由稳定 `edgeKey` 去重。

## 5. 画布附属控件

| 控件 | 位置 | 规格 |
| --- | --- | --- |
| 小地图 | 右下 16px 内边距 | 168×96，圆角 10，边框，状态色节点块 |
| 缩放控件 | 左下（运行日志面板上方） | React Flow Controls：放大/缩小/适配 |
| 画布状态条 | 左上 | `CANVAS / LIVE`、会话名、节点/边计数 |
| 右键菜单 | 跟随指针 | 自定义菜单：删除节点 / 适配视图 / 重置示例图 |

## 6. 交互语法

| 操作 | 状态 |
| --- | --- |
| 平移 | ✅ 拖拽/滚轮 |
| 缩放 | ✅ Ctrl/⌘ + 滚轮、按钮；25%–200% |
| 选择 | ✅ 单击；Shift 追加；框选 |
| 连线 | ✅ 端口拖拽；重复边去重 |
| 删除 | ✅ Delete / Backspace / 右键菜单 |
| 适配视图 | ✅ Controls / 右键菜单 |
| 撤销/重做、复制 | ⬜ Phase 3.5 |
| 右键 | ✅ 空白/节点菜单；边菜单后续 |

## 7. 空状态与异常

- 无会话：由 Shell 的 Hero 承担（不进入画布）；
- 空画布：居中 EmptyState（Phase 3.5 与节点库一起接入）；
- 运行失败：节点 failed；问题面板（Panel）显示问题。

## 8. 性能与降级

- 拖拽/平移期间只更新视觉，不写文档；结束时提交命令；
- > 300 节点时降低网格/小地图刷新频率（待测）；
- `prefers-reduced-motion` 下关闭脉冲、流动与过渡。
