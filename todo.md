# TODO

> 当前主线：**M6 Session / Provider 闭环**（M5 Workbench Framework 已完成）。
> 原则：垂直切片；UI 外壳冻结，只改组件；wireclaw 契约先行、submodule 联合开发。

## 当前里程碑（M1 已完成）

### M1 — 最小可运行 Harness Designer（5 轮）

每轮结束应用保持可运行；M1.1 是纯重构，用户可见行为不变。

#### M1.1 — 数据与视图契约（已完成 2026-11-25）

- [x] 纯 Canvas 类型：`CanvasNode / CanvasEdge / CanvasDocument / CanvasPort / CanvasCommand`；`canvas/core` 去 `@xyflow/react`
- [x] 布局 helper：`node.ui.x/y`、`graph.ui.viewport`；缺省网格；保留其他 `ui` 字段
- [x] `GraphDocument → CanvasDocument` adapter；catalog 解析 title / ports；未知类型降级
- [x] `CanvasCommand` 回写 `GraphDocument`：`moveNodes / removeNodes / connect / disconnect`，保留未知字段
- [x] `CanvasView` 改受控：`document + onCommand + selectedNodeId`；示例图改为 `GraphDocument` fixture
- [x] 测试：adapter / command / layout / 未知类型；`capture:ui` 视觉对比通过

验收：只重构不换数据源；示例画布布局 / 样式不变（类型名 `core.model-call` / `core.log-sink` 修正为 wireclaw 内建名）。

#### M1.2 — 只读设计器（已完成 2026-11-25）

- [x] 工作区入口：打开最近工作区；无工作区时创建；设计器脱离 mock Session
- [x] 读取 / 创建 `main` `GraphDocument`；revision 进 state
- [x] 设计器文档 state（只读）：load / selectedNodeId / 错误态
- [x] `CanvasView` 接真实文档；`readOnly` 禁用编辑；按文档重置视口
- [x] `SciFiNode` 按端口列表渲染 Handle；节点高度随端口数变化；重拍 `capture:ui`
- [x] 测试：模板创建、加载、adapter 集成

验收：启动 → 打开工作区 → 真实图渲染；`sample-graph` 已移除。

#### M1.3 — 运行可视化（已完成 2026-11-25）

- [x] renderer 侧 `validate`；有 error 阻断运行
- [x] 运行 / 取消控件；用当前文档 `run:start`
- [x] 运行事件 → `nodeStatuses`；`CanvasView` 合并状态
- [x] 运行日志 / StatusBar 接线
- [x] 测试：事件映射纯函数

验收：`Constant → Output` 可运行；节点状态、日志、取消正确。
补充：运行基线见 `devlog/assets/ui-designer-run.png`。

#### M1.4 — 编辑与自动保存（已完成 2026-11-25）

- [x] 启用 Canvas 编辑：move / connect / disconnect / delete / setViewport 回写 `GraphDocument`
- [x] 添加节点：catalog 列表 + typeVersion + 唯一 id + 位置（默认 config 留到 M2）
- [x] 自动保存 400ms；串行化；saved / saving / conflict / error
- [x] 冲突暂停并提示重载；切换工作区 / 卸载 flush
- [x] 测试：SaveCoordinator（fake timers）、命令集成

验收：编辑 → 自动保存 → 重启恢复；冲突不静默覆盖。
补充：编辑基线见 `devlog/assets/ui-designer-edit.png`；默认画布与运行基线已重拍。

#### M1.5 — 检查器与收口（已完成 2026-11-25）

- [x] 检查器接选中节点：type / title / typeVersion / ports / requirements / run 状态
- [x] 原始 JSON config 编辑 + 解析错误；`updateNodeConfig` 回写
- [x] 空选中显示图级信息
- [x] 错误 / 空态 / 保存状态收口
- [x] 质量：`typecheck / test / build / smoke`；`capture:ui`；手工 demo
- [x] 文档同步：readme / architecture / todo

