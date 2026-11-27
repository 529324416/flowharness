# TODO

> 当前主线：**2026-11-28 收尾**——端口端点 / 输出行顺序、节点折叠（ADR-042）、工作流多选（ADR-043）、运行态动画（ADR-044）、Filter / Combine（ADR-045）、Provider 设置页列表 + 属性栏重构、运行动画修订（无缝警戒环 / 输出→输入白段 / 不随 token 重启）、Replace 节点（ADR-046）、运行临时草稿 / 「存草稿」开关 / Session 多选批量（ADR-047）已完成；M9 已完成（2026-11-27），M8 剩余 — 节点预设库文件导入 / 导出；之后进入 M10 可观测性与工程化、M11 打包发布。
> 原则：垂直切片；契约先行；工作台即视图；信息架构调整优先于新功能。

## 设计约束（M7 起）

- **工作台 = 视图 + 绑定 + 导航**：GraphDocument / Session / Blob / Run 都归 workspace；工作台实例只保存 type、graphs、plan、parameters、layout 等展示与绑定状态。
- **导航跟随工作台 / 阶段**：左侧栏是 Panel 宿主，PanelContent 默认由 `(workbench type, mode)` 提供；声明 `splitNavigation` 的工作台改为上下双区（Harness 设计器：上工作流 / 下会话）；没有全局 Session 侧栏。
- **Session 是 workspace 级递归文件夹树**：目录用稳定 id，标题放元数据；草稿目录由工作区配置，用于承接临时运行结果。
- **运行结果可持久化为 Session**：临时 run 结果可「保存到会话」，默认落入草稿目录；run session 与 conversation session 用 `kind` 区分，不伪造 wireclaw 消息。
- **运行结果与会话历史是 Canvas 浮动面板**：不再有独立的会话 / 运行主视图；面板透明度 `--fh-panel-alpha` = 0.78。
- **工作台运行阶段是带动画的固定工作流运行页**：设计 → 运行是同一工作台实例的模式切换（推荐），不是新的全局页面。

## 已完成里程碑：M7 — 工作台导航、Session 树与运行页（2026-11-26）

> 目标：先把壳层信息架构与 Session 数据模型重构到位，再回到模板 / 发布。
> 本阶段会改变左栏语义、Session 存储结构与工作台契约；每轮结束保持可运行。

### M7.0 设计定稿（ADR + 契约）

- [x] ADR-019：工作台作用域导航（工作台 = 视图 + 绑定 + 导航；数据归 workspace）
- [x] ADR-020：RunResult 归 wireclaw，聚合 model-call / session entries
- [x] 确认运行阶段形态：同一 `WorkbenchInstance` 的 `design` / `run` 模式（不是独立全局页面）
- [x] 确认 Session 树存储：真实目录 `sessions/<folderId>/<sessionId>/session.json` + `folder.json`；folder id 作目录名
- [x] 确认 run session 模型：`SessionRecord.kind: "conversation" | "run"`，run session 保存 wireclaw `RunResult`
- [x] 确认文档绑定语义：`WorkbenchInstance.graphs` 为权威绑定；切换文档同步 primaryGraph；删除 graph 时解除引用（ADR-025 修订）
- [x] 面板材质：`--fh-panel-alpha` 0.95 → 0.78
- [x] 同步 architecture/ui.md、data-model.md、modules.md、decisions.md

### M7.1 壳层导航宿主

- [x] `WorkbenchDefinition` 增加 `navigation`（design / run 槽位）与 `WorkbenchNavigationProps`；run 导航与 RunView 在 M7.5
- [x] `WorkbenchHost` / `App` 按当前工作台渲染左栏；移除全局 `SessionSidebar` 作为左栏
- [x] 抽出 `DocumentNavigation`（即 DesignerNavigation）：GraphDocument 列表（搜索 / 新建 / 最近 / 重命名 / 复制 / 删除 / 导入导出，复用 DocumentMenu 动作）
- [x] 移除顶层 `sessions` 视图与 Ctrl+4；会话历史面板归 M7.3
- [x] `PanelLayer` 通过 `WorkbenchHost.panelLayer` 槽提升到工作台壳层，供运行页与导航复用
- [x] 浮动面板 `--fh-panel-alpha` 改为 0.78，更新 design/tokens 文档
- [x] 文档选择同步 `WorkbenchInstance.graphs` 的 primaryGraph；删除 graph 时解除工作台引用（ADR-025 修订）
- [x] 测试：导航解析（type + mode）、文档绑定、删除时解除引用（`E_CONFLICT` 检查由 ADR-025 取代）

### M7.2 Session 树存储（main）

