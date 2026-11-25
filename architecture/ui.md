# UI 架构：React、画布、工作台

## 1. 技术选型

| 组件 | 选择 | 说明 |
| --- | --- | --- |
| UI 框架 | **React 19** | 画布生态最成熟；与 TypeScript 7 的 `tsc` 直接兼容 |
| 构建 | Vite 8 + electron-vite 6 | 与现有桌面壳一致 |
| 画布交互 | **`@xyflow/react` 12** | 只作为 Canvas 视图层的实现细节，对外仍是 FH 自己的类型 |
| 类型检查 | `tsc --noEmit` | 不引入 vue-tsc 一类的额外编译器 |
| 样式 | design tokens（CSS 变量）+ CSS Modules | 不引完整 UI 套件 |
| 交互原语 | **Radix Primitives**（Tooltip / Menu / ContextMenu / Dialog / Tabs） | 无障碍与键盘行为交给原语，视觉由 tokens 控制 |
| 图标 | **Lucide** | 统一 16 / 18px，图标不单独承载含义 |
| 主题 | **深色优先**（默认 dark） | 青绿主色；亮色同等维护 |
| 状态 | React Context + 局部 state | 领域状态在 main；renderer 只做投影，暂不引入状态库 |

> 背景：曾评估 Vue 3 + Vue Flow。实测 `vue-tsc@3.3.14` 与 `typescript@7.0.2` 不兼容（`ERR_PACKAGE_PATH_NOT_EXPORTED: './lib/tsc'`），需把 desktop 钉在 TS 6；而本仓库与 wireclaw 都在 TS 7，React 的纯 `tsc` 链路零额外成本。

`@vitejs/plugin-react@6` 在 Vite 8（rolldown）下的额外 peer（`oxc-transform-react` 等）均为 optional，当前只装插件本体即可。

## 2. renderer 结构

```text
renderer/src/
  main.tsx                 # React 挂载、首帧主题
  App.tsx                  # shell 组合、视图切换、自检上报
  styles/                  # tokens.css（唯一视觉事实源）、global.css
  ui/                      # 组件原语（Button/Menu/Dialog/Tabs/...）
  shell/                   # TitleBar / WorkbenchMenu / Ribbon / navigation / StatusBar / panels
  workbench/               # WorkbenchDefinition / Controller / registry / WorkbenchHost
  workbenches/             # harness-designer / graph-table 工作台实现
  views/                   # Designer / SessionHistory / Diagnostics / Styleguide（HeroView 存在但未接入）
  canvas/core/             # 纯 TS：几何、边 key、类型
  canvas/view/             # React Flow 受控视图、节点/边 renderer
  designer/core/           # GraphDocument adapter / 命令 / validate / problems / run-events
  designer/state/          # 文档加载、SaveCoordinator、运行控制
  inspector/               # 检查器 model（InspectorModel / InspectorNodeModel）
  canvas/metrics.ts        # 几何常量
  run/                     # 运行自检（Phase 2）
  components/              # 共享展示组件（MetaList）
  theme/                   # ThemeProvider
```

Step 3 已落地 `canvas/core` 与 `canvas/view`；`canvas-preview/` 已移除，节点视觉统一到 `canvas/view/NodeVisual`。

规则：

- 跨目录只从公开入口引用：当前 `canvas/*` 不 import `designer/*`，`designer/*` 可以 import `canvas/core` 的类型与 `canvas/view` 的 `CanvasView`；
- `views/*` 不得直接调用 `window.flowharness.run`，运行控制统一经 `useDesignerRun`；
- 业务组件不写死颜色，统一用 token。

## 3. 主题接入

- 默认 **dark**；`<html data-theme="light|dark">`；
- 首帧：`main.tsx` 在 `createRoot` 前读 `localStorage["fh.theme"]`（缺失则 dark）并落 attribute，避免闪白；
- `ThemeProvider` 启动后读取 AppConfig 并覆盖，切换时写回 `config:update`（main 同步 `nativeTheme`）与 localStorage 缓存；
- 画布、连线、小地图、ContextMenu 全部消费同一套 token；节点内容不得自带硬编码色值。

## 4. Canvas

### 4.1 目标与非目标

**目标**：通用、可测、可替换的画布；支持缩放平移、小地图、节点/连线、选择、拖拽、连线、ContextMenu、动画原语、主题。

**非目标**：不理解 Harness；不持有运行状态；不实现具体节点内容。