验收：M1 七条全部满足。
补充：检查器基线见 `devlog/assets/ui-designer.png`；配置写回已用 `designer-config` 场景验证。

## 后续

### M2 — 节点库与配置表单（2026-11-25 已完成）

> 已完成：wireclaw 侧 11 个节点补齐 `configSchema` / `defaultConfig` / 分类 / 关键词，catalog v2 并修复 `requirements` 丢失；FH 侧接入 `createEditorCatalog`、右键节点库（分类 + 搜索 + 预设）、新节点默认 config、检查器 schema 表单（JSON 兜底）、3 条内置预设、失效连线提示。

- [x] 节点库面板：分类 / 搜索 / 最近使用；`createEditorCatalog` + `NodePresetLibrary`
- [x] 检查器按节点类型渲染（`configSchema` 表单 + JSON 兜底）
- [x] 新节点使用类型默认 config（含 `core.loop.maxIterations` 这类必填项）
- [x] wireclaw：内置节点补齐 `configSchema`
- [x] wireclaw：catalog 默认 config、分类 / 搜索元数据；修复 `toDescriptor` 丢失 `requirements`
- [x] 配置变化后刷新动态端口；失效边提示（端口来自 config 投影；内建节点端口目前全静态）

### 代码一致性收口（2026-11-25 已完成）

- [x] 网格：可见间距与 `snapGrid` 统一为 24px（`CANVAS_METRICS.gridSize`）
- [x] 端口：视觉 10px / 热区 24px，尺寸来自 `--fh-port-size` / `--fh-port-hit-size`；移除 `react-flow__handle` 的 min 覆盖
- [x] 边宽：默认与活跃统一 1.4px（`--fh-edge-width`），Styleguide 样张同步
- [x] 属性面板：默认 280×432，与 `PANEL_MIN_WIDTH` 对齐；折叠高度与 `PanelFrame` 共用 `PANEL_HEADER_HEIGHT=34`
- [x] 侧栏：默认 260 / 范围 200–360，`tokens.css` 与 `SessionSidebar` 常量一致
- [x] 文档目标能力（`CanvasAnimationApi`、`Controls`、`modules/*`）均保持“目标/未实现”标注

### M3 — 校验与运行可视化（2026-11-25 已完成）

> 已完成：问题面板汇总校验 / 失效连线 / 运行错误，点击定位并聚焦节点；wireclaw 递归校验 Subgraph / Loop / ForEach（`graphPath` / `nestedNodeId`，深度上限 8），requirements catalog 随递归下传；运行事件同时投影节点与边状态；TitleBar 增加暂停 / 继续，取消/结束后清理 running / active。

- [x] `Graph.validate` 与问题面板；问题定位到节点 / 边
- [x] 运行事件 → 画布节点 / 边状态映射（active / error）
- [x] 暂停 / 继续 UI；取消后的状态清理
- [x] wireclaw：递归校验 Subgraph / Loop / ForEach
- [x] wireclaw：requirements 传播与 issue 定位

### M4 — 文档生命周期与编辑体验（2026-11-25 已完成）

> 已完成：`workspace:listDocuments` / `deleteDocument`；标题栏文档菜单（列表 / 新建 / 重命名 / 复制 / 删除 / 最近打开 / 导入导出）；撤销重做、复制粘贴与多选；左键框选 + 中键/右键拖拽平移（右键拖动后抑制菜单）；切换文档与关闭窗口前 flush，冲突可另存副本。

- [x] `workspace:listDocuments`（与 `deleteDocument`）
- [x] 多图：新建 / 重命名 / 复制 / 删除 / 最近打开
- [x] Harness JSON 导入导出（可选剥离 `ui`）
- [x] 撤销 / 重做、复制 / 粘贴
- [x] 未保存保护、冲突恢复、外部修改检测（系统级关闭仍有限制）
- [x] 文档切换入口；工作台切换留 M5

### M5 — Workbench Framework（2026-11-25 已完成）

