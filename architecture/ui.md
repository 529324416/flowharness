# UI 架构：React、画布、工作台

## 1. 技术选型

| 组件 | 选择 | 说明 |
| --- | --- | --- |
| UI 框架 | **React 19** | 画布生态最成熟；与 TypeScript 7 的 `tsc` 直接兼容 |
| 构建 | Vite 8 + electron-vite 6 | 与现有桌面壳一致 |
| 画布交互 | **`@xyflow/react` 13** | 只作为 Canvas 视图层的实现细节，对外仍是 FH 自己的类型 |
| 类型检查 | `tsc --noEmit` | 不引入 vue-tsc 一类的额外编译器 |
| 样式 | CSS 变量（design tokens）+ CSS Modules | 不引 UI 组件库，避免早期锁定视觉 |
| 状态 | React Context + `useSyncExternalStore` | 领域状态在 main；renderer 只需 UI 投影，暂不引入状态库 |

> 背景：曾评估 Vue 3 + Vue Flow。实测 `vue-tsc@3.3.14` 与 `typescript@7.0.2` 不兼容（`ERR_PACKAGE_PATH_NOT_EXPORTED: './lib/tsc'`），需把 desktop 钉在 TS 6；而本仓库与 wireclaw 都在 TS 7，React 的纯 `tsc` 链路零额外成本。

`@vitejs/plugin-react@6` 在 Vite 8（rolldown）下声明了若干 peer（`oxc-transform-react` 等），接入时需按官方配置补齐，接入验证归入实现阶段第一步。

## 2. renderer 结构

```text
renderer/src/
  main.tsx                 # React 挂载、首帧主题
  shell/
    App.tsx                # 外壳：工作台切换、全局命令
    theme/                 # tokens、ThemeProvider
    modules/               # 模块注册表与宿主
    ipc/                   # window.fh 的类型化封装、事件订阅
  modules/
    canvas/
      core/                # 纯 TS：几何、命令、选择、动画原语
      view/                # React：Viewport / NodeLayer / EdgeLayer / MiniMap
      index.ts             # 公开入口
    workbench/
      framework/           # WorkbenchDefinition 宿主、运行控制、命令栈
      index.ts
  workbenches/
    harness-designer/
      adapter/             # GraphDocument ⇄ CanvasDocument
      palette/             # 节点目录
      inspector/           # 选中节点/边
      index.ts
```

规则：

- `modules/*` 只从公开入口互相引用；
- `workbenches/*` 不得直接调用 `window.fh.run`，必须经 Workbench Framework 的 controller；
- 业务组件不写死颜色，统一用 token。

## 3. 主题接入

- `<html data-theme="light|dark">`；
- 首帧：`main.tsx` 在 `createRoot` 前同步读取 `window.fh.initialTheme`（preload 注入）并落 attribute，避免闪白；
- main 侧 `nativeTheme.themeSource` 与窗口背景同步；
- 画布、连线、小地图、ContextMenu 全部消费同一套 token；节点内容不得自带硬编码色值。

## 4. Canvas

### 4.1 目标与非目标

**目标**：通用、可测、可替换的画布；支持缩放平移、小地图、节点/连线、选择、拖拽、连线、ContextMenu、动画原语、主题。

**非目标**：不理解 Harness；不持有运行状态；不实现具体节点内容。

### 4.2 core / view 分工

| 部分 | 内容 | 依赖 |
| --- | --- | --- |
| `core`（纯 TS） | 视口变换、命中测试、选择模型、命令（增删改连）、布局应用、动画调度原语、边 key 规则 | 无框架依赖，可单测 |
| `view`（React） | 视口容器、节点层、连线层、小地图、Controls、ContextMenu；用 react-flow 实现手势与渲染 | React、`@xyflow/react` |

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

- **受控模式**：`CanvasDocument` 是唯一事实来源；react-flow 的 `nodes`/`edges` 由 adapter 生成，`onNodesChange`/`onEdgesChange`/`onConnect` 转成 Canvas 命令，经 `apply` 回到文档；
- `nodeTypes` 来自 **node renderer registry**（`kind → React.ComponentType`），Canvas 不内置任何业务节点；
- `edgeTypes` 提供至少一个带动画能力的默认边；
- 小地图/Controls/Background 用官方组件；
- react-flow 的使用被限制在 `modules/canvas/view/`，其他代码不 import 它。

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
  canOpen(doc: WorkbenchInstanceDocument): boolean;
  createController(doc: WorkbenchInstanceDocument): WorkbenchController;
  View: React.ComponentType<WorkbenchViewProps>;
}

