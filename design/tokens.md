# Design Tokens

单一事实来源：`apps/desktop/src/renderer/src/styles/tokens.css`。
命名规则：`--fh-{类别}-{角色}[-{程度}]`，全部小写、连字符分隔。

## 类别

| 类别 | 示例 | 说明 |
| --- | --- | --- |
| 表面 | `--fh-bg`、`--fh-surface`、`--fh-surface-raised`、`--fh-surface-overlay` | 背景与浮层，靠层级递进 |
| 文本 | `--fh-text`、`--fh-text-muted`、`--fh-text-subtle`、`--fh-text-inverse` | 三档信息强度 |
| 边框 | `--fh-border`、`--fh-border-strong`、`--fh-border-focus` | 默认/悬停/焦点 |
| 主色 | `--fh-accent`、`--fh-accent-hover`、`--fh-accent-soft`、`--fh-accent-contrast` | 青绿；soft 用于选中底色 |
| 状态 | `--fh-success`、`--fh-warning`、`--fh-danger`、`--fh-info`（各带 `-soft`） | 成功/警告/危险/信息 |
| 画布 | `--fh-canvas-bg`、`--fh-canvas-grid`、`--fh-node-bg`、`--fh-node-border`、`--fh-edge`、`--fh-edge-active` | 画布专用，避免与 shell 混用 |
| 阴影 | `--fh-shadow-1/2/3` | 1 卡片、2 面板、3 浮层 |
| 圆角 | `--fh-radius-xs/sm/md/lg/pill` | 4 / 6 / 10 / 14 / 999 |
| 间距 | `--fh-space-1..8` | 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 |
| 字体 | `--fh-font-ui`、`--fh-font-mono` | 中文优先系统字体 |
| 字号 | `--fh-text-xs/sm/md/lg/xl/2xl` | 11 / 12 / 13 / 15 / 18 / 24 |
| 字重 | `--fh-weight-normal/medium/semibold` | 400 / 500 / 600 |
| 动效 | `--fh-motion-fast/base/slow` + `--fh-ease-standard` | 120 / 160 / 240ms |
| 尺寸 | `--fh-topbar-height`、`--fh-rail-width`、`--fh-inspector-width`、`--fh-statusbar-height`、`--fh-control-height` | shell 与控件尺寸 |
| 层级 | `--fh-z-canvas/rail/topbar/overlay/modal/toast` | 避免魔法数字 |

## 取值（摘要）

| Token | Dark（默认） | Light |
| --- | --- | --- |
| `--fh-bg` | `#0a0f10` | `#f4f7f7` |
| `--fh-surface` | `#101718` | `#ffffff` |
| `--fh-surface-raised` | `#151f21` | `#f7fafa` |
| `--fh-border` | `#223033` | `#d7e0e1` |
| `--fh-text` | `#e6f1f2` | `#10201f` |
| `--fh-text-muted` | `#8fa3a6` | `#5c6f70` |
| `--fh-accent` | `#2dd4bf` | `#0f766e` |
| `--fh-accent-soft` | `#0f2a28` | `#e6f4f2` |
| `--fh-danger` | `#f87171` | `#b91c1c` |

完整值见 `tokens.css`。

## 使用规则

- 组件 CSS Modules 只引用变量；**禁止**出现 `#hex`、`rgb()`、任意 px 间距（几何常量除外）。
- 状态色成对使用：`--fh-danger`（前景/边框）+ `--fh-danger-soft`（底色）。
- 浮层统一 `--fh-surface-overlay` + `--fh-shadow-3`。
- 画布元素只使用 `--fh-canvas-*` 与 `--fh-node-*`，不直接复用 shell 表面色。
- 尺寸用 4 的倍数；控件高度用 `--fh-control-height`（30px）/ `-sm`（26px）。

## 画布几何常量

`apps/desktop/src/renderer/src/canvas/metrics.ts` 导出 `CANVAS_METRICS`：

| 常量 | 值 |
| --- | --- |
| `nodeWidth` | 220 |
| `nodeHeaderHeight` | 32 |
| `nodePadding` | 12 |
| `portSize` | 10 |
| `portHitRadius` | 16 |
| `edgeWidth` | 1.5 |
| `gridSize` | 16 |
| `minimapWidth` / `minimapHeight` | 168 / 96 |
| `minZoom` / `maxZoom` | 0.25 / 2 |

Phase 4 的 react-flow adapter 必须引用同一常量，避免视觉与命中区漂移。