> M5.1：`WorkbenchDefinition` / 实例文档（`documents/workbenches`）/ `WorkbenchController` / 命令栈与自动保存；registry + `WorkbenchHost`；「节点清单」工作台；Constant / Model Call / Log 内联编辑。
> M5.2：第三个「批量运行」工作台与 `WorkbenchPlan` 顺序执行；节点 Body 输入端口槽拖拽；实例重命名 / 删除；Value / Agent / Loop / ForEach 内联编辑。
> 已知限制：Plan 编排目前在 workbench renderer 侧顺序调用 `run:start`，尚未下沉 RuntimeHost；`plan.bindings` 与 `layout.overrides` 未接线。

- [x] `WorkbenchDefinition` / 工作台实例文档 / controller / 命令栈 / 自动保存
- [x] 模块注册表与视图宿主
- [x] `WorkbenchPlan`（独立多 run 顺序执行；优先 subgraph 的约束保留）
- [x] 第二 / 第三个工作台（节点清单 / 批量运行）验证框架复用性
- [x] 高频节点内联编辑：Constant / Model Call / Log / Value / Agent / Loop / ForEach
- [x] 拖拽传入：输出端口可落在 Body 输入端口槽，或使用左侧 Handle

### M6 — Session / Provider 闭环（M6.3 已完成）

> M6.1：Provider 工厂 + Secrets + 设置页；`resolveProvider` 接入 RuntimeHost；审批 / 用户输入对话框；跨重启 checkpoint 恢复。
> M6.2：wireclaw checkpoint 升级到 v2（graphHash + nodeVersions）；工作区 LocalToolProvider 注册真实文件工具；renderer 运行前 requirements catalog 接 ProviderRegistry；SessionStore 生命周期（默认会话 / 创建 / 列表 / 读取 / 保存）与侧栏真实会话。
> M6.3：SessionStore 校验 / 规范化 wireclaw `SessionData`，派生消息数与附件索引；新增「会话历史」视图回放消息 / 工具调用 / 附件，`blob:stat` + `fh-asset://` 渲染附件。剩余：消息写入侧（聊天输入 / Agent 会话对接）。

- [x] Provider 工厂 + Secrets（DeepSeek / Ollama / MiniMax / Qwen）
- [x] 模型 / Agent 节点真正可运行（Provider + workspace 文件工具 + 审批）
- [x] Session 生命周期（创建 / 列表 / 读取 / 保存 / 默认会话）
- [x] Session 历史消息序列化、附件回放 UI
- [x] 审批 / 用户输入 UI
- [x] 跨重启 resume（checkpoint + graph 装载）
- [x] wireclaw：checkpoint 的 graph hash / node type version（v2）

### M7 — 模板、导入导出与多工作台（原 Phase 6）

- [ ] 工作台模板 / 节点预设
- [ ] `.fhws` 导入导出 UI 与冲突策略
- [ ] 更多工作台类型

### M8 — 可观测性与工程化（原 Phase 7）

- [ ] run 事件回放 / 诊断包导出
- [ ] 日志分级、脱敏、traceId 展示
- [ ] 格式化与 lint
- [ ] CI：install → ensure:electron → build:wireclaw → typecheck → test → build → smoke
- [ ] 300 节点性能基线
- [ ] 亮色主题视觉走查
- [ ] 真实桌面可读性 / 性能 / 窗口阴影 / 缩放验收

### M9 — 打包与发布（原 Phase 8）

- [ ] electron-builder / electron-forge 打包
- [ ] 自动更新通道与签名
- [ ] 发布流程与版本约定

## 历史已完成

### M0 — 文档持久化边界（2026-11-25）

- [x] contracts：`workspace:readDocument` / `workspace:saveDocument` 通道与 DTO
- [x] main：接入 `WorkspaceStore`；SHA-256 revision；旧 revision 返回 `E_CONFLICT`；缺失返回 `null`；4 MB 上限
- [x] preload / `bridge.d.ts`：暴露 `readDocument` / `saveDocument`
- [x] 测试：读写往返、旧 revision 冲突、路径穿越、损坏文档、保存失败
- [x] ADR-012：快照 + 内容哈希 revision；`applyCommands` 延后