- [x] contracts：`SessionFolder` / `SessionTreeNode` / `SessionTree` / folder CRUD DTO；`SessionSummary` 增加 `folderId` / `kind` / `entryCount`
- [x] `SessionStore` 支持递归文件夹（创建 / 重命名 / 移动 / 删除）、session 移动与路径安全
- [x] 旧 `sessions/<id>`（根级 session）读取时迁移为 v2；默认草稿文件夹创建；`manifest.settings.draftSessionFolderId`
- [x] `SessionService` / IPC / preload / bridge：list tree、create folder、move、rename、delete
- [x] 删除策略：文件夹递归删除、session 删除；Blob refs 清理以 TODO 记录，待 GC 接线
- [x] 测试：递归创建、重命名 / 移动、路径穿越、旧数据迁移、draft 配置、非法 id

### M7.3 Session 树导航与回放面板

- [x] `SessionNavigation`：递归树、展开 / 折叠、搜索、新建文件夹 / 会话、重命名、移动、删除、草稿目录标识
- [x] `SessionHistoryView` → 浮动面板，挂 `PanelLayer`；入口为 Session 树节点（运行结果入口随 M7.4）
- [x] 运行阶段左栏 = Session 树；设计阶段左栏 = 工作流（GraphDocument）；标题栏/菜单统一对外称“工作流”
- [x] 工作流列表右键菜单，与操作菜单共用动作与重命名 / 删除 / 导入对话框
- [x] 空态 / 错误态 / 附件渲染复用 M6.3
- [x] 测试：树操作投影、选中联动；视觉基线：工作流右键菜单 / 运行会话树 / 历史面板

### M7.4 运行结果 → 草稿 Session（2026-11-26 已完成）

- [x] 运行结果面板（扩展运行日志）：输出 / 结果条目 / 问题；日志页签渲染 `node:end` 输出键、`node:stream` 文本与附件，结果页签汇总 `RunResult`（结果页签已由 M8.6 / ADR-028 移除）
- [x] wireclaw：`RunResult` / `RunResultEntry` 类型、JSON 校验 / 序列化（`RunResultSerializer`）
- [x] wireclaw：ModelCall / AgentRun 采集 entries；Subgraph / Loop / ForEach 带 `graphPath` 冒泡
- [x] FH：RunStore 写 `runs/<runId>/result.json`，RuntimeHost 暴露结果（`run:result`，跨重启可读）
- [x] FH：`SessionRecord` v2 / SessionStore 按 `kind` 校验，run session 存 RunResult
- [x] 「保存到会话」：run → `SessionRecord(kind: "run")`，默认写入草稿目录，可移动
- [x] run session 回放：结果面板 / 会话面板按 `kind` 渲染；引用 runId / graphId / status / outputs
- [x] 草稿目录配置：Session 树文件夹右键「设为草稿目录」，持久化到 workspace settings
- [x] 测试：run→session 往返、草稿目录、输出投影（FH 34 文件 / 171 项；wireclaw 67 项）
- [x] Agent / ModelCall 的消息写入（conversation session）：run 的 entries 解析为真实消息，追加到选中的 conversation 会话；运行模式自动写入，结果面板提供「写入对话」；run session 仍只存 RunResult（已由 M8.6 / ADR-028 改为运行开始自动建会话并逐步写入）

### M7.4.1 双区导航（2026-11-26 已完成）

- [x] `WorkbenchDefinition.splitNavigation`（top / bottom 槽位）与 `WorkbenchNavigationProps.navSection`
- [x] `SplitSidebar`：上下两区共享侧栏宽度，横向拖动比例（20%–80%）并写入 `localStorage`
- [x] `NavigationPanel` 增加 `section` 变体：分区内不再重复宽度拖拽，收起按钮只留上半区
- [x] `harness-designer` 固定为上工作流 / 下会话；mode 只影响主视图
- [x] 测试：导航槽位解析；视觉基线 `designer-split-nav`

### M7.5 工作台运行模式与动画（2026-11-26 已完成）

- [x] `WorkbenchDefinition` 增加 `RunView`；`WorkbenchHost` 按 `mode` 选择主视图
- [x] `harness-designer` 运行模式：画布 + 运行上下文条 + 运行结果面板 + Session 导航；无独立运行页
- [x] 实例持久化 `mode` / `runId` / `sessionId`；设计 ↔ 运行入口（导航与运行条）
- [x] 自定义运行页参考实现：新增 `flow-runner` 工作台（固定只读画布 + 运行控制 + 节点时间线 + 返回配置）（已于 M8.5 移除，ADR-027）
- [x] 最小动画原语：运行节点 pulse（CSS）、活跃边 flow（既有流动虚线）、视口 focus（CanvasView.focusNode 跟随 running 节点），遵守 `prefers-reduced-motion`
- [x] 视觉基线：设计 → 运行 → 保存草稿会话；运行页 `designer-flow-runner`

