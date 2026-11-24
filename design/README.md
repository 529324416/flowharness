# FlowHarness 设计基础（Phase 2.5）

> 目标不是产出全套视觉稿，而是定下**可评审、可执行的 UI 契约**：tokens、外壳布局、组件原语、画布视觉语言、交互语法。
> 评审入口：应用内「样式指南」页（Styleguide）。

## 已定决策

| 项 | 决策 |
| --- | --- |
| 框架 | React 19 + CSS Modules |
| 主题 | **深色优先**，亮色同等维护；默认 dark |
| 主色 | **去饱和青绿**（原饱和度的 30%） |
| 组件 | Radix Primitives（无障碍行为）+ 自研样式；不引整包 UI 套件 |
| 图标 | Lucide |
| 密度 | 非画布文字 125% 基准；控件 32/28px，节点宽 220px，4px 间距基线 |
| 窗口 | 无边框 + 默认真透明（ADR-009）；`frameless` 为不透明 fallback |
| 动效 | 120–240ms，尊重 `prefers-reduced-motion` |

## 设计原则

1. **工具优先**：信息密度优先于留白；不做营销式大标题与渐变装饰。
2. **层级靠表面与边框**：阴影只用于浮层（菜单/弹窗/检查器），主界面以 1px 边框和表面色分层。
3. **状态必须有语义**：颜色 + 图标/文本双重表达；颜色不是唯一信息通道。
4. **动效克制**：只用于状态变化与空间关系提示，不做装饰性动画。
5. **紧凑而可读**：非画布文字 16.25px 基准（125%）、图标同步放大、控件 32/28px；间距仍走 4px 基线，不整体等比放大。
6. **明暗同等**：两套 token 同步维护，画布在两种主题下都可长时间使用。
7. **可访问**：焦点环、键盘可达、对比度 ≥ 4.5、支持 reduced motion。

## 组织方式

```text
design/                  # 本目录：契约文档
apps/desktop/src/renderer/src/
  styles/tokens.css      # 唯一视觉事实来源（CSS 变量）
  styles/global.css      # reset 与基础排版
  ui/                    # 组件原语（Button / Menu / Dialog / …）
  shell/                 # TitleBar / Ribbon / SessionSidebar / panels
  views/                 # Designer / Hero / Diagnostics / Styleguide
  canvas/core/           # 几何 / 边 key / 命令
  canvas/view/           # React Flow 画布、SciFi 节点/边
```

规则：

- 组件只消费 `--fh-*` 变量，不写死颜色/间距；
- 浮层（菜单、弹窗、Tooltip）必须走 Radix 原语，键盘与焦点行为不自己造；
- 画布几何常量集中在 `canvas/metrics.ts`，不散落在组件里；
- 新组件先加进 Styleguide，再接业务。

## 文档索引

- [tokens.md](./tokens.md) — token 命名与取值
- [canvas.md](./canvas.md) — 画布视觉语言与交互语法
- [components.md](./components.md) — 组件清单与行为约定

## 本阶段不做

- 每个未来工作台的最终页面；
- 品牌 logo、插画、空状态插画；
- 复杂动画编排、主题自定义面板、响应式与移动端。

## 评审方式（Windows）

```bash
pnpm build        # 先产出 out/
pnpm capture:ui   # 启动应用并通过 CDP 截取 renderer（默认 devlog/assets/ui-current.png）
```

默认走 CDP `Page.captureScreenshot`，得到 1440×900 的 renderer 视图，不受窗口遮挡/动画合成影响；
默认以 **opaque frameless** 启动，保证截图可读；`-WindowMode transparent` 只用于 renderer 层对比。
真透明的桌面透出必须用 GPU + 系统屏幕抓取，CDP 截图不会包含桌面。当前视觉基线保留在 `devlog/assets/step4-*.png`；不再保留逐阶段过程截图。