### 工程与架构

- [x] pnpm workspace（`apps/*` + `packages/*` + `vendor/wireclaw`）
- [x] wireclaw 作为 submodule 纳入，并以普通包引用（`import { Graph } from "wireclaw"`）
- [x] Electron main / preload / renderer 三端构建
- [x] Node 24 / pnpm 12 / TypeScript 7 / Electron 45 / electron-vite 6 / Vite 8
- [x] `typecheck / test / build / smoke` 验证链
- [x] Windows 一键启动 `run.bat`（沙箱受限自动降级）
- [x] 六层架构、模块职责、数据模型、执行 / IPC、UI 文档
- [x] ADR-001 ~ ADR-016
- [x] 设计契约：tokens / canvas / components

### Phase 0 — 基础迁移

- [x] `packages/contracts`（IPC 通道 / DTO / 错误码）
- [x] React 19 + `@vitejs/plugin-react`
- [x] design tokens + ThemeProvider + 首帧主题

### Phase 1 — main 数据层

- [x] Platform（窗口 / IPC 路由 / `fh-asset://`）
- [x] AppConfig / Secrets / BlobStore / WorkspaceStore / WorkspaceFileHost
- [x] `.fhws` 导入导出、pid 锁、原子写、迁移
- [x] 数据层单测

### Phase 2 — 执行层

- [x] RuntimeHost（`GraphHost` 装配、start/pause/resume/cancel）
- [x] RunStore（meta / graph / events / checkpoint / interrupted）
- [x] 事件投影与节流、IPC 事件流
- [x] 审批 / 用户输入 IPC 往返
- [x] 自检 run：Constant → Output
- [x] Provider 工厂（M6.1）与 Session 生命周期（M6.2）

### Phase 2.5 — UI 基础

- [x] tokens、六区外壳、组件原语、Styleguide
- [x] 画布静态视觉样张（节点状态 / 连线状态 / 小地图）
- [x] 窗口菜单移除、窗口尺寸自适应、画布缩放防裁切、图标 20px

### Phase 2.6 — Shell v2 / Panels / Canvas

- [x] `frame: false` + 自绘 TitleBar + 窗口 IPC
- [x] TitleBar / Ribbon / Session Sidebar / Hero / StatusBar
- [x] 菜单与快捷键（Ctrl+N / B / W / K / 1–3）
- [x] Session Sidebar 先 mock，接口按未来 `SessionSummary` 设计
- [x] 窗口 bounds 持久化（多显示器 / DPI 校正）
- [x] PanelFrame / FloatingPanel：拖动、缩放、层级、折叠、关闭、位置钳制
- [x] 运行日志与属性检查 Panel 接入
- [x] 首版不做 docking

### Phase 3 — Canvas 核心与视图

- [x] `canvas/core`：坐标变换、命中测试、边 key、命令 + 单测
- [x] `canvas/view`：react-flow 12 受控模式、节点 / 边层、小地图、Controls、自定义右键菜单
- [x] Node renderer registry（`kind → React 组件`）
- [x] 节点 / 连线视觉、状态点、端口、流动 / 错误动画
- [x] `prefers-reduced-motion`
- [ ] 大图性能基线（300 节点）（M8）
- [x] GraphDocument adapter / 编辑命令 / 自动保存（M1）
- [x] 节点库（M2）
- [x] 撤销 / 复制（M4）

### Step 4 — 配色 / 真透明 / 商务扁平

