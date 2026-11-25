# 架构总览

## 1. 定位

FH 是一个 **Agent 工作台宿主**：负责工作区数据的编辑与持久化、工作流在画布上的编排与运行态呈现，以及多工作台的组织。执行与 Agent 能力来自 wireclaw，FH 不重复实现引擎。

**非目标**（当前阶段）：

- 云端同步与多人协作；
- 插件市场与第三方沙箱；
- 多窗口编辑；
- 替代 wireclaw 的 Session / Graph / Tool 能力。

## 2. 分层

```text
L0  contracts        跨进程类型、IPC 契约、模块接口（无框架、无 Electron、无 Node 依赖）
L1  main platform    窗口生命周期、IPC 路由、自定义协议、路径、nativeTheme、safeStorage
L2  main services    AppConfig / Secrets / ProviderRegistry / BlobStore / WorkspaceStore /
                     SessionService / RunStore / RuntimeHost
L3  renderer shell   应用外壳、主题、模块宿主与注册表、错误边界
L4  built-in modules Canvas / Workbench Framework
L5  workbenches      Harness Designer、其他工作台
```

### 依赖规则

- 依赖只能**向下**，禁止反向（renderer 不得 import main，main 不得 import renderer）。
- L4 模块之间不互相 import 内部实现；跨模块协作通过 L0 contracts 与公开入口。
- **Canvas 不依赖 wireclaw、不依赖 Designer**。
- `contracts` 不依赖 React / Electron / Node，只含类型与常量。
- 任何 wireclaw 的类实例不得穿过 IPC；传输一律用 `GraphDocument` 等纯 JSON DTO。

### 允许的 import 关系

| 层 | 允许依赖 |
| --- | --- |
| L0 contracts | 无 |
| L1 platform | contracts |
| L2 services | contracts、platform |
| L3 shell | contracts |
| L4 canvas | contracts |
| L4 workbench framework | contracts、canvas（公开入口） |
| L5 workbenches | contracts、canvas（公开入口）、workbench framework |

> 上表是当前依赖规则。L5 设计器已按 Workbench Framework 注册（`workbenches/harness-designer.tsx`），画布视图仍在 `views/DesignerView`；`renderer/src/workbench/` 提供定义、registry 与宿主。

renderer 访问主进程的唯一通道是 preload 暴露的 `window.flowharness`（类型由 `renderer/src/bridge.d.ts` 声明，contracts 只提供 DTO / 通道常量）。

## 3. 进程模型

```text
┌─────────────────────────── main (Node) ───────────────────────────┐
│ platform: 窗口 / IPC 路由 / fh-asset 协议 / nativeTheme / 路径      │
│ services: AppConfig  Secrets  ProviderRegistry  BlobStore           │
│           WorkspaceStore  RunStore  SessionService ── SessionStore  │
│           AttachmentFileManager ── WorkspaceFileHost               │
│           RuntimeHost ── wireclaw Graph.run / GraphRun.pause·resume │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ typed IPC（invoke + event）    │ GraphDocument / Blob
┌───────────────┴───────────────┐   ┌───────────▼───────────────────┐
│ preload（contextBridge）       │   │ renderer（React）              │
│ window.flowharness: 白名单 API │   │ shell: 主题 / 视图切换          │
└───────────────────────────────┘   │ canvas / designer / views      │
                                    │ Workbench Framework / 三工作台  │
                                    └────────────────────────────────┘
```

要点：

- **main 拥有全部持久化状态与凭证**；renderer 只持有 UI 投影。
- preload 是唯一桥；renderer 无 Node 能力。
- 运行执行在 main；renderer 重载不会中断 run，可通过 `run:get` / 事件回放恢复视图。
- RuntimeHost 以接口形式暴露，未来可在不改 contracts 的前提下迁到 utility process。

## 4. 数据流

### 编辑流（当前：renderer 内存 + 整文档自动保存）

```text
用户操作 → CanvasView / 设计器动作 → 内存中的 GraphDocument（唯一事实源）
        → 400ms SaveCoordinator → window.flowharness.saveDocument（整文档 + baseRevision）
        → WorkspaceStore（JSON 校验、4 MB 上限、sha256 revision、原子写）
        → 新 revision 返回 renderer
```

> 目标态（M4+）：`workspace:applyCommands` 增量命令与 `workspace:changed` 事件是给多写者/多窗口预留的，**当前均未实现**；单写者阶段用整文档快照保存（ADR-012）。

### 运行流

```text
运行按钮 → useDesignerRun → window.flowharness.startRun(graphDocument, input)
        → RuntimeHost → deserializeGraph + Graph.run
        → GraphEvent → RunStore（events.jsonl）→ 16ms 节流批量 → fh:event（topic: run）
        → useDesignerRun → nodeStatuses / 运行日志 / StatusBar
运行结束 → wireclaw RunResult v1（entries + outputs）→ runs/<runId>/result.json
        → RuntimeHost 内存缓存 → run:result → 运行结果面板 / 保存到 Session
```