### M7.6 收口（2026-11-26 已完成）

- [x] `pnpm typecheck / test / build / smoke` + `capture:ui`（35 files / 177 tests；默认设计器基线重拍）
- [x] 文档同步（readme / architecture / design / devlog）
- [x] 旧 M7 顺延为 M8（M8 / M9 / M10 编号已就位）

## 已完成里程碑（M1–M6）

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
- [x] 第二 / 第三个工作台（节点清单 / 批量运行）验证框架复用性（节点清单已于 M8.4 退场）
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

## 当前里程碑：M8 — 模板、导入导出与多工作台（收尾）

- [x] 工作台模板：`workbench/templates.ts`，3 条模板（Harness 空白 / 当前、批量运行；原「节点清单」随 M8.4 退场、独立运行页随 M8.5 退场）
- [x] 节点预设：内置 4 条（新增“图片生成”）
- [x] `.fhws` 导入导出 UI：文件菜单 + 系统对话框；导入总是创建新工作区副本，不覆盖
- [x] 更多工作台类型 / 模板化入口：已注册类型均可从模板创建（`flow-runner` 已于 M8.5 移除）
- [x] 测试与视觉基线：模板解析 / 导入副本、文件菜单、模板菜单

### M8.4 节点库重构（2026-11-27）

- [x] 工作区预设库：`documents/presets/library.json`（`DocumentRef.kind = "presetLibrary"`），复用 WorkspaceStore revision / 原子写；`.fhws` 自动包含
- [x] 数据模型：`PresetFolder`（id / title / parentId）+ `PresetRecord`（type / typeVersion / config / folderId）
- [x] 管理模式 Modal：左文件夹 / 预设树 + 右属性编辑（名称 / 简介 / 文件夹 / configSchema 参数）；新建文件夹、重命名、删除（内容上移）、保存
- [x] 插入菜单：最近使用 → 用户库文件夹 → 内置预设 → 节点类型；搜索、↑↓ + Enter、拖拽到画布
- [x] 画布节点右键「创建预设节点」：命名 Modal（名称 / 简介 / 文件夹）+ 捕获 type / typeVersion / config，创建后打开管理 Modal
- [x] 全局入口：标题栏视图菜单、`Ctrl+Shift+N` / `Ctrl+Shift+M`；插入菜单与模态互斥
- [x] 「节点清单」`graph-table` 工作台与模板删除；旧实例显示迁往节点库的说明
- [x] 测试：预设库模型（文件夹 / 移动 / 删除 / 序列化）+ workspace presetLibrary 文档

### M8.5 移除独立运行页（2026-11-27）

- [x] 删除 `flow-runner` 工作台、2 条模板与注册；模板收敛为 3 条
- [x] 运行复用在 `harness-designer` 画布上：执行 / 暂停 / 控制中自动只读，结束后恢复编辑
- [x] 旧 `flow-runner` 实例打开工作区时迁移为 `harness-designer`（保留 graph 绑定与标题）
- [x] 移除 `designer-flow-runner` 截图场景；ADR-027 记录决策与迁移
- [x] 测试 / 文档同步

### M8.6 运行自动会话（2026-11-27）

- [x] 运行开始自动在草稿目录创建 conversation 会话（标题「运行 · 工作流 · 时间」），选中并自动打开「会话历史」面板
- [x] wireclaw `GraphRun.resultEntries` + `run:entries`：运行中读取已采集 entries
- [x] `session:appendEntries` / `session:appendMessage`：entries 增量写为消息，结束追加输出摘要
- [x] renderer 每 450ms 轮询、按 entry id 去重，结束后补最后一批
- [x] 流式修复：运行事件投影在状态未变化时保持同一对象，`CanvasView` 使用 `memo`；token 流不再触发整张画布重渲染
- [x] 移除运行日志「结果」页签与「保存到会话 / 写入对话」按钮；进入运行模式不再自动建「运行对话」
- [x] 测试：appendEntries / appendMessage 用例；37 文件 / 188 项

### M8 剩余

- [ ] 节点预设库文件的独立导入 / 导出 UI（`.fhws` 已包含节点库）

## 已完成里程碑：M9 — Provider 与 API Key 库（2026-11-27）

### M9.0 / M9.1 决策、契约与数据层

- [x] 决策：API Key 与 Provider Profile 分离；图只存 `providerId` + `modelId`，密钥只在 main；ADR-029 / ADR-030
- [x] 契约：`ApiKeyRecord` / `ProviderProfile` / `ModelCatalogEntry` / 健康状态 / IPC DTO；移除旧 `secrets:*`、`providers:list/test`
- [x] 应用级 `provider-library.json`：宽容读、严格写、原子写、损坏备份、`E_MIGRATION`
- [x] 影子迁移：旧 `AppConfig.providers` / `secrets.bin` → 库；保留旧 id；两阶段 AppConfig v1 → v2
- [x] 测试：库读写 / 迁移 / 指纹 / 旧 key 复制

