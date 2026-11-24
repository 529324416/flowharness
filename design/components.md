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

## 2. 外壳布局（Shell v2 + 2026-11-25 面板化）

```text
┌──────────────────────────────────────────────────────────────┐
│ TitleBar 40（不透明）：品牌 / 菜单 / 命令中心 / 主题 / 窗口控制│
├────┬─────────────────┬───────────────────────────────────────┤
│    │ Session         │ Canvas                                 │
│Rib │ Sidebar 280     │ 各自 1px 外框 + 6px 圆角               │
│52  │ 独立面板         │ 面板化；与 Session 间隙 4px            │
│    │ 搜索 / 会话     │ 可滚动/自适应                          │
├────┴─────────────────┴───────────────────────────────────────┤
│ StatusBar 26：全宽不透明 Chrome 层，仅底部圆角                          │
└──────────────────────────────────────────────────────────────┘
     ↑ 中间 Body（Session + Canvas）统一 95% 半透
```

规则：

- TitleBar 是拖拽区（`-webkit-app-region: drag`），按钮/输入自动 `no-drag`；双击空白处切换最大化；
- Ribbon 是工作台切换栏：会话栏开关 + 设计器 / 诊断 / 样式指南，底部设置；
- **只有一个 Session Sidebar**（当前为 mock 会话，Phase 5 接真实数据）；可收起、可拖宽，宽度记入 localStorage；
- Session 与 Canvas 各自带 1px 外框和 6px 圆角，用 4px 间隙分隔，不再用共享分隔线“拼”在一起；
- TitleBar 与 StatusBar 使用不透明表面，中间 Body 统一 95% 半透；Session 与 Canvas 处于同一层，最终不透明度一致；
- 设计器在无选中会话时显示 Hero；选中/新建会话后进入全宽画布；
- Inspector 与运行日志不再占固定区域，后续以**内部浮动 Panel**（step 2）出现；
- TitleBar 不画底部边框：下方 Session/Canvas 已有各自 panel 边框，表面色差足以完成分割，再加一条线会显得拥挤；
- 状态栏只读，不放主操作；Footer 与 TitleBar 同级，是全宽 Chrome 层（不内缩、不属于 Body），只保留底部 `--fh-window-radius` 圆角；

## 2.1 内部浮动 Panel

- `PanelFrame`：Header / Body / 可选 Footer；Header 是拖拽手柄，右侧固定折叠与关闭；
- `FloatingPanel`：拖动、右/下/右下缩放、z-index 聚焦、折叠、关闭；位置钳制在画布容器内；
- `PanelLayer`：铺在 Main 之上，默认属性面板右上（256×432）、运行日志左下（448×224），为原尺寸的 80%；
- 面板背景默认 95% 不透明（`--fh-panel-alpha`），后续设置项只改该 token；
- 开关：TitleBar 图标、命令中心、`Ctrl J`；首版不做 docking；
- 面板只存在于设计器且已选中会话时；Hero 与其他视图不渲染 PanelLayer。

## 3. 视图

| 视图 | 用途 | Phase |
| --- | --- | --- |
| Designer | 画布与工作台（React Flow 受控画布 + 示例图） | 3 |
| Diagnostics | 运行时 / Wireclaw / 数据层 / 运行自检 | 已有 |
| Styleguide | tokens、组件、节点与状态样张 | 2.5 / 3 |

smoke 模式默认打开 Diagnostics，保证自检 run 正常触发。

## 4. 文案与图标

- 字体统一 `Microsoft YaHei UI`（等宽栈也包含它做 CJK 回退，避免宋体）；
- 图标统一 Lucide，尺寸 16–20（控件）/ 24（栏位），随 125% 文字基准同步放大；
- 图标不单独承载含义：必须配 Tooltip 或文本；
- 输入框聚焦不改变边框、不加 ring，只显示原生光标；
- 状态文案：未运行 / 运行中 / 已暂停 / 已完成 / 失败 / 已取消 / 已中断；
- 中文为主，技术标识（runId、hash）用等宽字体。

## 5. 评审清单

- [ ] Styleguide 能在深/亮两套主题下完整浏览；
- [ ] 所有组件有 hover / focus-visible / disabled 状态；
- [ ] 画布样张包含 idle / running / completed / failed / skipped / selected 六种状态；
- [ ] 键盘可完成：打开菜单、关闭弹窗、切换 Tab；
- [ ] 无硬编码颜色；无孤立 px 间距（几何常量除外）。
