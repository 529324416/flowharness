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
L2  main services    AppConfig / Secrets / BlobStore / WorkspaceStore / RunStore /
                     SessionService / RuntimeHost
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

renderer 访问主进程的唯一通道是 preload 暴露的 `window.fh`（类型由 contracts 定义）。

## 3. 进程模型

```text
┌─────────────────────────── main (Node) ───────────────────────────┐
│ platform: 窗口 / IPC 路由 / fh-asset 协议 / nativeTheme / 路径      │
│ services: AppConfig  Secrets  BlobStore  WorkspaceStore  RunStore  │
│           SessionService ── AttachmentFileManager ── WorkspaceFileHost
│           RuntimeHost ── wireclaw Graph.run / Graph.resume          │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ typed IPC（invoke + event）    │ GraphDocument / Blob
┌───────────────┴───────────────┐   ┌───────────▼───────────────────┐
│ preload（contextBridge）       │   │ renderer（React）              │
│ window.fh: 白名单 API          │   │ shell: 主题 / 模块宿主          │
└───────────────────────────────┘   │ modules: Canvas / Workbench    │
                                    │ workbenches: Designer / ...    │
                                    └────────────────────────────────┘
```

要点：

- **main 拥有全部持久化状态与凭证**；renderer 只持有 UI 投影。
- preload 是唯一桥；renderer 无 Node 能力。
- 运行执行在 main；renderer 重载不会中断 run，可通过 `run:get` / 事件回放恢复视图。
- RuntimeHost 以接口形式暴露，未来可在不改 contracts 的前提下迁到 utility process。

## 4. 数据流

### 编辑流

```text
用户操作 → React 组件 → Command → window.fh.workspace.applyCommands
        → WorkspaceStore（校验、原子写、迁移）
        → workspace:changed 事件 → renderer 投影更新
```

### 运行流

```text
运行按钮 → RunController → fh.run.start(graphDocument, input)
        → RuntimeHost → deserializeGraph + Graph.run
        → GraphEvent → RunStore（事件日志）→ 节流批量 → run:event
        → RunController → Workbench 映射 → Canvas 动画
```

### 资源流

```text
< img src="fh-asset://<workspaceId>/<contentHash>" >
        → main 协议处理器 → 校验工作区已打开 → BlobStore → 流式响应
```

## 5. 模块地图

```text
apps/desktop/src/
  main/                        # L1 + L2 装配
    platform/
    services/
  preload/                     # 白名单桥
  renderer/src/
    shell/                     # L3
    modules/
      canvas/                  # L4：core/ + view/
      workbench/               # L4：框架
    workbenches/
      harness-designer/        # L5
packages/
  contracts/                   # L0
vendor/wireclaw/               # 引擎（submodule）
```

## 6. 与 wireclaw 的边界

| 归属 | 内容 |
| --- | --- |
| wireclaw 负责 | Graph 定义与执行、Session、Provider、工具/MCP、附件管理器、节点目录与预设、序列化 |
| FH 负责 | 工作区与文档、画布与工作台、运行编排与观测、配置/密钥、文件宿主、导入导出 |
| 共享方式 | 通过包名 `import { ... } from "wireclaw"`；版本以 submodule commit 固定 |
| 禁止 | fork wireclaw 源码、复制它的类型到 contracts、绕开 `exports` 引用源码路径 |

同步策略：升级 submodule 时先跑 wireclaw 自身测试，再跑 FH 的 typecheck / build / smoke；`GraphDocument` 的 `version` 与 FH 的 `schemaVersion` 各自独立演进。

## 7. 当前实现状态

本文件描述**目标架构**。当前已实现：pnpm workspace + wireclaw submodule、Electron main/preload/renderer 三端、contracts、main 服务层（配置 / 密钥 / Blob / 工作区 / 运行记录 / RuntimeHost）、Shell v2、浮动 Panel、Canvas core + view、UI 打磨，以及 M1 最小可运行 Designer（GraphDocument adapter、编辑命令、运行、自动保存、检查器）。

**尚未实现**：M2 节点库与 configSchema 表单、M3 完整校验问题面板、M4 撤销/复制与多图；Workbench Framework；Provider 闭环。迁移顺序见 [../todo.md](../todo.md)。
