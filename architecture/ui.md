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
  workbenches/             # harness-designer / plan-runner 工作台实现
  presets/                 # 节点库：Provider / 插入菜单 / 管理 Modal / 从节点创建
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

> **目标，未实现**：当前没有 `CanvasAnimationApi`。运行态只用 `CanvasView` 的 `nodeStatuses` 换节点状态色、CSS 流动虚线表示活跃边；`harness-designer` 的运行阶段可用 `focusNode` 让视口跟随 running 节点（ADR-023；独立运行页已移除）。

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
- 已有两个工作台：`harness-designer`（画布）、`plan-runner`（批量运行）；原 `graph-table`「节点清单」已删除（ADR-026），独立 `flow-runner` 运行页已删除（ADR-027）；
- `plan-runner` 以 `WorkbenchPlan` 顺序运行多个独立图；当前在 renderer 侧调用 `run:start`，尚未下沉 RuntimeHost；
- 标题栏 WorkbenchMenu 切换 / 新建 / 重命名 / 删除实例；实例存 `documents/workbenches`；M8.1 起“从模板新建”提供 3 条模板（Harness 空白 / 当前、批量运行），模板可创建起始工作流。

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
- **动态端口**：wireclaw 的 `describeNodeType(registry, type, { config })` 支持按 config 试创建并取端口，adapter 每次投影也按节点 config 调用；但 17 个内建节点的端口目前都是**静态**的（`get inputs/outputs` 不读 config），该能力尚未被任何节点使用；
- 用户节点库（M8.4）：工作区 `documents/presets/library.json`；插入菜单是画布内浮层（`presets/NodeLibraryPalette.tsx`），顺序为「最近使用（≤6 条，localStorage）→ 用户库（按文件夹）→ 内置预设 → 节点类型」，支持搜索、↑↓ + Enter、拖拽到画布；管理模式是独立 Modal（`PresetManagerDialog`，左文件夹树 / 右属性与参数表单），从标题栏「视图 → 管理节点库…」或插入菜单进入；
- 画布节点右键「创建预设节点」捕获 `type / typeVersion / config`，命名后写入工作区库并打开管理 Modal；内置 4 条预设仍来自 `designer/core/presets.ts`。

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
- 运行前用 `Graph.validate()`（renderer 的 wireclaw 浏览器构建）；内嵌 Subgraph / Loop / ForEach 递归校验，问题回填容器节点与 `graphPath`；Provider 问题由 `provider-problems.ts` 单独汇总（M9.4）；
- 设计器内 Alert 横幅展示首要问题；运行日志面板把校验、失效连线与运行错误作为可点击行并入同一条日志（2026-11-27 起不再有独立「问题」页签），点击可选中并聚焦节点（M3）；
- 有 issue 时禁止运行；当前**没有**「仍然运行」的确认路径；M9.4 起 DesignerView 从 Provider 库视图构造 `RequirementCatalog` 并注入校验（模型目录在设置页「刷新模型」后持久化）。

### 6.4 运行与导入导出

- 运行时把 `GraphDocument` 交给 RuntimeHost（main 反序列化并执行）；
- 导入/导出就是 `GraphDocument` JSON：文档菜单支持新建文档导入、导出时可选剥离 `ui`（M4 已实现）；
- `.fhws` 整工作区导入导出仍只有 main 通道；导出总是包含 `documents/**`（含 `ui`）。

### 6.5 NodeContent