### M9.2 运行时、健康与 IPC

- [x] wireclaw `SessionError.httpStatus`；`node:error` 回溯 `providerId` 与状态码
- [x] `ProviderRegistry` 库驱动：profile + key + adapter；运行时解析 / 模型刷新 / 健康探测
- [x] 401/403 → invalid；402/429 → quota；网络 / 未验证 → warning；持久化模型目录
- [x] `ProviderLibraryView` / provider topic；真实 DeepSeek key 探测（2 模型 / 无效 key 401）

### M9.3 设置页与 AppConfig v2

- [x] `ProviderLibraryDialog`：API 密钥 / Provider 两区；添加验证、重新验证、替换、删除
- [x] AppConfig v2 两阶段 finalize；库确认落盘后才移除 `providers`；旧 secrets 镜像清理；默认 4 条 Provider 播种
- [x] 旧 ProviderSettingsDialog / 旧 IPC / preload 暴露移除

### M9.4 节点下拉与健康提示

- [x] `ProviderLibraryProvider` 上下文；`core.model` Provider / Model 下拉；无目录回退文本
- [x] 节点摘要 `provider · model`；节点标题健康三角；provider 问题合并运行日志
- [x] error 阻断运行并定位节点；key invalid / unverified 为 warning，允许尝试

### M9.5 Provider 节点与连线（方案 C）

- [x] wireclaw `provider` 值类型 / `ProviderRef` / 端口兼容；`ProviderNode`；Model 可选 `provider` 输入
- [x] 连接优先、config 回退；Provider 节点负责 profile 健康，Model 不重复报错
- [x] 检查器 Provider 下拉；摘要来源 Profile；右键添加节点按画布坐标落点
- [x] 测试：wireclaw 68/68；FH 229 项

### M9.6 收口与真实验收

- [x] Model Call 能力校验：chat / generate / modality 对照目录 capabilities；旧目录无 capabilities 时不误报
- [x] DeepSeek Live：Provider → Model → Model Call 完成（107 tokens）；目录刷新 2 模型；generate 不匹配被阻断
- [x] 文档 / 视觉基线 / 兼容：README、architecture、ADR-029/030/031、devlog、6 张 UI 基线
- [ ] 可搜索下拉（模型目录很大时再补）

## 节点交互约束（2026-11-27）

- [x] Provider 节点 Body 内联 Provider 下拉，直接切换 config.providerId；使用 FH Select（保留默认边框、移除 focus 边框）
- [x] Model 的 `provider` 输入连接后锁定 Inspector Provider 字段（JSON 写入同样保留原值），槽位显示来源 Profile
- [x] 连接 / 切换 Provider 时按持久化模型目录校验：不兼容的 `modelId` 自动清空，并显示可关闭的警告
- [x] Model ID 下拉始终提供「未选择模型」，可清除失效模型；Provider 目录为空且未检测过时后台调用真实模型目录、持久化并广播，失败时检查器提示
- [x] 节点内联属性全量覆盖：Model 的 Provider / Model ID，Model Call / Agent / ToolSet / Loop / ForEach / Subgraph / Event Trigger 的全部 config 字段；对象与内嵌图使用紧凑 JSON TextArea
- [x] Provider 下拉保留默认边框，仅移除 focus 边框，并改用 FH Select 菜单
- [x] Constant 非编辑态改为 p 标签（200 字符 / 3 行裁剪），hover Tooltip 显示最多 400 字符
- [x] Constant 标题栏编辑按钮：TextArea 自增高（上限 180px），退出后回到 p 标签；两种模式关闭拼写检查
- [x] Tooltip 材质改为与浮动面板一致的半透面板
- [x] 浮动面板布局按 Graph 写入 `ui.panels`，打开 Graph 时恢复位置 / 尺寸 / 折叠 / 开关 / 层级
- [x] 测试：45 文件 / 252 项；`pnpm typecheck` / `pnpm build` / `pnpm smoke` 通过

## 表单控件收口（2026-11-27）