### 4.2 core / view 分工

| 部分 | 内容 | 依赖 |
| --- | --- | --- |
| `core`（纯 TS） | 屏幕↔世界坐标、矩形包含/相交、稳定边 key、选择去重、领域类型；**不含**命令与动画（命令在 `designer/core`，动画是 CSS） | 无框架依赖，可单测 |
| `view`（React） | 视口容器、节点层、连线层、小地图、ContextMenu；用 react-flow 实现手势与渲染 | React、`@xyflow/react` |

> M1 已实现：`geometry`、`edge-key`、纯 `CanvasNode/CanvasEdge/CanvasDocument` 类型、受控 view、per-port Handle、节点 registry、MiniMap、自定义右键菜单；GraphDocument adapter、语义命令与自动保存位于 `designer/`。

### 4.3 类型

```ts
type Vec2 = { x: number; y: number };
type Size = { width: number; height: number };
type PortRef = { nodeId: string; port: string };

type CanvasNode = {
  id: string;
  kind: string;              // 由工作台定义，如 wireclaw 的 node.type
  position: Vec2;
  size?: Size;
  data: unknown;             // 工作台自解释的数据
  ui?: Record<string, unknown>;
};

type CanvasEdge = {
  id: string;                // 稳定 key：`${from.nodeId}:${from.port}->${to.nodeId}:${to.port}`
  source: PortRef;
  target: PortRef;
  kind?: string;
};

type CanvasDocument = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
};
```

> wireclaw 的 `EdgeDocument` 没有独立 id，只有 `from`/`to` 端口地址。画布边 id 必须由端口地址推导，避免出现第二份会漂移的身份。

### 4.4 与 react-flow 的集成

- **受控模式**：`CanvasDocument` 是当前视图投影；画布把交互转成语义命令（move / connect / disconnect / remove / setViewport），由 Designer 应用到 `GraphDocument`；
- `nodeTypes` 来自 **node renderer registry**（`kind → React.ComponentType`），Canvas 不内置任何业务节点；
- `edgeTypes` 提供至少一个带动画能力的默认边；
- 小地图 / Background 用官方组件；当前没有 `<Controls>`；
- react-flow 的使用被限制在 `canvas/view/`，其他代码不 import 它。
- 当前实现（M6）：`@xyflow/react` 12.12.1 受控模式、`useNodesState` / `useEdgesState`、自定义 `SciFiNode` / `SciFiEdge`、per-port Handle、节点 renderer registry、MiniMap、自定义右键菜单；左键拖拽框选（`selectionOnDrag` + Partial），中键 / 右键拖拽平移；右键拖动后抑制上下文菜单，普通右键单击仍弹出；**没有** `<Controls>`（左下缩放工具栏已移除，适配视图在右键菜单）；
- **选中状态由 React Flow 本地主控**：框选 / 点选只通过 `onSelectionChange` 上报父层，父层绝不把同一选中集合回灌 `nodes`；只有问题定位、粘贴等程序化选中通过带 seq 的 `selectionRequest` 一次性应用，避免选中反馈循环。

### 4.5 动画原语

```ts
interface CanvasAnimationApi {
  pulse(nodeId: string, tone?: "info" | "success" | "error"): void;
  flow(edgeId: string, tone?: "info" | "success" | "error"): void;
  travel(edgeId: string, payload?: { label?: string }): void;
  focus(nodeId: string): void;
  reset(): void;
}
```

> **目标，未实现**：当前没有 `CanvasAnimationApi`。运行态只用 `CanvasView` 的 `nodeStatuses` 换节点状态色，连线活跃/失败是 CSS class。

- 由 CSS class + `requestAnimationFrame` 实现，不引入动画库；
- 事件到动画的映射在**工作台层**完成（见 5.4），Canvas 只提供原语。

### 4.6 性能

- 节点组件 `memo`，只订阅自身数据；
- 拖拽/平移期间不写持久化文档，结束时提交一次命令；
- 大图（>500 节点）后续再评估虚拟化，一期不做。

### 4.7 测试

- core：变换、命中、命令、边 key、布局的单测；
- view：关键交互的组件测试（Testing Library）；
- 集成：Electron smoke 验证画布能挂载并渲染。

## 5. Workbench Framework

### 5.1 三段式概念

```text
Workspace（数据容器）
  └─ WorkbenchInstance（一份画布实例文档）
       └─ GraphDocument × n（可移植工作流）
```

