# 画布视觉与交互语言

画布是 FH 的核心工作面。Step 3 已用 `@xyflow/react` 12 实现受控画布；Step 4 收口为**商务扁平 + 中性黑 + 真透明**。

## 1. 背景

- 底色 `--fh-canvas-bg`；
- **网格线**（不是网点）：24px 间距、1px、`--fh-canvas-grid`，整体 opacity 0.45；
- 不使用装饰性渐变/发光；左上角显示 `CANVAS / LIVE`、会话名、节点/边计数。

## 2. 节点（Node）

```text
┌──────────────────────────────┐  6px 圆角
│ [icon] 节点标题        ● 状态 │  header 28
├──────────────────────────────┤
│ CORE.MODEL-CALL              │  9px mono
│ deepseek-chat · stream       │  11px
├──────────────────────────────┤
│ MODEL     IN 1 / OUT 1  ID…  │  9px mono
└──────────────────────────────┘
  220 宽 · 1px 边框 · 纯色底
```

- 220 宽，`border-radius: 6px`，1px 边框，**纯色背景**；
- 节点不使用渐变、外发光、阴影、切角；
- Header 28px，body padding 7/8px，footer 4/5px；**紧凑靠间距，不缩小字号**；
- 标题 12px/600，kind 9px mono，summary 11px，footer 9px mono；
- 状态点位于 Header 右侧；端口左入右出，8px 圆点，hover 仅换边框色；
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
| skipped | `--fh-border` | muted | 62% 透明度 |

状态必须有**颜色 + 文本/图标**，不只靠颜色区分。

## 4. 连线（Edge）

- 三次贝塞尔，默认 1.4px；
- 默认 `--fh-edge`（低对比）；
- 活跃：energy 橙 + 流动虚线（`stroke-dashoffset`），`prefers-reduced-motion` 时静止；
- 失败：danger 虚线；
- 不使用 drop-shadow / 发光；
- 重复端口由稳定 `edgeKey` 去重。

## 5. 画布附属控件

| 控件 | 位置 | 规格 |
| --- | --- | --- |
| 小地图 | 右下 16px 内边距 | 168×96，圆角 10，状态色块 |
| 缩放控件 | 左下（运行日志面板上方） | React Flow Controls |
| 画布状态条 | 左上 | `CANVAS / LIVE`、会话名、节点/边计数 |
| 右键菜单 | 跟随指针 | 删除节点 / 适配视图 / 重置示例图 |

## 6. 交互语法

| 操作 | 状态 |
| --- | --- |
| 平移 / 缩放 | ✅ 拖拽/滚轮/Ctrl+滚轮；25%–200% |
| 选择 / 框选 | ✅ |
| 连线 | ✅ 端口拖拽，重复边去重 |
| 删除 | ✅ Delete / Backspace / 右键菜单 |
| 适配视图 | ✅ Controls / 右键菜单 |
| 撤销/重做、复制 | ⬜ Phase 3.5 |
| 右键 | ✅ 空白/节点菜单；边菜单后续 |

## 7. 空状态与异常

- 无会话：由 Shell 的 Hero 承担；
- 空画布：Phase 3.5 与节点库一起接入；
- 运行失败：节点 failed；问题面板显示问题。

## 8. 窗口与面板

- 默认真透明，窗口内容 12px 圆角（透明窗口的圆角外露出桌面）；
- 浮动 Panel：84% 表面 alpha，圆角 8；不加 backdrop-filter（透明窗口下会变黑）；
- 桌面本身**不会模糊**（Chromium/Electron 限制，见 ADR-009）；
- `prefers-reduced-motion` 下关闭连线流动。