- 一期（M2 已完成）：`inspector/NodeConfigForm.tsx` 根据 `configSchema` 生成通用表单（wireclaw 的 JSON Schema 子集：object / string / number / integer / boolean / array / enum / required / minimum / maximum…）；无法表达的字段用 JSON 文本域兜底，整份 config 仍可在「JSON」页签编辑；
- 二期（M5）：节点 Body 开始支持常用参数内联编辑；2026-11-27 起端口改为贴边的方块 / 圆点徽标，与数据行顶部对齐，连线也可落在字段行上（ADR-041）；
- 全量内联属性（2026-11-27）：节点 Body 覆盖所有内建节点的可编辑 config 字段——Constant 文本、Provider / Model 的 Provider / Model 下拉、Model Call 的 mode / system / think / thinkingLv / temperature / modality / parameters、Agent 的权限 / 步数 / system / think / thinkingLv / temperature / hostTools、ToolSet 的 include / exclude / hostTools、Value、Loop 的迭代 / 失败重试 / graph、ForEach 的 resultPort / graph、Subgraph 的 graph、Event Trigger 的 event、Log 的级别；对象 / 内嵌图使用紧凑 JSON TextArea（失焦解析、失败就地提示），节点高度随字段增长；
- 表单控件统一（2026-11-27）：节点 Body 的枚举字段全部改用 FH `ui/Select`（Radix 菜单），保留 22px 紧凑高度与默认边框；布尔字段统一 `ui/Checkbox`（自绘方框，`compact` 变体）；输入框、下拉与 JSON 区都不显示聚焦描边，焦点只由光标表达（ADR-037）；
- 端口徽标与数据行（2026-11-27）：节点 Body 顶部先列输出数据、再列未挂字段的输入；端口徽标与节点主体保持 5px 间距，纵向与数据行上边缘对齐（按布局坐标测量，拖动 / 缩放不跳变）；未连接为灰色 20px 方块 + 居中类型图标，已连接为 20px 橙红空圆环 + 6px 实心点；连线终点落在实心点中心，且连线不再绘制端点小圆（Handle 与视觉徽标解耦）；颜色不随节点选中 / 运行状态变化；底部端口列表移除（ADR-041）；
- 数据来源统一（2026-11-27）：Model Call / Agent Run 的每个数据字段都同时有输入端口与本地编辑——`core.model.call` 端口为 model / prompt / system / parameters / attachments，`core.agent.run` 为 model / input / system / hostTools / attachments / toolset；未连接时读 config（含 providerId / modelId），连接后对应字段变为只读锁定行；字段顺序为可接入端口的数据优先于只能本地编辑的参数，同组内按必要数据 → 必要参数 → 常用标量 → 低频枚举 → 结构数据（ADR-040 / ADR-041）；
- 上游锁定字段（2026-11-27）：被连接固定的字段（当前为 Model 的 Provider）不再渲染禁用下拉，而是只读行——锁图标 + 来源值 + 「上游」，hover 提示修改位置；来源值由工作台以 `CanvasLockedField { value, reason }` 投影注入，Canvas 只透传（ADR-037）；
- JSON 字段（2026-11-27）：节点内联与检查器使用 `ui/CodeArea`（透明 textarea + JSON 高亮层，滚动同步），键 / 字符串 / 数字 / 字面量分别着色，颜色走 `--fh-code-*`；节点内联为 10px 紧凑变体；Constant 阅读态的 JSON 截断预览同样用 `ui/JsonCodeText` 着色，与编辑态一致（ADR-038）；
- Constant（2026-11-27）：非编辑态渲染为 p 标签，正文按 200 字符裁剪并最多显示 3 行；hover 用半透面板 Tooltip 展示最多 400 字符。标题栏铅笔按钮进入编辑模式，正文切换为随内容自增高的 TextArea（上限 180px），再次点击退出；编辑态可切换 text / json 类型，json 使用紧凑 JSON TextArea；两种模式都关闭拼写检查；
- Filter / Combine（2026-11-28，ADR-045）：Filter 无 config，只渲染端口行；Combine 在 Body 内提供「分隔符」输入（默认空串），输出端口是单个 `text`；旧 `core.merge` 不在节点库出现，旧图加载时递归迁移为 `core.filter`；
- Provider（2026-11-27）：Provider 节点 Body 直接提供 Provider 下拉，不再只显示摘要；
- 节点内容组件通过 `canvas/view/node-registry.ts` 的 registry 注册，Canvas 不感知；当前所有类型都回落到 `SciFiNode`。

### 6.6 Provider 设置与运行交互