### 5.2 契约

```ts
interface WorkbenchDefinition {
  type: string;
  title: string;
  description: string;
  canOpen(instance: WorkbenchInstanceDocument): boolean;
  View: React.ComponentType<WorkbenchViewProps>;
}

interface WorkbenchController {
  readonly status: RunStatus;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  run(): void;
  pause(): void;
  resume(): void;
  cancel(): void;
  undo(): void;
  redo(): void;
  save(): Promise<void>;
}
```

- 当前 View 自持 hooks（设计器复用现有 document/run/undo），通过 View 收到的 `shell.onControllerChange` 上报 controller；框架级统一工具栏/命令栈注入待后续；
- 已有三个工作台：`harness-designer`（画布）、`graph-table`（节点清单）、`plan-runner`（批量运行），共用实例文档与 `WorkbenchHost`；
- `plan-runner` 以 `WorkbenchPlan` 顺序运行多个独立图；当前在 renderer 侧调用 `run:start`，尚未下沉 RuntimeHost；
- 标题栏 WorkbenchMenu 切换 / 新建 / 重命名 / 删除实例；实例存 `documents/workbenches`。

### 5.3 多图组合：WorkbenchPlan

```ts
type WorkbenchPlan = {
  graphs: { graphId: string; role: string; inputs?: unknown }[];
  bindings: { from: { graphId: string; port: string }; to: { graphId: string; port: string } }[];
  trigger: "manual" | "onOpen";
};
```

规则（按优先级）：

1. 能用 wireclaw 的 subgraph / composite 表达的组合，**一律用 subgraph**，不引入 plan；
2. 只有「多个独立 run + 交叉传值/人工介入」才用 plan；
3. 目标：plan 的编排在 RuntimeHost，工作台只声明；当前 `plan-runner` 是 renderer 侧临时实现，后续下沉。

### 5.4 运行事件 → 动画

默认映射（设计器提供，其他工作台可覆盖）：

| GraphEvent | 画布表现 |
| --- | --- |
| `run:start` | 图整体呼吸高亮 |
| `node:start` | `pulse(nodeId)` |
| `node:stream` | 节点活动态 + 文本流 |
| `node:end` | 节点落定 |
| `node:skipped` | 节点置灰 |
| `node:error` | 节点红色 + 抖动 |
| `custom` | 由工作台自定义（如进度、分支选择） |
| `run:paused` / `run:resumed` | 全局暂停态 |
| `run:end` | 汇总态 + 耗时 |

> M3 已实现节点状态与边 active/error 的映射；`run:start` 的整图呼吸、`node:stream` 的文本流与 `custom` 的领域动画仍由后续工作台细化。

### 5.5 编辑与持久化

- 所有编辑走命令（`addNode` / `removeNode` / `moveNodes` / `connect` / `disconnect` / `updateNodeConfig` / `setViewport`）；
- 撤销栈在 `useDesignerDocument` 内（最多 100 条，config 连续输入 800ms 合并）；Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y；视口变化不进撤销栈；
- 复制 / 粘贴选中节点（含两端都在选区内的边），新 id + 偏移；多选来自画布框选；
- 自动保存：命令合并后 debounce 400ms 写回文档；切换文档 / 关闭窗口前 flush；
- 写冲突：一期单写者，不做合并；`E_CONFLICT` 停止自动保存并提示重载或「另存为副本」。

## 6. Harness Designer

### 6.1 数据来源（不要硬编码节点）

- 文档入口：TitleBar 的文档菜单列出工作区内全部 Harness 文档，支持新建 / 重命名 / 复制 / 删除 / 最近打开 / 导入导出（`shell/DocumentMenu.tsx`）；
- 当前：`createEditorCatalog(registry, { presets: designerPresetLibrary })` → `{ version: 2, nodeTypes, presets }`（`designer/core/catalog.ts`）；
- `NodeCatalogEntry` 提供 `type / title / description / builtIn / category / keywords / inputs / outputs / requirements / configSchema / defaultConfig / error`；
- **动态端口**：wireclaw 的 `describeNodeType(registry, type, { config })` 支持按 config 试创建并取端口，adapter 每次投影也按节点 config 调用；但 16 个内建节点的端口目前都是**静态**的（`get inputs/outputs` 不读 config），该能力尚未被任何节点使用；
- 预设通过 `NodePresetLibrary` 实例化：FH 内置 3 条（文本常量 / 聊天模型调用 / 只读 Agent），节点库面板可直接插入；
- 节点库是画布内浮层（`views/NodeLibraryPanel.tsx`），顺序为「最近使用（≤6 条，localStorage）→ 预设 → 分类」，支持标题/类型/关键词搜索；不是 PanelLayer 面板。