- [x] 节点内联枚举全部改用 FH `ui/Select`：Constant 的 text/json、Model Call 的 mode / modality、Agent 的 permission、Log 的 level；保留 22px 紧凑高度与默认边框
- [x] 全局移除 `input` / `select` / `textarea` 的聚焦描边与 focus 期边框变化；输入框、下拉、JSON 代码区只显示默认边框与光标
- [x] 原生 checkbox 全部替换为 `ui/Checkbox`：Value 的必填、Model Call / Agent 的思考、Loop 的失败重试、批量运行的图选择；节点使用新增的 `compact` 变体
- [x] 上游连接固定的字段改为只读展示：Model 的 Provider 渲染锁图标 + 来源 Profile + 「上游」，不再渲染禁用下拉；`CanvasLockedField { value, reason }` 由工作台投影注入
- [x] 新增 `ui/CodeArea` 与 `ui/json-highlight`：JSON 键 / 字符串 / 数字 / 字面量着色，透明 textarea + 高亮层滚动同步；节点内联、检查器表单 JSON 字段与「JSON」页签接入
- [x] 新增 token `--fh-code-*`（深色 VS Code Dark+ 去饱和 / 亮色对应浅色）
- [x] Model ID 下拉空值项去重：工作台已注入「未选择模型」，节点内联只在缺失时补一条（`withEmptyOption`）
- [x] 「未选择模型」改为非阻断状态：不弹 Provider 横幅、不进运行日志问题行、不禁用运行，只在节点标题保留红色叹号与 tooltip（ADR-039）
- [x] Constant 阅读态 JSON 预览使用 `ui/JsonCodeText` 着色，与编辑态同一套 token 颜色
- [x] 测试：46 文件 / 259 项；`pnpm typecheck` / `pnpm build` / `pnpm smoke` 通过
- [x] 视觉基线：`ui-form-controls.png`（锁定行 / FH 下拉 / 自绘勾选）、`ui-json-code.png`（JSON 编辑）、`ui-json-preview.png`（JSON 阅读态）、`ui-model-empty.png`（空模型提示）
- [x] 新增截图场景 `designer-json` / `designer-json-read` / `designer-controls` / `designer-model-empty`

## 模型节点数据端口化（2026-11-27）

- [x] wireclaw `core.model.call` 新增 `system` / `parameters` 输入，config 新增 `providerId` / `modelId` / `prompt` / `attachments`
- [x] wireclaw `core.agent.run` 新增 `system` / `hostTools` 输入，config 新增 `providerId` / `modelId` / `input` / `attachments` / `toolset`
- [x] 执行期端口覆盖 + 本地 config 回退；`model` / `prompt` / `input` 的 `required` 移除，缺值在节点执行期报错
- [x] 画布端口连接 → 字段锁定：只读行（锁图标 + 上游值 + 上游），检查器同字段禁用并显示锁定原因
- [x] Model Call / Agent 本地 Provider + Model 下拉；连接 `model` 端口后锁定并保留本地回退值；切换 Provider 时清空不兼容模型
- [x] 字段顺序：必要数据 → 必要参数 → 常用标量 → 低频枚举 → 结构数据（parameters / toolset / hostTools / attachments）
- [x] 端口行移除装饰性圆点；Agent Run 图标改为 Bot、Model Call 改为 BotMessageSquare
- [x] 测试：wireclaw 68/68；FH 46 文件 / 260 项；`pnpm typecheck` / `pnpm build` / `pnpm smoke` 通过
- [x] 视觉基线：`devlog/assets/ui-form-controls.png`（锁定行 / 本地模型绑定 / 无圆点端口行 / Bot 图标）

## 节点端口徽标与数据行（2026-11-27）

- [x] 节点 Body 顶部增加数据行：输出优先，其次是没有对应字段的输入；移除底部端口列表
- [x] 端口徽标与节点主体保持 5px 间距，上边缘严格对齐数据行；按 offsetTop 布局链测量并在测量后刷新 node internals，拖动 / 缩放不跳变
- [x] 未连接 = 灰色 20px 圆角方块 + 10px 数据类型图标（居中）；已连接 = 20px 橙红空圆环 + 6px 实心点，不显示类型
- [x] Handle 与视觉徽标解耦：6px 透明句柄（未连接对准方块中心、已连接对准实心点中心），命中区覆盖整块徽标
- [x] 连线终点落在实心点中心；`SciFiEdge` 移除自绘端点小圆
- [x] 端口颜色只由连接状态决定（灰色 / 橙红），节点边框与端口不随选中 / 运行状态变化
- [x] 字段顺序：可接入端口的数据优先于只能本地编辑的参数；同组按必要数据 → 必要参数 → 常用标量 → 结构数据
- [x] 输出徽标同构：有下游连线为橙红圆环 + 实心点，否则为灰色方块 + 类型图标
- [x] Model / Model Call / Agent 的内联字段行作为端口锚点；Agent Run 图标 Bot、Model Call 图标 BotMessageSquare
- [x] 截图场景 `designer-controls` 与视觉基线 `devlog/assets/ui-form-controls.png`
- [x] 测试：FH 46 文件 / 260 项；`pnpm typecheck` / `pnpm test:wireclaw` / `pnpm build` / `pnpm smoke` 通过

### 端口后续（可选）