- Ribbon 设置菜单打开 `providers/ProviderLibraryDialog.tsx`：**API 密钥** / **Provider** 两个页签；每个页签都是「左侧列表 + 右侧属性栏」的 master-detail 布局，新增表单不再占用列表区域；
- API 密钥：列表显示名称、协议与状态；右侧属性栏展示掩码指纹、Base URL、验证 / 创建 / 更新时间与最近错误，支持重新验证 / 替换 / 删除；列表头部「新增」打开独立 Modal（协议 / 名称 / API Key / Base URL），按协议调用 main 验证（401/403 → 失效、402/429 → 额度、网络 → 未验证），明文永不回显；
- Provider：列表显示名称、适配器与健康状态；右侧属性栏直接编辑名称 / 适配器 / 密钥 / Base URL / 默认模型 / 启用，保存按钮仅在字段变化时可用，并保留刷新模型目录与删除；新建使用同一套字段的独立 Modal；删除密钥前检查 profile 引用；
- 新增组件：`CreateKeyDialog` / `CreateProviderDialog` / `KeyDetailPanel` / `ProviderDetailPanel` / `ProviderFormFields`；`providers/drafts.ts` 负责表单草稿与 dirty 判断；两个新增 Modal 与设置页一样走 `ui/Dialog`，错误就地展示；
- 受限环境写入失败时，设置页顶部显示“无法写入磁盘，当前修改只在本次会话生效”，操作本身仍在内存成功；
- renderer `ProviderLibraryProvider` 通过 `provider:library` 读取只读视图，并监听 main 的 `provider` topic；
- `core.model` 检查器的 `providerId` / `modelId` 变为 Provider / 模型下拉；节点标题右侧显示 Provider 健康三角（红色 / 黄色，带 tooltip）；
- 节点库新增 `Provider`（`core.provider`）：检查器用同一个 Provider 下拉；输出 `provider` 端口可拖到 Model 的 `provider` 输入，连接后以来源为准、config.providerId 只作回退；
- Provider 连接是只读约束（2026-11-27）：Model 的 `provider` 输入存在来源 Provider 时，检查器 Provider 字段显示来源并禁用（JSON 写入也会保留原 providerId）；节点内 Provider 输入槽显示来源 Profile 名称，Body 中的 Provider 字段渲染为只读锁定行（锁图标 + 来源 Profile + 上游），不再提供下拉入口；连接或切换 Provider 后，目录中不存在的 `modelId` 会被清空并弹出「模型已清空」提示；
- Provider 节点的内联下拉使用 `ui/Select`（FH 菜单，保留默认边框并去掉 focus outline）；Model ID 下拉始终带一条「未选择模型」项（工作台注入、节点内联去重），可清除当前模型；Provider 目录为空且未检测过时，设计器后台刷新并持久化模型目录，检查器在刷新中 / 失败时给出提示；
- Provider 节点自身显示健康问题；连接后的 Model 摘要显示“来源 Profile · modelId”；右键「添加节点」按画布坐标落点，不会在平移 / 缩放后插到视口外；
- provider 问题合并进运行日志：缺 profile / 模型不在目录 / 能力不匹配为 error 并阻断运行；key 失效 / 未验证为 warning，允许尝试运行；「未选择模型」只保留节点标题的红色叹号（hover 提示原因），不弹横幅、不进问题列表、不阻断运行（ADR-039）；
- Model Call 的 chat / generate / modality 与目录 capabilities 不匹配为 error；旧目录没有 capabilities 时不误报；
- run 期间：审批走 `shell/InteractionDialogs.tsx` 的 ApprovalDialog，用户输入走 UserInputDialog；main 发 `approval` / `input` topic，renderer 回 `approval:respond` / `input:respond`；
- Diagnostics 提供「运行恢复」面板：列出 paused / interrupted run，使用 `run:resume-interrupted` 从 checkpoint + graph 快照恢复；
- 工作台左栏由 `WorkbenchDefinition.navigation` 提供；`harness-designer` 声明 `splitNavigation: { top: "design", bottom: "run" }`，左栏为上下两区：上半区工作流列表（`DocumentNavigation`），下半区 Session 树（`SessionNavigation`），共用 `SplitSidebar` 宿主，横向分隔条可拖动比例；`plan-runner` 仍为单一 Plan 步骤列表；
- Session 树按文件树缩进：文件夹按层级缩进，会话（文件）行比同层文件夹行多缩进一个展开箭头位，会话图标与文件夹图标对齐；
- 会话历史已迁入 Canvas 浮动面板（`PanelLayer` 的 `session-history`），点击 Session 树节点即打开；M6.3 的 `SessionSerializer` 回放逻辑复用；M7.4 起 run 会话用 `RunResultView` 展示输出与条目；
- 点击运行会在草稿目录自动创建一条 conversation 会话，自动打开「会话历史」面板；运行中 ModelCall / Agent entries 逐步追加为消息，结束时追加输出摘要；运行日志不再有「结果」页签，也没有手动保存按钮；
- 对外 UI 统一称 **工作流（workflow）**；`GraphDocument` 仅保留为 wireclaw / 契约内部类型名。
- 文件菜单提供 `.fhws` 导入 / 导出：导入经系统打开对话框并创建新工作区副本，导出经系统保存对话框写档；不覆盖现有工作区。