### 6.2 Adapter 与命令

```text
GraphDocument → CanvasDocument
  node: { id, type, typeVersion, config, ui } → { id, kind: type, position: ui.x/y, data }
  edge: { from, to }                          → { id: from:port->to:port, source, target }
  graph.ui.viewport                            → viewport

CanvasCommand → GraphDocument
  moveNodes / removeNodes / connect / disconnect / setViewport
  addNode / updateNodeConfig（设计器动作）
```

- adapter 是单向投影；编辑通过命令只改已知字段，未知字段原样保留，避免整图反向覆盖丢失 `typeVersion / requires / inputs / metadata`；
- 布局写回 `GraphDocument.ui`（节点 `ui.x/y`、图级 `ui.viewport`）；
- 工作台实例的 `layout.overrides` 仅覆盖「同一 graph 在实例中的不同摆放」，不写回 graph。

### 6.3 编辑与校验

- 拖拽/连线生成/修改 `GraphDocument`；
- 投影时用 `findInvalidEdges` 检查节点/端口是否存在（端口随 config 投影）；存在失效连线时画布顶部提示，能渲染的边标记为 error；
- 运行前用 `Graph.validate()`（renderer 的 wireclaw 浏览器构建）；内嵌 Subgraph / Loop / ForEach 递归校验，问题回填容器节点与 `graphPath`；
- 设计器内 Alert 横幅展示首要问题；运行日志面板的「问题」页签汇总校验、失效连线与运行错误，点击可选中并聚焦节点（M3）；
- 有 issue 时禁止运行；当前**没有**「仍然运行」的确认路径；M6.2 起 DesignerView 在打开工作区 / 窗口聚焦时从 `providers:list` 构造 `RequirementCatalog` 并注入校验（模型目录需先在设置页「测试连接」）。

### 6.4 运行与导入导出

- 运行时把 `GraphDocument` 交给 RuntimeHost（main 反序列化并执行）；
- 导入/导出就是 `GraphDocument` JSON：文档菜单支持新建文档导入、导出时可选剥离 `ui`（M4 已实现）；
- `.fhws` 整工作区导入导出仍只有 main 通道；导出总是包含 `documents/**`（含 `ui`）。

### 6.5 NodeContent

- 一期（M2 已完成）：`inspector/NodeConfigForm.tsx` 根据 `configSchema` 生成通用表单（wireclaw 的 JSON Schema 子集：object / string / number / integer / boolean / array / enum / required / minimum / maximum…）；无法表达的字段用 JSON 文本域兜底，整份 config 仍可在「JSON」页签编辑；
- 二期（M5 已完成）：节点 Body 内联编辑 Constant / Model Call / Log / Value / Agent / Loop / ForEach；节点 Body 显示输入端口槽，连线可直接拖到槽上（同时保留左侧 Handle）；复杂字段仍走检查器表单 / JSON；
- 节点内容组件通过 `canvas/view/node-registry.ts` 的 registry 注册，Canvas 不感知；当前所有类型都回落到 `SciFiNode`。

### 6.6 Provider 设置与运行交互

- Ribbon 设置菜单打开 `shell/ProviderSettingsDialog.tsx`：启用/禁用 Provider，编辑显示名、Base URL、默认模型；云 Provider 可写入 / 清除 API Key；
- 密钥通过 `secrets:set / delete` 进入 main，renderer 只能看到 `hasKey`；`providers:list` 返回可用状态，`providers:test` 拉取模型目录；
- run 期间：审批走 `shell/InteractionDialogs.tsx` 的 ApprovalDialog，用户输入走 UserInputDialog；main 发 `approval` / `input` topic，renderer 回 `approval:respond` / `input:respond`；
- Diagnostics 提供「运行恢复」面板：列出 paused / interrupted run，使用 `run:resume-interrupted` 从 checkpoint + graph 快照恢复；
- 工作台左栏由 `WorkbenchDefinition.navigation` 提供：`harness-designer` 设计模式显示 GraphDocument 列表（`shell/navigation/DocumentNavigation`），`plan-runner` 显示 Plan 步骤；
- 会话导航与历史面板在 M7.3 迁移；当前 `SessionSidebar` / `SessionHistoryView` 文件保留但未挂载，M6.3 的 `SessionSerializer` 回放逻辑待迁入面板。