interface WorkbenchController {
  run(input?: unknown): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  cancel(): void;
  readonly status: RunStatus;
}
```

框架提供：运行工具栏（运行/暂停/继续/取消 + 状态）、问题面板、运行日志、命令栈、自动保存。

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
3. plan 的编排在 RuntimeHost，工作台只声明，不自己调度。

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

### 5.5 编辑与持久化

- 所有编辑走命令（`addNode` / `removeNode` / `moveNodes` / `connect` / `disconnect` / `updateNodeConfig` / `setViewport`）；
- 命令栈仅存在于 renderer（会话级），默认 50 步，不持久化；
- 自动保存：命令合并后 debounce ≈400ms 写回文档；关闭工作台/切换时强制 flush；
- 写冲突：一期单写者，不做合并。

## 6. Harness Designer

### 6.1 数据来源（不要硬编码节点）

- `createEditorCatalog(registry, { presets })` → `NodeCatalogEntry[]` + `NodePresetDocument[]`；
- `NodeCatalogEntry` 提供 `type / title / description / inputs / outputs / requirements / configSchema / error`；
- **动态端口**：端口可能依赖 `config`，修改配置后用 `describeNodeType(registry, type, { config })` 重新获取端口，再更新画布；
- 预设通过 `NodePresetLibrary` 实例化。

### 6.2 Adapter

```text
GraphDocument ⇄ CanvasDocument
  node: { id, type, config, ui }      ⇄ { id, kind: type, position: ui.x/y, data: config }
  edge: { from, to }                  ⇄ { id: `from->to`, source, target }
  graph.ui.viewport                    ⇄ viewport
```

- 布局写回 `GraphDocument.ui`（节点 `ui.x/y/width`、图级 `ui.viewport`）；
- 工作台实例的 `layout.overrides` 仅覆盖「同一 graph 在实例中的不同摆放」，不写回 graph。

### 6.3 编辑与校验

- 拖拽/连线生成/修改 `GraphDocument`；
- 运行前 `graph.validate({ requirements })`（renderer 用 wireclaw 浏览器构建），`HarnessIssue` 在问题面板展示；
- 有 error 级问题时禁止运行，可「仍然运行」但需确认。

### 6.4 运行与导入导出

- 运行时把 `GraphDocument` 交给 RuntimeHost（main 反序列化并执行）；
- 导入/导出就是 `GraphDocument` JSON，不做私有封装；
- 导出时可选「包含布局」，即是否保留 `ui`。

### 6.5 NodeContent

- 一期：根据 `configSchema` 生成通用表单（JSON Schema 子集）；
- 二期：为高频节点（模型调用、Agent、分支、循环）提供定制组件；
- 节点内容组件通过 registry 注册，Canvas 不感知。

## 7. 其他工作台

- 必须实现 `WorkbenchDefinition`；
- 运行底层是 Harness Graph，但动画/交互按目标定制；
- 需要多图时使用 `WorkbenchPlan`，不得自行管理多个 RuntimeHost 连接；
- 与设计器共享 Canvas、主题、运行控制，不复制。

## 8. 无障碍与键盘

- 画布支持键盘：空格拖拽、方向键移动选中、Delete 删除、Esc 取消连线；
- 工具栏与面板使用可聚焦的原生控件；
- 颜色不作为唯一状态表达（错误同时有图标/文本）。

## 9. 测试策略

| 层级 | 方式 |
| --- | --- |
| canvas core | Vitest 纯函数单测 |
| canvas view | Testing Library 交互测试 |
| designer adapter | 序列化往返测试（GraphDocument → Canvas → GraphDocument 幂等） |
| 运行链路 | main 侧集成测试（fake provider + 最小图） |
| 端到端 | Electron smoke（现有 `pnpm smoke` 扩展） |