### 6.7 节点折叠与工作流多选（2026-11-28）

- 节点折叠（ADR-042）：Header 右侧提供折叠按钮，状态写入 `node.ui.collapsed`（随文档自动保存、进入撤销栈、随「导出无布局」剥离）；折叠后只保留**已连接的端口**与**有数据且不等于节点默认值**的 config 字段——默认值来自 `configSchema.default` 与节点类型 `defaultConfig`（`designer/core/collapse.ts`）；未连接端口徽标、空字段、kind 标签同时隐藏，展开恢复；运行期只读时不提供折叠入口；
- 折叠字段计算在 adapter 投影时完成（`collapsedFields`），Canvas 组件只按字段名过滤，不感知节点语义；Constant 以文本 / JSON 是否有内容判断；
- 工作流多选（ADR-043）：`DocumentNavigation` 本地维护额外选中集合，打开中的工作流始终属于选择；Ctrl / Cmd 切换、Shift 从「最近点击 / 打开」的锚点连选（普通点击后锚点即打开项）；选中行与打开中的工作流共用同一高亮（不引入勾选 / 强调边框等第二视觉）；批量操作条提供全选 / 复制 / 删除；右键多选项切到批量菜单；
- 批量复制 / 删除在 `App` 层实现（`handleDuplicateDocuments` / `handleDeleteDocuments`，单选入口复用同一实现），逐条调用既有 IPC：删除仍会 flush 当前文档、等待工作台保存链、刷新工作台引用并回退到剩余文档；批量复制仅在单选时切换到副本。

### 6.8 运行态动画（2026-11-28，ADR-044）

- 边只在**数据输出**时动画：`node:stream` 点亮出边，`node:end` 立即熄灭；`node:start` 不再点亮入边（上游数据已送达），值输出瞬时交付不产生动画；`run:end` 清空 active，`node:error` 保留失败边。
- 边动画是沿连线移动的白色段：`pathLength=100`，白色段占 24%，`stroke-dashoffset` 24→-76，900ms 线性循环；方向固定为**输出端口 → 输入端口**，循环时白段在终点消失、从起点外进入；不读取 token 计数，也不随 `node:stream` 事件重启；`prefers-reduced-motion` 下退化为整条静态白线。
- 运行节点使用橙红描边 + 2px 斜纹警戒环：单一元素用 padding-box 遮罩保留 2px 边框，斜纹 `background` 铺满整个矩形并平移，四角共用连续纹理，不再有四条边框拼接的接缝；保留节点脉冲辉光。
- 画布投影更新时必须在 `mergeFlowNodes` 中保留 React Flow 写回节点的 `measured` / `internals` / `handleBounds`，且只在边 id / status 变化时重建边（`edgeSignature`）；否则每次指标刷新都会让边短暂失去端点、EdgeWrapper 卸载重建，动画从 0 重启。该逻辑在 `canvas/view/flow-merge.ts`。
- 完成节点播放 1.5s 冷却：边框从橙红渐变回默认色；`failed` 保留 danger 色不冷却。
- 运行节点下方挂无边框暗淡 benchmark：标题栏 `tok N` + 毫秒计时（100ms 刷新），下方最多 80px 的尾部输出；`node:stream` 的 `HarnessValue.text` 进入指标，运行结束清空。
- 指标在 `designer/core/run-events.ts` 的 `nodeMetrics` 中投影，adapter 注入 `CanvasNodeData.runMetrics`；Canvas 组件不解释节点语义。HUD 指标以 150ms 节流写入画布，节点 / 边状态仍逐批即时更新。