- [x] 中性石墨黑全局配色；青绿只做语义色
- [x] 橙红 energy 收敛到关键区域（2026-11-25 已移除，由主色替代）
- [x] 默认真透明窗口；`FLOWHARNESS_WINDOW_MODE=frameless` 为不透明 fallback
- [x] 浮动 Panel 半透明；内容区 12px 圆角
- [x] 节点 6px 圆角、纯色、紧凑间距（不缩字号）
- [x] 背景网格线；低亮度
- [x] 移除选中辉光、节点渐变、连线发光
- [x] `capture:ui` 默认 opaque frameless，保证 renderer 截图可读
- [ ] 亮色主题视觉走查（M8）
- [ ] 真实桌面可读性 / 性能 / 窗口阴影 / 缩放验收（M8）

### UI 打磨（2026-11-25）

- [x] 标记按钮去主色：Rail/Session 选中只用表面高亮，不额外着色
- [x] 主色 / 成功 / 警告 / 危险 / 信息饱和度降至原值 30%
- [x] 移除 `--fh-accent-soft`、`--fh-energy`、`--fh-energy-soft`，引用改由表面色与 `--fh-edge-active` 承担
- [x] 浮动面板默认 95% 不透明，`--fh-panel-alpha` 预留可调
- [x] Session/Canvas 分隔条 hover 改为中性高亮
- [x] 非画布文字放大至 125%，图标同步放大，保持 4px 紧凑间距
- [x] 节点改为 HeaderBar + Body 双层，移除 Footer；节点始终不透明
- [x] Session 与 Canvas 面板化：各自 1px 外框 + 6px 圆角，间隙 4px
- [x] 字体统一 `Microsoft YaHei UI`（含 mono 的 CJK 回退）
- [x] 窗口层级：TitleBar/StatusBar 不透明，Body 单一 95% 半透，Session/Canvas 一致
- [x] 浮动面板缩至原尺寸 80%（属性 256×432 / 运行日志 448×224）
- [x] 节点描边按 1/zoom 反向缩放，缩小后保持 1px 屏幕描边
- [x] 输入框移除 focus 高亮；Footer 改回全宽 Chrome 层（仅底部圆角）；TitleBar 移除底边框；移除画布缩放工具栏

### UI 打磨 2（2026-11-25）

- [x] 浮动面板换用比节点更深的 `--fh-panel-bg` / `--fh-panel-header-bg`；节点库浮层同材质
- [x] Select 改为 Radix DropdownMenu 主题化弹层；Checkbox 自绘方框（保留原生语义）
- [x] 节点库限高 380px + 内部滚动、最近使用、右键位置锚定
- [x] 画布几何 / 面板 / 侧栏尺寸收口（24px 网格、10px 端口、1.4px 边、280 面板、260 侧栏）

### 质量

- [x] 18 个测试文件 / 85 个测试通过（M0 + M1.1 ~ M1.5）
- [x] 24 个测试文件 / 109 个测试通过（M2 + 一致性收口）
- [x] 25 个测试文件 / 121 个测试通过（M3）
- [x] 27 个测试文件 / 135 个测试通过（M4）
- [x] 27 个测试文件 / 136 个测试通过（M5.1）
- [x] 28 个测试文件 / 138 个测试通过（M5.1 修复）
- [x] 30 个测试文件 / 143 个测试通过（M5.2）
- [x] 31 个测试文件 / 149 个测试通过（M6.1）
- [x] 33 个测试文件 / 155 个测试通过（M6.2；wireclaw 66/66）
- [x] 33 个测试文件 / 157 个测试通过（M6.3；新增 session-history 投影与 session-store 历史校验）
- [x] wireclaw：66 项离线测试通过（新增 `harness-nested-validation`）
- [x] `pnpm typecheck` / `pnpm build` / `pnpm smoke` 通过
- [x] 视觉基线截图与设计文档同步

## 远期

- [ ] 云端 Workspace 与同步
- [ ] 多人协作
- [ ] 插件市场 / 第三方工作台沙箱

## Wireclaw 侧（随宿主需求推进）

- [ ] 补齐未完成的 Agent 模块能力（见 `vendor/wireclaw/todo.md`）
- [ ] 在 FH 中验证并收敛 Graph 运行时 API
- [ ] 发布节奏：submodule commit 固定 + npm 发布并行