## 7. 其他工作台

- 必须实现 `WorkbenchDefinition`；
- 运行底层是 Harness Graph，但动画/交互按目标定制；
- 需要多图时使用 `WorkbenchPlan`，不得自行管理多个 RuntimeHost 连接；
- 与设计器共享 Canvas、主题、运行控制，不复制。

## 8. 无障碍与键盘

- 画布支持键盘：空格拖拽、方向键移动选中、Delete 删除、Esc 取消连线；
- 视图快捷键：Ctrl+1 设计器 / Ctrl+2 诊断 / Ctrl+3 样式指南 / Ctrl+4 会话历史；
- 工具栏与面板使用可聚焦的原生控件；
- 颜色不作为唯一状态表达（错误同时有图标/文本）。

## 9. 设计基础（Phase 2.5 已实现）

视觉契约与评审细则见 [`design/`](../design/README.md) 与 Styleguide 视图。

| 项 | 实现 |
| --- | --- |
| tokens | `styles/tokens.css`：表面 / 文本 / 边框 / 主色（去饱和青绿）/ 状态 / 画布 / 阴影 / 圆角 / 间距 / 字体 / 动效 / 尺寸 / 层级；深色默认、亮色覆盖 |
| 密度 | 非画布文字 125% 基准（16.25px 正文）、控件 32px（sm 28）、节点 220px、4px 间距基线；图标同步放大 |
| 外壳 | TitleBar 40（不透明，无底边框）/ Ribbon 52 / 工作台导航 Panel 200–360（默认 260，可收起/拖宽；token 兜底 280）/ StatusBar 26（全宽不透明 Chrome 层，仅底部圆角）；导航与 Canvas 面板化（各 1px 外框 + 6px 圆角，间隙 4px），中间 Body 统一 95% 半透；固定 Inspector/BottomPanel 已移除，改由内部浮动 Panel 承担 |
| 会话入口 | 设计器左栏 = GraphDocument 列表（`DocumentNavigation`）；Session 树与历史面板在 M7.3 迁移，当前不挂载 |
| 原语 | Button、IconButton、Badge、StatusDot、Kbd、Input、Field、Select、Checkbox、NumberField、Panel、EmptyState、Alert、Tooltip、Menu、ContextMenu、Dialog、Tabs |
| 画布视觉 | 商务扁平节点：6px 圆角、纯色不透明底、HeaderBar 30 + Body 两层、无 Footer；描边通过 `--fh-canvas-zoom` 反向缩放，屏幕恒为 1px；选中仅换 accent 边框；网格线 24px/低亮度，拖拽吸附同为 24px；边 1.4px 贝塞尔，活跃边用主色流动虚线、失败 danger 虚线；缩放工具栏已移除；节点宽、Header、端口、边宽、网格、小地图与缩放范围全部来自 `canvas/metrics.ts`，并通过 CSS 变量下发 |
| 评审 | 「样式指南」视图覆盖 tokens、组件状态、节点与连线样张（跟随全局主题，页面内无主题切换） |

smoke 模式默认打开诊断视图，保证自检 run 仍会被触发；普通启动默认进入设计器视图。

## 9.1 内部浮动 Panel（Phase 2.6 step 2）

| 项 | 实现 |
| --- | --- |
| `PanelFrame` | Header / Body / 可选 Footer；Header 拖拽，右侧折叠与关闭 |
| `FloatingPanel` | 拖动、右/下/右下缩放、z-index 聚焦、折叠、关闭；位置钳制在画布容器 |
| `PanelLayer` | 铺在 Main 之上；属性面板默认右上 280×432、运行日志左下 448×224（`PANEL_DEFAULTS`，最小宽度 280） |
| 状态 | `useFloatingPanels` 管理 open / collapsed / x / y / size / z；首版不做 docking |
| 材质 | 面板默认 78% 不透明（`--fh-panel-alpha`），底色 `--fh-panel-bg` / 头部 `--fh-panel-header-bg`，比节点更深；后续设置 UI 只调整 alpha；不使用 backdrop-filter |
| 接入 | 属性检查（节点信息 + configSchema 表单，JSON 页签兜底）、运行日志（`RunLogContent`，含问题 Tab：校验 / 失效连线 / 运行错误，点击定位节点；Footer runId） |
| 开关 | TitleBar 图标、命令中心、`Ctrl J`；条件为**当前视图是设计器且已打开工作区**（与会话选择无关） |
| 窗口状态 | `WindowStateStore` 写入 `userData/window-state.json`；校验显示器可见性、尺寸/位置钳制、400ms 防抖 + close 保存 |