- [ ] 选中节点目前没有颜色高亮（按需求移除）；如需可选中性，补非颜色提示（如外侧虚线框）
- [ ] `temperature` / `think` / `thinkingLv` / `modality` / `maxSteps` 仍为本地参数，未端口化
- [ ] 输出数据行只做展示，暂不支持在节点上编辑输出

## 端口端点与输出行顺序（2026-11-28）

- [x] 已连接端口的连线端点从实心点底部改为圆点中心（Handle 垂直偏移统一 `anchor + 7`）
- [x] `core.model.call` / `core.agent.run` 的 `thinking` 输出移到输出行最后
- [x] readme / todo / ADR-041 / design/canvas / architecture/ui 同步；重拍 `ui-form-controls.png`

## 节点折叠与工作流多选（2026-11-28）

- [x] 节点折叠：Header 右侧按钮切换，状态写入 `node.ui.collapsed`；`setNodeCollapsed` 命令进撤销栈（ADR-042）
- [x] 折叠字段过滤：只保留已连接端口与「有数据且不等于默认值」的 config；默认值取 `configSchema.default` / 类型 `defaultConfig`（`designer/core/collapse.ts`）
- [x] 折叠态隐藏 kind 标签与未连接端口徽标；Constant 空正文、空参数字段不再占位；运行期只读不提供折叠入口
- [x] 工作流多选：Ctrl / Cmd 切换、Shift 从最近点击 / 打开项连选、普通点击打开并清空；打开中的工作流即选中，多选复用同一高亮（ADR-043）
- [x] 批量操作条：全选 / 复制 / 删除 / 清除；批量删除确认 Dialog 列出数量与标题
- [x] 批量右键菜单：打开 / 复制所选 / 删除所选 / 清除选择
- [x] App 批量复制 / 删除：单选入口复用批量实现；删除逐条 IPC + 一次刷新 / 回退；复制仅在单选时切换
- [x] 测试：`designer/core/collapse.test.ts`、`shell/workflow-selection.test.ts`；`pnpm test` 49 文件 / 280 项
- [x] 视觉基线：`devlog/assets/ui-node-collapsed.png`、`devlog/assets/ui-workflow-multi-select.png`
- [x] 截图场景：`designer-collapsed` / `designer-workflow-select` / `designer-workflow-batch`

## 运行态动画（2026-11-28）

- [x] 边动画只在数据输出时出现：`node:stream` 点亮出边、`node:end` 熄灭，`node:start` 不再点亮入边（ADR-044）
- [x] 边动画改为沿连线移动的白色段：`pathLength=100` + 24% 白段 + `stroke-dashoffset` 24→-76，900ms 循环；方向输出→输入，不随 token 重启；`prefers-reduced-motion` 停为整条白线
- [x] 运行节点过热态：橙红描边 + 2px 斜纹警戒环（单一元素 + padding-box 遮罩，四角无缝，条纹 500ms 平移）
- [x] 完成冷却：1.5s 内描边从橙红回到默认色；失败保持 danger，不冷却
- [x] 运行 benchmark HUD：无边框、`tok N` + ms 计时（100ms 增量）+ 最多 80px 尾部输出；运行结束清空
- [x] `RunViewState.nodeMetrics` 投影 + adapter `runMetrics` 注入；stream chunk 提取 `HarnessValue.text`
- [x] 测试：`run-events.test.ts` 覆盖 stream-only 边、指标重置 / 尾部截断；`pnpm test` 49 文件 / 282 项
- [x] 截图场景 `designer-stream`（本地 mock Ollama 流式输出）：运行中 / 冷却两帧与计算样式断言
- [x] 视觉基线：`devlog/assets/ui-run-animation-running.png`、`ui-run-animation-cooling.png`
- [x] Merge / Branch / Loop 等上游锁定字段显示节点标题 + 输出，不再显示 `core.merge` 原始 type id
- [x] HUD 指标 150ms 节流写入画布；警戒环改为单一 mask 环（无缝）
- [x] 画布投影合并保留 React Flow 节点内部字段（`measured` / `internals` / `handleBounds`），边只在 id / status 变化时重建；修复 token 事件导致边动画从 0 重启
- [x] 测试：`flow-merge.test.ts` 3 项；`pnpm test` 51 文件 / 292 项

## Filter / Combine 节点（2026-11-28）