## 7. 其他工作台

- 必须实现 `WorkbenchDefinition`；
- 运行底层是 Harness Graph，但动画/交互按目标定制；
- 需要多图时使用 `WorkbenchPlan`，不得自行管理多个 RuntimeHost 连接；
- 与设计器共享 Canvas、主题、运行控制，不复制。

## 8. 无障碍与键盘

- 画布支持键盘：空格拖拽、方向键移动选中、Delete 删除、Esc 取消连线；
- 视图快捷键：Ctrl+1 设计器 / Ctrl+2 诊断 / Ctrl+3 样式指南；会话历史从运行模式的 Session 树打开；
- 工具栏与面板使用可聚焦的原生控件；
- 颜色不作为唯一状态表达（错误同时有图标/文本）。

## 9. 设计基础（Phase 2.5 已实现）

视觉契约与评审细则见 [`design/`](../design/README.md) 与 Styleguide 视图。

| 项 | 实现 |
| --- | --- |
| tokens | `styles/tokens.css`：表面 / 文本 / 边框 / 主色（去饱和青绿）/ 状态 / 画布 / 阴影 / 圆角 / 间距 / 字体 / 动效 / 尺寸 / 层级；深色默认、亮色覆盖 |
| 密度 | 非画布文字 125% 基准（16.25px 正文）、控件 32px（sm 28）、节点 220px、4px 间距基线；图标同步放大 |
| 外壳 | TitleBar 40（不透明，无底边框）/ Ribbon 46 / 工作台导航 Panel 200–360（默认 260，可收起/拖宽；token 兜底 280）/ StatusBar 26（全宽不透明 Chrome 层，仅底部圆角）；导航与 Canvas 面板化（各 1px 外框 + 6px 圆角，间隙 4px），中间 Body 统一 95% 半透；固定 Inspector/BottomPanel 已移除，改由内部浮动 Panel 承担 |
| 会话入口 | 设计器左栏为上下双区：上半区工作流列表（`DocumentNavigation`，支持右键菜单），下半区 Session 树（`SessionNavigation`，草稿目录 / 右键菜单）；会话历史是 Canvas 浮动 Panel |
| 原语 | Button、IconButton、Badge、StatusDot、Kbd、Input、Field、Select、Checkbox、CodeArea、NumberField、Panel、EmptyState、Alert、Tooltip、Menu、ContextMenu、Dialog、Tabs |
| 画布视觉 | 商务扁平节点：6px 圆角、纯色不透明底、HeaderBar 30 + Body 两层、无 Footer；描边通过 `--fh-canvas-zoom` 反向缩放，屏幕恒为 1px；选中仅换 accent 边框；网格线 24px/低亮度，拖拽吸附同为 24px；边 1.4px 贝塞尔，活跃边用主色流动虚线、失败 danger 虚线；缩放工具栏已移除；节点宽、Header、端口、边宽、网格、小地图与缩放范围全部来自 `canvas/metrics.ts`，并通过 CSS 变量下发 |
| 评审 | 「样式指南」视图覆盖 tokens、组件状态、节点与连线样张（跟随全局主题，页面内无主题切换） |

