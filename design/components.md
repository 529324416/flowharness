# 组件与外壳

## 1. 组件清单（Phase 2.5）

| 组件 | 变体 / 尺寸 | 行为约定 |
| --- | --- | --- |
| `Button` | primary / secondary / ghost / danger；sm / md | 键盘可聚焦；disabled 时不触发 |
| `IconButton` | ghost / secondary；sm / md | 必须提供 `aria-label`；配 Tooltip |
| `Input` | 默认 / 错误 | label、hint、error 三段式；错误用 `aria-invalid` |
| `Field` | — | 表单行：标签 / 必填标记 / 错误或提示；控件自身负责输入样式 |
| `Select` | 主题化下拉 / 禁用 | 枚举字段；触发器 + Radix DropdownMenu 弹层，不再使用原生 select 弹层 |
| `Checkbox` | — | 自绘方框（隐藏原生外观）；选中用主色描边与勾，焦点态走 `focus-visible` |
| `NumberField` | — | 失焦提交；空值表示未设置；整数/小数由 `step` 区分 |
| `Badge` | neutral / accent / success / warning / danger / info | 小号状态文本，不承载交互 |
| `StatusDot` | 语义色；`pulse` | 仅视觉；旁边必须有文本或 aria-label |
| `Kbd` | — | 展示快捷键，不响应点击 |
| `Panel` | — | 标题 + 操作区 + 内容；shell 与卡片共用 |
| `EmptyState` | — | 图标 + 标题 + 描述 + 可选主操作 |
| `Alert` | info / success / warning / danger | 内联提示，不用 toast 承载错误 |
| `Tabs` | 下划线 | Radix 行为；键盘左右切换 |
| `Tooltip` | — | Radix；延迟 300ms；不承载关键信息 |
| `Menu` | Radix DropdownMenu；支持快捷键提示与分隔线 |
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
│ TitleBar 40（不透明）：品牌 / 文件·视图 / 文档菜单 / 运行 / 面板 / 主题 / 窗口 │
├────┬─────────────────┬───────────────────────────────────────┤
│    │ Session         │ Canvas                                 │
│Rib │ Sidebar 260     │ 各自 1px 外框 + 6px 圆角               │
│52  │ 独立面板         │ 面板化；与 Session 间隙 4px            │
│    │ 搜索 / 会话     │ 可滚动 / 自适应                        │
├────┴─────────────────┴───────────────────────────────────────┤
│ StatusBar 26：全宽不透明 Chrome 层，仅底部圆角                  │
└──────────────────────────────────────────────────────────────┘
     ↑ 中间 Body（Session + Canvas）统一 95% 半透