> 运行控制由各工作台 View 自持 hooks（设计器用 `useDesignerRun`）调用 preload，再经 `shell.onControllerChange` 上报 `WorkbenchController`；框架级统一运行控制尚未下沉。

### 资源流

```text
< img src="fh-asset://<workspaceId>/<contentHash>" >
        → main 协议处理器 → 校验工作区已打开 + 哈希格式 → BlobStore → 返回字节
```

## 5. 模块地图

```text
apps/desktop/src/
  main/
    index.ts                   # 窗口 + 服务装配 + IPC 注册
    platform/                  # IPC 路由、fh-asset 协议、审批/输入请求中转
    services/                  # AppConfig / Secrets / ProviderRegistry / BlobStore /
                               # WorkspaceStore / WorkspaceFileHost / SessionService /
                               # RunStore / RuntimeHost / workspace-tools
  preload/index.ts             # contextBridge 白名单桥（window.flowharness）
  renderer/src/
    App.tsx main.tsx           # L3：视图切换、自检上报、首帧主题
    shell/                     # TitleBar / Ribbon / navigation / StatusBar / panels / dialogs
    shell/navigation/          # NavigationPanel / DocumentNavigation / PlanNavigation
    workbench/                 # L4：Definition / Controller / registry / WorkbenchHost / Plan
    workbenches/               # L5：harness-designer / graph-table / plan-runner
    views/                     # Designer / SessionHistory / Diagnostics / Styleguide（HeroView 未接入，暂无引用）
    canvas/core/               # L4：纯 TS 画布领域（几何 / 边 key / 选择辅助 / 类型）
    canvas/view/               # L4：react-flow 受控视图 + 节点/边 renderer
    designer/core/             # L5：GraphDocument adapter / 命令 / validate / run-events
    designer/state/            # L5：文档加载 / SaveCoordinator / 运行控制
    inspector/                 # L5：检查器 model
    ui/ theme/ styles/ components/ run/
packages/
  contracts/                   # L0
vendor/wireclaw/               # 引擎（submodule）
```

> 与目标层名的对应：`canvas/*` 即 L4 Canvas；`workbench/*` 即 L4 Workbench Framework；`designer/*` + `views/DesignerView` + `workbenches/harness-designer.tsx` 即 L5 Harness Designer。**`modules/` 目录尚未引入**，工作台通过 `workbench/registry` 注册。

## 6. 与 wireclaw 的边界

| 归属 | 内容 |
| --- | --- |
| wireclaw 负责 | Graph 定义与执行、Session、Provider、工具/MCP、附件管理器、节点目录与预设、序列化 |
| FH 负责 | 工作区与文档、画布与工作台、运行编排与观测、配置/密钥、文件宿主、导入导出 |
| 共享方式 | 通过包名 `import { ... } from "wireclaw"`；版本以 submodule commit 固定 |
| 禁止 | fork wireclaw 源码、复制它的类型到 contracts、绕开 `exports` 引用源码路径 |

同步策略：升级 submodule 时先跑 wireclaw 自身测试，再跑 FH 的 typecheck / build / smoke；`GraphDocument` 的 `version` 与 FH 的 `schemaVersion` 各自独立演进。

## 7. 当前实现状态

本文件描述**目标架构**。当前已实现：pnpm workspace + wireclaw submodule、Electron main/preload/renderer 三端、contracts、main 服务层（配置 / 密钥 / Blob / 工作区 / 运行记录 / RuntimeHost）、Shell v2、浮动 Panel、Canvas core + view、UI 打磨，以及 M1 ~ M4 Designer（GraphDocument adapter、编辑命令、运行、自动保存、检查器、问题面板、递归校验、暂停/继续、多图文档、撤销复制、框选平移、JSON 导入导出）与 M5 Workbench Framework（定义 / 实例 / registry / host / 三个工作台 / WorkbenchPlan / 节点内联与端口槽），以及 M6（Provider 工厂 / Secrets / 审批输入 / checkpoint v2 / 工作区工具 / SessionStore / Session 历史序列化与回放视图）。

**尚未实现**：Plan 编排下沉 RuntimeHost、`plan.bindings` 与 `layout.overrides`；Session 消息写入侧（聊天输入 / Agent 会话对接）；MCP 等更多工具 Provider；`applyCommands` 与 `workspace:changed` 事件；`.fhws` UI；工作台 run 模式与独立 RunView。迁移顺序见 [../todo.md](../todo.md)。

**M7 进行中**：M7.1 已实现左栏 Panel 宿主、GraphDocument 导航、文档绑定与删除引用检查；M7.2 已实现 Session 递归文件夹、`SessionRecord` v2、草稿目录与 IPC；M7.3 已实现设计/运行模式切换、工作流右键菜单、Session 树导航与会话历史浮动面板；M7.4 已实现 wireclaw `RunResult` 聚合、`runs/<runId>/result.json`、运行结果面板、run 会话保存与回放、草稿目录右键配置；M7.5（工作台 RunView 与动画）尚未实现。