smoke 模式默认打开诊断视图，保证自检 run 仍会被触发；普通启动默认进入设计器视图。

## 9.1 内部浮动 Panel（Phase 2.6 step 2）

| 项 | 实现 |
| --- | --- |
| `PanelFrame` | Header / Body / 可选 Footer；Header 拖拽，右侧折叠与关闭 |
| `FloatingPanel` | 拖动、右/下/右下缩放、z-index 聚焦、折叠、关闭；位置钳制在画布容器 |
| `PanelLayer` | 铺在 Main 之上；属性面板默认右上 280×432、运行日志左下 448×224（`PANEL_DEFAULTS`，最小宽度 280） |
| 状态 | `useFloatingPanels` 管理 open / collapsed / x / y / size / z；布局按图写入 `GraphDocument.ui.panels`，打开文档时恢复；首版不做 docking |
| 材质 | 面板默认 78% 不透明（`--fh-panel-alpha`），底色 `--fh-panel-bg` / 头部 `--fh-panel-header-bg`，比节点更深；后续设置 UI 只调整 alpha；不使用 backdrop-filter |
| 接入 | 属性检查（节点信息 + configSchema 表单，JSON 页签兜底）、运行日志（`RunLogContent`，问题与事件合并为一条列表，校验 / 失效连线 / 运行错误可点击定位；Footer runId） |
| 开关 | TitleBar 图标、命令中心、`Ctrl J`；条件为**当前视图是设计器且已打开工作区**（与会话选择无关） |
| 窗口状态 | `WindowStateStore` 写入 `userData/window-state.json`；校验显示器可见性、尺寸/位置钳制、400ms 防抖 + close 保存 |

Panel 布局按 Graph 持久化：`GraphDocument.ui.panels` 保存每个面板的 open / collapsed / x / y / width / height / z；打开文档时恢复，拖动 / 缩放 / 折叠停稳 400ms 后写回，不进入撤销栈；没有保存布局的图使用默认布局。

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
| 标题栏手势 | Windows 透明无边框窗口会被 Electron 吞掉 `SC_MAXIMIZE`，main 用 `hookWindowMessage(WM_SYSCOMMAND)` 恢复双击最大化 / 还原；`SC_MOVE` 时先还原并让标题栏回到光标下方；最大化状态在 maximize / unmaximize / resize / focus 后广播，renderer 另在 focus / resize / visibilitychange 兜底查询 |

## 10. 测试策略

| 层级 | 方式 | 现状 |
| --- | --- | --- |
| canvas core | Vitest 纯函数单测 | ✅ `geometry.test.ts` |
| canvas view | Testing Library 交互测试 | ⬜ 未接入（无 jsdom / @testing-library） |
| designer adapter | 序列化往返测试（GraphDocument → Canvas → GraphDocument 幂等） | 🚧 有 adapter / commands / layout 单测，无往返幂等测试 |
| 运行链路 | main 侧集成测试（fake provider + 最小图） | ✅ `runtime-host.test.ts`（无 Provider） |
| 端到端 | Electron smoke（现有 `pnpm smoke` 扩展） | ✅ |

## 11. M7 工作台导航与运行面板（已完成）