```

规则：

- TitleBar 是拖拽区（`-webkit-app-region: drag`），按钮/输入自动 `no-drag`；双击空白处切换最大化；
- Ribbon 是工作台切换栏：会话栏开关 + 设计器 / 诊断 / 样式指南，底部设置；
- **只有一个 Session Sidebar**（M6.2 起读取工作区 SessionStore，默认会话 / 新建 / 切换）；可收起、可拖宽，宽度记入 localStorage；
- Session 与 Canvas 各自带 1px 外框和 6px 圆角，用 4px 间隙分隔，不再用共享分隔线“拼”在一起；
- TitleBar 与 StatusBar 使用不透明表面，中间 Body 统一 95% 半透；Session 与 Canvas 处于同一层，最终不透明度一致；
- 设计器按工作区加载：无工作区时显示设计器空状态（「新建工作区」），有工作区时直接进入画布；Session 侧栏目前只是 mock 列表，选中会话不会切换 canvas 文档；
- Inspector 与运行日志已是内部浮动 Panel，默认不占固定区域；
- TitleBar 不画底部边框：下方 Session/Canvas 已有各自 panel 边框，表面色差足以完成分割，再加一条线会显得拥挤；
- 状态栏只读，不放主操作；Footer 与 TitleBar 同级，是全宽 Chrome 层（不内缩、不属于 Body），只保留底部 `--fh-window-radius` 圆角；

## 2.1 内部浮动 Panel

- `PanelFrame`：Header / Body / 可选 Footer；Header 是拖拽手柄，右侧固定折叠与关闭；
- `FloatingPanel`：拖动、右/下/右下缩放、z-index 聚焦、折叠、关闭；位置钳制在画布容器内；
- `PanelLayer`：铺在 Main 之上，默认属性面板右上（280×432）、运行日志左下（448×224）；
- 面板背景默认 95% 不透明（`--fh-panel-alpha`），底色用比节点更深的 `--fh-panel-bg`、头部 `--fh-panel-header-bg`，后续设置项只改 alpha；
- 运行日志面板：「日志 / 问题」两个页签；问题页签汇总校验、失效连线与运行错误，点击条目选中并聚焦对应节点；
- 开关：TitleBar 图标、命令中心、`Ctrl J`；首版不做 docking；
- PanelLayer 只在设计器视图渲染（设计器内始终挂载）；面板开关要求「设计器 + 已打开工作区」，与会话选择无关；Diagnostics / Styleguide 不渲染 PanelLayer。

## 2.2 工作台菜单

- 位置：TitleBar 左区，显示当前工作台标题；菜单列出工作区实例与按注册表生成的新建项；
- 当前类型：`harness-designer`（主工作台，画布）、`graph-table`（节点清单，只读表格）、`plan-runner`（批量运行，顺序独立 run）；
- 切换前 flush 当前文档；切换后由 `WorkbenchHost` 按实例 `type` 渲染对应 View。

## 2.3 Provider 设置

- 入口：Ribbon 底部设置菜单 →「Provider 设置…」；
- 每个 Provider 一张卡片：启用、显示名、Base URL、默认模型；云 Provider 有 API Key 保存/清除与测试连接；
- 密钥输入只写 main，卡片只显示「已保存 / 缺少 API Key」，不显示明文；
- 运行中的审批与用户输入复用同一 Dialog 体系：审批展示工具名与参数 JSON；用户输入支持单选/多选/其他文本。

## 2.4 文档菜单

- 位置：TitleBar 左区，显示当前文档标题；菜单列出工作区内全部 Harness 文档（标题 + 更新时间）；
- 操作：新建 / 重命名（Dialog + Input）/ 复制当前 / 删除当前（确认 Dialog）/ 导入 Harness JSON / 导出 JSON（含布局 / 无布局）；
- 文档切换前若当前文档有未保存修改，先 flush；失败（冲突 / 写盘错误）则停留并提示；
- 空工作区不渲染文档菜单。

## 2.5 节点库浮层

- 入口：画布右键 →「添加节点」；浮层锚定在右键位置（超出可视区时向内钳制）；
- 画布内浮层（不是独立 Panel），点击外部 / Esc 关闭；
- 内容顺序：最近使用（有记录时）→ 预设（`NodePresetLibrary`）→ 按 `category` 分组的内建节点；
- 最近使用最多 6 条，类型与预设分别记录，存 `localStorage["fh.nodeLibrary.recent.v1"]`；搜索时隐藏最近使用组；
- 搜索匹配标题、类型、描述与 `keywords`；选中后立即插入节点并关闭；
- 新节点写入类型 `defaultConfig`；预设插入时写入预设参数默认值；
- 面板宽度 328px，最大高度 380px（`NODE_LIBRARY_MAX_HEIGHT`）；超出后列表内部滚动，使用细滚动条；背景与浮动面板一致（`--fh-panel-bg`）；当前不做「最近使用」之外的排序。`canvas.md` §5 的右键菜单仍只保留删除/适配视图。

## 3. 视图

| 视图 | 用途 | Phase |
| --- | --- | --- |
| Designer | 画布与工作台（React Flow 受控画布 + 主工作流模板 + 节点库 + schema 表单） | 3 → M2 |
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

- [ ] 用 TitleBar 的主题开关切换后，Styleguide 在深/亮两套 token 下都完整可读（页面本身没有主题切换）；
- [ ] 所有组件有 hover / focus-visible / disabled 状态；
- [ ] 画布样张覆盖 idle / running / completed / failed / paused / skipped；selected 目前只与 running 合并展示，需补独立样张；
- [ ] 键盘可完成：打开菜单、关闭弹窗、切换 Tab；
- [ ] 组件样式无硬编码颜色；已知例外：Dialog scrim、窗口关闭按钮、小地图状态色、画布几何 px（待随原语补 token 收敛）。