Panel 的位置目前只在内存中（刷新/重启恢复默认布局）；布局持久化留到 Workbench UI state。

## 9.2 窗口材质与透明（Step 4）

| 项 | 实现 |
| --- | --- |
| 默认窗口 | `transparent: true` + `frame: false`；TitleBar/StatusBar 不透明，中间 Body 统一 95% 半透；深色基底为中性石墨黑；内容区 12px 圆角 |
| 透明 fallback | `FLOWHARNESS_WINDOW_MODE=frameless` 回到不透明无边框窗口 |
| 桌面 blur | **不可用**：CSS `backdrop-filter` 在透明窗口中不采样桌面；当前 Electron 45 + Win11 26H2 的 Acrylic/Mica 仍不透明（ADR-009） |
| 面板玻璃 | PanelFrame 默认 78% 表面 alpha（`--fh-panel-alpha`）；不使用 `backdrop-filter`（透明窗口中会压成黑块） |
| 节点 | 任何窗口模式下都使用不透明 `--fh-node-bg`，不随窗口材质变透明 |
| 截图 | `capture:ui` 默认以 opaque frameless 抓 renderer；真透明截图需要 GPU + 屏幕抓取 |
| 窗口状态 | bounds 持久化见 `WindowStateStore`；透明窗口没有原生阴影，使用 1px inset 边框 |

## 10. 测试策略

| 层级 | 方式 | 现状 |
| --- | --- | --- |
| canvas core | Vitest 纯函数单测 | ✅ `geometry.test.ts` |
| canvas view | Testing Library 交互测试 | ⬜ 未接入（无 jsdom / @testing-library） |
| designer adapter | 序列化往返测试（GraphDocument → Canvas → GraphDocument 幂等） | 🚧 有 adapter / commands / layout 单测，无往返幂等测试 |
| 运行链路 | main 侧集成测试（fake provider + 最小图） | ✅ `runtime-host.test.ts`（无 Provider） |
| 端到端 | Electron smoke（现有 `pnpm smoke` 扩展） | ✅ |

## 11. M7 目标：工作台导航与运行面板（M7.1 已落地导航宿主）

- **M7.1 已实现**：`NavigationPanel` / `DocumentNavigation` / `PlanNavigation`；`WorkbenchDefinition.navigation`（design）；`WorkbenchHost.panelLayer`；App 按工作台渲染左栏；移除全局 SessionSidebar、顶层 `sessions` 视图与 `Ctrl+4`；文档选择同步 primaryGraph；删除 graph 前检查引用；`--fh-panel-alpha` 0.78。
- **左栏 = Panel 宿主**：Shell 只提供容器与尺寸；PanelContent 由 `activeWorkbench.type` + `mode` 提供，不再硬编码全局 SessionSidebar。
- **设计模式**：`harness-designer` 左栏 = GraphDocument 列表（新建 / 最近 / 重命名 / 复制 / 删除 / 导入导出），选中同步 `WorkbenchInstance.graphs` 的 primaryGraph。
- **运行模式**：同一实例切到 `run`，左栏 = Session 树（递归文件夹 + 草稿目录）；画布进入带动画的运行页。
- **工作台定义**：`WorkbenchDefinition` 增加 `navigation`（design / run）与 `RunView`；`WorkbenchHost` 渲染导航与对应 View。工作台运行页是“固定工作流 + 动画”的载体，不再有独立全局运行页面。
- **面板**：
  - 运行结果面板：输出 / 事件 / 问题，渲染 `node:end` / `run:end` outputs、`node:stream`、附件；
  - 会话历史面板：由 `SessionHistoryView` 迁移而来，按 `kind` 渲染 conversation / run；
  - 现有属性检查、运行日志保留。
- **移除**：顶层 `sessions` 视图与 `Ctrl+4`；`SessionSidebar` 不再作为全局左栏。
- **材质**：浮动面板 `--fh-panel-alpha` 0.78；TitleBar / StatusBar 等固定 chrome 不变。
- **数据**：Session 树、`SessionRecord.kind`、RunResult 契约见 [data-model.md](./data-model.md) §12。