- **M7.1 已实现**：`NavigationPanel` / `DocumentNavigation` / `PlanNavigation`；`WorkbenchDefinition.navigation`（design）；`WorkbenchHost.panelLayer`；App 按工作台渲染左栏；移除全局 SessionSidebar、顶层 `sessions` 视图与 `Ctrl+4`；文档选择同步 primaryGraph；删除 graph 时解除引用（ADR-025）；`--fh-panel-alpha` 0.78。
- **M7.2 已实现存储**：Session 递归文件夹、`SessionRecord` v2、草稿目录、IPC。
- **M7.3 已实现导航/面板**：`SessionNavigation` 递归树（搜索、文件夹/会话 CRUD、移动、草稿标识、右键菜单）；`SessionHistoryView` 嵌入 `session-history` 浮动面板；设计/运行模式切换；工作流列表右键菜单与“工作流”对外文案。
- **M7.4 已实现运行结果**：运行日志新增「结果」页签，渲染 `RunResult` 输出、模型调用 / Agent 会话条目与附件；运行结束自动拉取 `run:result`；「保存到会话」写入草稿目录并打开历史面板；`SessionHistoryView` 按 `kind` 回放 conversation / run；Session 树文件夹右键可设草稿目录。（结果页签与手动保存入口已由 M8.6 / ADR-028 移除。）
- **M7.4.1 已实现双区导航**：`WorkbenchDefinition.splitNavigation` + `SplitSidebar`；`harness-designer` 上半区工作流、下半区 Session 树，共享侧栏宽度、横向拖动比例并写入 `localStorage`；`NavigationPanel` 增加 `section` 变体，收起按钮只保留在上半区（ADR-021）。
- **M7.4.2 已实现消息写入**：运行模式选中 conversation 会话时，run 结束自动把 Agent / ModelCall 消息追加到该会话；结果面板提供「写入对话」，写入后历史面板与 Session 树计数刷新；run session 仍只存 RunResult（ADR-022）。（已由 M8.6 / ADR-028 改为运行开始自动建会话并逐步写入。）
- **M7.5 已实现**：`WorkbenchDefinition.RunView` + `WorkbenchHost` 按 mode 选择主视图；`harness-designer` 运行阶段显示「运行模式」上下文条与「返回设计」，复用画布 / 浮动面板 / Session 导航；实例持久化 `mode / runId / sessionId`；动画原语为运行节点 pulse、活跃边 flow、视口 focus（ADR-023；独立 flow-runner 运行页已由 ADR-027 移除）。
- 运行事件投影保持引用稳定：`node:stream` 等不改变节点 / 边状态的事件返回同一个 `RunViewState`；`CanvasView` 以 `memo` 渲染，token 流只更新运行日志 / 会话面板，不触发整张画布重渲染；
- **左栏 = Panel 宿主**：Shell 只提供容器与尺寸；PanelContent 默认由 `activeWorkbench.type` + `mode` 提供；声明 `splitNavigation` 的工作台改为固定上下双区（harness-designer：上工作流 / 下会话）。
- **设计模式**：`harness-designer` 左栏 = GraphDocument 列表（新建 / 最近 / 重命名 / 复制 / 删除 / 导入导出），选中同步 `WorkbenchInstance.graphs` 的 primaryGraph。
- **运行模式**：同一实例切到 `run`，主视图显示运行上下文条并保持同一张画布（运行时只读）；Session 树位于左栏下半区，不再替换整个左栏。
- **工作台定义**：`WorkbenchDefinition` 增加 `navigation`（design / run）与可选的 `RunView`；`harness-designer` 不再用 `RunView` 替换主视图，运行上下文条与画布在同一个组件内渲染，design ↔ run 只更新 props、不重挂载 `DesignerView` / `CanvasView`（ADR-027）。
- **运行期结构保持**：只读（运行 / 暂停 / 冲突）时节点仍渲染内联控件与端口徽标，仅置为 disabled；节点高度与连线锚点不随运行状态变化。
- **面板**：
  - 运行日志面板：单一日志列表（问题行 + 事件行，无页签）；渲染 `node:end` / `run:end` outputs、`node:stream`、附件（结果页签已移除）；
  - 会话历史面板：由 `SessionHistoryView` 迁移而来，按 `kind` 渲染 conversation / run；
  - 现有属性检查、运行日志保留。
- **移除**：顶层 `sessions` 视图与 `Ctrl+4`；`SessionSidebar` 不再作为全局左栏。
- **材质**：浮动面板 `--fh-panel-alpha` 0.78；TitleBar / StatusBar 等固定 chrome 不变。
- **数据**：Session 树、`SessionRecord.kind`、RunResult 契约见 [data-model.md](./data-model.md) §12。