- [x] `core.merge` 更名为 `core.filter`（FilterNode，行为不变：a ?? b），节点库只提供 Filter（ADR-045）
- [x] 新增 `core.combine`：两个 text 输入 + `separator`，按顺序拼接为 text；单路透传、双路缺失执行期 MissingValue
- [x] `core.merge` 保留为 legacy 别名：registry 仍注册，FH 节点库隐藏，旧图 / 旧 run 可继续运行
- [x] 文档加载时递归迁移 `core.merge → core.filter`（含 Loop / ForEach / Subgraph 内嵌图），保存后写回新类型
- [x] 图标：Filter 漏斗 / Combine 合并图标；Combine 内联分隔符字段，折叠态按默认值隐藏
- [x] wireclaw 测试：`harness-filter-combine.ts`（Filter 取 a / 单路 b、Combine 分隔符 / 单路 / 缺值、旧 Merge 别名）；69/69
- [x] FH 测试：catalog（18 项、隐藏 legacy）/ document 迁移；`pnpm test` 49 文件 / 285 项
- [x] 截图场景 `designer-filter-combine` 与基线 `devlog/assets/ui-filter-combine.png`

## Provider 设置页重构（2026-11-28）

- [x] API 密钥页签改为「左侧密钥列表 + 右侧属性栏」；移除原内联新增区，列表头部「新增」打开独立 Modal（协议 / 名称 / API Key / Base URL 四个字段）
- [x] Provider 页签同样改为列表 + 属性栏；属性栏直接编辑名称 / 适配器 / 密钥 / Base URL / 默认模型 / 启用，保留刷新模型与删除
- [x] 新增 `CreateKeyDialog` / `CreateProviderDialog` / `KeyDetailPanel` / `ProviderDetailPanel` / `ProviderFormFields`；`providers/drafts.ts` 提供草稿与 dirty 判断
- [x] Provider 保存按钮只在字段变化时可用；新增成功后刷新库并自动选中新条目；Modal 内错误就地展示
- [x] 测试：`providers/drafts.test.ts` 4 项；`pnpm test` 50 文件 / 289 项
- [x] 截图场景 `provider-keys` / `provider-key-create` / `provider-profile-create` / `provider-key-submit` / `provider-profile-submit`；基线 `ui-m9-provider-library.png` / `ui-m9-provider-profiles.png` / `ui-m9-provider-key-create.png` / `ui-m9-provider-create.png`
- [x] `capture:ui` 新增 `-UserDataDir` 参数，截图可隔离 AppConfig / Provider 库 / 窗口状态

## Replace 节点（2026-11-28）

- [x] wireclaw 新增 `core.replace`：输入 `raw_text` / `keyword` / `replacement`，输出 `text`（ADR-046）
- [x] 三个输入都可从端口传入，未连接时回退 config `rawText` / `keyword` / `replacement`；`count` 默认 -1（全部），0 不替换，正数为上限
- [x] 字面量替换；空 keyword 原样返回；缺 raw_text / keyword 执行期 MissingValue
- [x] FH 节点 Body：raw_text 多行 + keyword / replacement 输入 + count 数字输入；连接后对应字段变为上游锁定行；`ReplaceAll` 图标
- [x] wireclaw 测试 `harness-replace`（config / 端口覆盖 + count / count=0 / 空 keyword / 缺值）；70/70
- [x] FH catalog 更新为 19 类型 / 14 带 schema；`pnpm test` 51 文件 / 296 项
- [x] 截图场景 `designer-replace` 与基线 `devlog/assets/ui-replace.png`

## 运行草稿与会话多选（2026-11-28）

- [x] 运行默认创建临时草稿：`sessions/.tmp/<sessionId>`，`temporary: true`，不进入 Session 树；下一次运行清空 `.tmp`（ADR-047）
- [x] 标题栏运行按钮右侧「存草稿」开关，默认关闭；打开后运行直接写入草稿目录；运行中 / 暂停禁用
- [x] 会话历史面板显示「临时」标记与「存储草稿」按钮；`session:commitTemporary` 移入草稿目录并清除 `temporary`；移除「打开设计器」
- [x] Session 树顶部固定虚线「临时」草稿行，关闭历史面板后可重新打开；该行不参与多选 / 批量
- [x] Session 树多选：Ctrl / Cmd 切换、Shift 连选、打开中的会话始终属于选择；批量操作条全选 / 移动 / 删除 / 清除；批量右键菜单
- [x] 批量移动 / 删除复用既有 `session:move` / `session:delete`，删除当前会话后由 App 清理选择
- [x] 测试：`session-store.test.ts` 新增临时草稿 / 提交 / 非临时 no-op / 自动保存时丢弃旧临时 4 项；`pnpm test` 51 文件 / 296 项
- [x] 截图场景 `run-draft` / `session-multi-select` / `session-batch-delete` / `session-batch-move`；基线 `ui-run-draft.png` / `ui-run-draft-temp.png` / `ui-session-multi-select.png`

## 后续里程碑

### M10 — 可观测性与工程化（原 M9）

