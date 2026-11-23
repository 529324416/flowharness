# 组件与外壳

## 1. 组件清单（Phase 2.5）

| 组件 | 变体 / 尺寸 | 行为约定 |
| --- | --- | --- |
| `Button` | primary / secondary / ghost / danger；sm / md | 键盘可聚焦；disabled 时不触发 |
| `IconButton` | ghost / secondary；sm / md | 必须提供 `aria-label`；配 Tooltip |
| `Input` | 默认 / 错误 | label、hint、error 三段式；错误用 `aria-invalid` |
| `Badge` | neutral / accent / success / warning / danger | 小号状态文本，不承载交互 |
| `StatusDot` | 语义色；`pulse` | 仅视觉；旁边必须有文本或 aria-label |
| `Kbd` | — | 展示快捷键，不响应点击 |
| `Panel` | — | 标题 + 操作区 + 内容；shell 与卡片共用 |
| `EmptyState` | — | 图标 + 标题 + 描述 + 可选主操作 |
| `Alert` | info / success / warning / danger | 内联提示，不用 toast 承载错误 |
| `Tabs` | 下划线 | Radix 行为；键盘左右切换 |
| `Tooltip` | — | Radix；延迟 300ms；不承载关键信息 |
| `DropdownMenu` | — | Radix；支持快捷键提示与分隔线 |
| `ContextMenu` | — | Radix；用于画布节点/边/空白 |
| `Dialog` | — | Radix；标题 + 描述 + 底部操作；Esc 关闭 |

所有组件：

- 只从 `src/ui` 导出；
- 样式用 CSS Modules，颜色/间距全部走 token；
- 焦点环统一 `--fh-border-focus` + 2px offset；
- 中文文案随组件调用方传入，不在组件内写死。

## 2. 外壳六区

```text
┌────────────────────────────────────────────────────────────┐
│ TopBar 44：品牌 / 工作区切换 / 运行控制 / 主题 / 面板开关      │
├──────┬──────────────────────────────────┬──────────────────┤
│ Rail │ Main                             │ Inspector 320    │
│ 56   │  ┌────────────────────────────┐  │ （可收起）        │
│      │  │ Canvas / View              │  │ 选中节点属性      │
│      │  └────────────────────────────┘  │                  │
│      │  ┌────────────────────────────┐  │                  │
│      │  │ BottomPanel 200（可收起）   │  │                  │
│      │  └────────────────────────────┘  │                  │
├──────┴──────────────────────────────────┴──────────────────┤
│ StatusBar 24：运行状态 / 工作区路径 / 缩放 / 阶段             │
└────────────────────────────────────────────────────────────┘
```

规则：

- 顶栏不随视图滚动；
- 左栏只放导航与全局入口（图标 + Tooltip）；
- 检查器与底部面板可独立收起，收起后主区域自适应；
- 状态栏是只读信息区，不放主操作；
- 窄窗口（< 1100px）时检查器默认收起（Phase 3 处理）。

## 3. 视图

| 视图 | 用途 | Phase |
| --- | --- | --- |
| Designer | 画布与工作台（当前为静态视觉样张） | 2.5 / 3 |
| Diagnostics | 运行时 / Wireclaw / 数据层 / 运行自检 | 已有 |
| Styleguide | tokens、组件、节点与状态样张 | 2.5 |

smoke 模式默认打开 Diagnostics，保证自检 run 正常触发。

## 4. 文案与图标

- 图标统一 Lucide，尺寸 16（控件）/ 18（栏位）；
- 图标不单独承载含义：必须配 Tooltip 或文本；
- 状态文案：未运行 / 运行中 / 已暂停 / 已完成 / 失败 / 已取消 / 已中断；
- 中文为主，技术标识（runId、hash）用等宽字体。

## 5. 评审清单

- [ ] Styleguide 能在深/亮两套主题下完整浏览；
- [ ] 所有组件有 hover / focus-visible / disabled 状态；
- [ ] 画布样张包含 idle / running / completed / failed / skipped / selected 六种状态；
- [ ] 键盘可完成：打开菜单、关闭弹窗、切换 Tab；
- [ ] 无硬编码颜色；无孤立 px 间距（几何常量除外）。