- [ ] run 事件回放 / 诊断包导出
- [ ] 日志分级、脱敏、traceId 展示
- [ ] 格式化与 lint
- [ ] CI：install → ensure:electron → build:wireclaw → typecheck → test → build → smoke
- [ ] 300 节点性能基线
- [ ] 定位运行中整屏闪烁（本地 mock 流式场景未复现；已做 HUD 150ms 节流、画布投影保留 React Flow 节点内部字段、边只在状态变化时重建，待真实工作流日志）
- [ ] 亮色主题视觉走查
- [ ] 真实桌面可读性 / 性能 / 窗口阴影 / 缩放验收

### M11 — 打包与发布（原 M10）

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

### UI 打磨 3（2026-11-27）

> 外围优化：Windows 标题栏手势、删除当前工作流、Session 树缩进、Ribbon 宽度。

- [x] 标题栏与 Windows 对齐：透明无边框下恢复双击最大化 / 还原、拖动最大化标题栏先还原；最大化状态在 maximize / unmaximize / resize / focus 广播，renderer 兜底查询，修复图标不同步
- [x] 删除当前 / 被引用工作流：main 解除工作台引用（ADR-025），renderer 回退到上一条渲染图或空态；空态提供「新建工作流」入口
- [x] Session 树文件行比同层文件夹行多缩进一个展开箭头位，会话图标与文件夹图标对齐
- [x] Ribbon 宽度 52 → 46，左右留白收窄
- [x] 验证：typecheck / test（36 文件 / 181 项）/ build / smoke

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
- [x] 36 个测试文件 / 181 个测试通过（2026-11-27；工作流引用解除用例）
- [x] 37 个测试文件 / 187 个测试通过（2026-11-27；节点库模型 + presetLibrary 文档）
- [x] 37 个测试文件 / 188 个测试通过（2026-11-27；运行会话增量写入）
- [x] 37 个测试文件 / 189 个测试通过（2026-11-27；运行视图引用稳定）
- [x] 40 个测试文件 / 213 个测试通过（2026-11-27；运行错误 providerId/httpStatus 投影）
- [x] 42 个测试文件 / 222 个测试通过（2026-11-27；Provider 设置 UI / 节点健康 / AppConfig v2）
- [x] 42 个测试文件 / 224 个测试通过（2026-11-27；Modal 内下拉层级 / 密钥会话回退）
- [x] 42 个测试文件 / 225 个测试通过（2026-11-27；Provider 编辑会话回退）
- [x] 42 个测试文件 / 229 个测试通过（2026-11-27；M9.5 Provider 节点 / 连线 / 健康）
- [x] 42 个测试文件 / 234 个测试通过（2026-11-27；M9.6 能力不匹配 / 真实 DeepSeek 调用）
- [x] 43 个测试文件 / 242 个测试通过（2026-11-27；节点交互约束 / Constant 阅读模式）
- [x] 44 个测试文件 / 246 个测试通过（2026-11-27；图级浮动面板布局）
- [x] 45 个测试文件 / 252 个测试通过（2026-11-27；模型目录按需刷新）
- [x] 46 个测试文件 / 259 个测试通过（2026-11-27；表单控件收口 / JSON 代码主题）
- [x] 46 个测试文件 / 260 个测试通过（2026-11-27；本地模型绑定 / 节点数据端口化）
- [x] 46 个测试文件 / 260 个测试通过（2026-11-28；端口徽标 / 连线端点收口）
- [x] 47 个测试文件 / 272 个测试通过（2026-11-28；节点折叠字段过滤 / 折叠命令）
- [x] 49 个测试文件 / 280 个测试通过（2026-11-28；工作流多选；补跑 shell 测试）
- [x] 49 个测试文件 / 282 个测试通过（2026-11-28；运行态动画语义 / 运行指标）
- [x] 49 个测试文件 / 285 个测试通过（2026-11-28；Filter / Combine / 旧类型迁移；wireclaw 69/69）
- [x] 50 个测试文件 / 289 个测试通过（2026-11-28；Provider 设置页重构 / 新增 Modal）
- [x] 51 个测试文件 / 292 个测试通过（2026-11-28；运行动画修订 / flow-merge）
- [x] 51 个测试文件 / 296 个测试通过（2026-11-28；Replace / 临时草稿存储 / Session 批量；wireclaw 70/70）
- [x] `pnpm typecheck` / `pnpm build` / `pnpm smoke` 通过
- [x] 视觉基线截图与设计文档同步

## 远期

- [ ] 云端 Workspace 与同步
- [ ] 多人协作
- [ ] 插件市场 / 第三方工作台沙箱

## Wireclaw 侧（随宿主需求推进）

- [ ] 补齐未完成的 Agent 模块能力（见 `vendor/wireclaw/todo.md`）
- [ ] 在 FH 中验证并收敛 Graph 运行时 API
- [ ] `RunResult` 聚合（model-call / session entries、序列化、graphPath、partial 策略）
- [ ] 发布节奏：submodule commit 固定 + npm 发布并行
