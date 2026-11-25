# 模块构成与契约

本文按层列出每个模块的职责、对外契约与明确不做的事。**接口块是设计草案**，实现以 `packages/contracts` 与 `apps/desktop/src` 的代码为准；模块「已实现 / 未实现」以一览表的状态列为准（实现细节见 [README.md](./README.md) 的实现状态表）。

## 一览

| 层 | 模块 | 一句话 | 状态 |
| --- | --- | --- | --- |
| L1 | Platform | 窗口、IPC 路由、`fh-asset` 协议、路径与主题同步 | ✅ |
| L1 | Logging | 主进程日志与运行诊断 | ⬜ 未实现（当前用 `console.*`） |
| L2 | AppConfig | 应用级配置（工作区位置、偏好） | ✅ |
| L2 | Secrets | Provider 密钥，主进程独占 | ✅ |
| L2 | ProviderRegistry | 配置 + 密钥 → AIProvider 实例，供 RuntimeHost 解析 | ✅ M6.1 |
| L2 | BlobStore | 内容寻址的二进制存储 | ✅ |
| L2 | WorkspaceStore | 工作区文档、索引、迁移、导入导出 | ✅（无 `applyCommands`、无迁移） |
| L2 | WorkspaceFileHost | wireclaw `IFileHost` 的 FH 实现 | ✅ |
| L2 | SessionService | Session 生命周期与附件管理器装配 | ✅ M6.2（历史回放 UI 未做） |
| L2 | RunStore | run 记录、事件日志、checkpoint | ✅ |
| L2 | RuntimeHost | Graph 执行、事件流、暂停/恢复/取消 | ✅（Provider 已接） |
| L0 | Contracts | IPC 契约、DTO、错误码 | ✅ |
| L3 | App Shell | 应用外壳、主题 provider、模块宿主 | 🚧 外壳与主题已实现，模块注册表未开始 |
| L4 | Canvas | 无框架画布核心 + React 视图 | ✅（core 仅几何/边 key/类型） |
| L4 | Workbench Framework | 工作台契约、实例、视图宿主、运行控制、Plan | ✅ M5 |
| L5 | Harness Designer | 默认工作台，框架的参考实现 | ✅ M3 |
| L5 | Other Workbenches | 面向不同目标的工作台 | ⬜ 未实现 |

图例：✅ 已实现 ｜ 🚧 部分实现 ｜ ⬜ 未开始

---

## 1. Platform（main）

**职责**

- 窗口生命周期、`activate` / `window-all-closed`；
- 单实例锁（目标行为；当前受限会话无法创建 Chromium 单例锁，暂未启用，见 dev-environment）；
- IPC 路由：注册 channel、参数校验、错误规范化、事件广播；
- 自定义协议 `fh-asset://`：校验工作区已打开后从 BlobStore 流式响应；
- `nativeTheme` 与窗口背景同步；安全路径解析（工作区根目录之外一律拒绝）。

**契约**

```ts
interface Platform {
  broadcast(topic: string, payload: unknown): void;   // 只发给已注册的 webContents
  registerProtocol(): void;
  resolveWorkspacePath(workspaceId: string, rel: string): string; // 越界抛错
}
```

**不做**：业务逻辑、数据模型、执行调度。

> 现状：没有名为 `Platform` 的类。窗口生命周期在 `main/index.ts`；IPC 路由是 `platform/ipc.ts` 的 `registerHandler`；`fh-asset://` 由 `platform/asset-protocol.ts` 的 `registerAssetScheme` / `registerAssetProtocol` 注册；工作区路径由 `WorkspaceStore.getWorkspaceDir` 提供。

## 2. AppConfig

**职责**：应用级配置的读写、校验、版本迁移；只使用主进程文件系统。

```ts
type AppConfig = {
  schemaVersion: 1;
  theme: "light" | "dark" | "system";
  workspaceRoot: string;
  recentWorkspaces: { id: string; path: string; name: string; openedAt: string }[];
  language: "zh-CN" | "en-US";
  devtools: boolean;
};
```

- 位置：`%APPDATA%/FlowHarness/config.json`；
- 原子写（临时文件 + rename），损坏时回退到默认值并备份；
- 与 **Secrets**、**WorkspaceSettings** 严格分离。

**不做**：Provider 密钥、工作流参数、工作区数据。

## 3. Secrets

**职责**：Provider 密钥等敏感值的写入、读取、删除；**只存在于 main**。

- 使用 Electron `safeStorage` 加密后落盘（`secrets.bin`），不可用时明确报错而不是明文降级；
- 对外只暴露 `has / set / delete`；**没有** `get` 到 renderer 的通道；
- 运行期由 `ProviderRegistry` 组装 `AIProvider`，密钥不进入事件、日志、错误信息；
- renderer 的 Provider 设置页通过 `secrets:set / delete` 写入，只能看到 `hasKey` 布尔值。

## 4. Theme

**职责**：明暗双主题的 token、切换与首帧一致性。

- `design tokens`：语义化 CSS 变量（`--fh-bg`、`--fh-surface`、`--fh-text`、`--fh-accent`…），组件禁止写死颜色；
- renderer：`<html data-theme="light|dark">`，偏好来自 AppConfig；
- main：`nativeTheme.themeSource` + 窗口 `backgroundColor` 同步，避免闪白；
- 首帧：`renderer/src/main.tsx` 在挂载 React 前读 `localStorage["fh.theme"]` 写入 `data-theme`；`ThemeProvider` 随后读 AppConfig 覆盖；preload 只暴露 `platform / smokeMode / windowMode / versions`，不提供主题。

**不做**：多主题市场、按工作台换肤（预留 token 扩展即可）。

## 5. BlobStore

**职责**：内容寻址的二进制读写。

```ts
interface BlobStore {
  put(bytes: Uint8Array, meta: BlobMeta): Promise<string>;      // 返回 contentHash
  get(hash: string): Promise<Uint8Array | undefined>;
  has(hash: string): Promise<boolean>;
  stat(hash: string): Promise<BlobMeta | undefined>;
  delete(hash: string): Promise<boolean>;
  list(): Promise<readonly string[]>;
}
```

- 物理路径：`workspaces/<wsId>/objects/<hash 前 2 位>/<hash>`；
- 元数据与引用记在 `objects/index.json`（后续可换 SQLite，接口不变）；
- **不感知** workspace / session / file 的业务概念，作用域由上层传入。

## 6. WorkspaceStore

**职责**：工作区的打开/关闭、文档读写、命令应用、迁移、锁、导入导出。

```ts
interface WorkspaceStore {
  list(): Promise<WorkspaceSummary[]>;
  create(input: { name: string }): Promise<WorkspaceSummary>;
  open(path: string): Promise<WorkspaceSummary>;
  close(workspaceId: string): Promise<void>;
  readDocument(workspaceId: string, ref: DocumentRef): Promise<unknown>;
  applyCommands(workspaceId: string, commands: WorkspaceCommand[]): Promise<void>;
  exportWorkspace(workspaceId: string, options?: ExportOptions): Promise<string>; // .fhws 路径
  importWorkspace(path: string): Promise<WorkspaceSummary>;
}
```

- 写路径：校验 → 合并 → 临时文件 → rename；变更后发 `workspace:changed`；
- 迁移：按 `schemaVersion` 逐级迁移，迁移前备份；
- 锁：应用单实例 + 工作区 `lock` 文件（pid + 时间戳，支持陈旧检测）；
- **单写者**：一期只允许一个窗口写一个工作区。

> 现状（以代码为准）：已实现 `list / create / open / close / readDocument / saveDocument / listDocuments / deleteDocument / exportWorkspace / importWorkspace / getBlobStore / getWorkspaceDir / isOpen`；文档保存是整文档快照 + sha256 revision（`baseRevision` 不匹配返回 `E_CONFLICT`），**没有** `applyCommands`、`workspace:changed` 事件、迁移表与备份；`lock` 只写 pid/startedAt/appVersion，陈旧判定看 pid 是否存活，单实例锁未启用。

## 7. WorkspaceFileHost

**职责**：实现 wireclaw 的 `IFileHost`，把 contentHash 映射到 BlobStore。

```ts
class WorkspaceFileHost implements IFileHost {
  read(contentHash: string): Promise<StoredAttachment | undefined>;
  readMeta(contentHash: string): Promise<StoredAttachmentMeta | undefined>;
  write(file: StoredAttachment): Promise<StoredAttachmentMeta>;
  list(): Promise<readonly StoredAttachmentMeta[]>;
  delete?(contentHash: string): Promise<boolean>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}
```

- 去重、索引、缓存、GC 由 wireclaw `AttachmentFileManager` 负责，FH 不重写；
- 引用关系设计上写入 `objects/index.json` 的 `refs`（`{ kind: "session" | "run" | "document", id }`）；**当前 `BlobStore.addRef/removeRef` 无调用方**，`refs` 恒为空；
- 目标（未实现）：GC roots 由 WorkspaceStore / SessionService 汇总；`BlobStore.gc()` 目前只在单测里调用。

## 8. SessionService

**职责**：Session 的创建、加载、关闭；为每个 Session 装配 `AttachmentFileManager`。

- 持有当前打开的 session（内存），历史落 `sessions/<sessionId>/`；
- 提供 wireclaw `GraphHost.attachments`；
- 会话历史与附件引用持久化，支持重新打开与回放。

**当前实现（M6.2）**：每个已打开工作区装配一个 `AttachmentFileManager`（`WorkspaceFileHost` → BlobStore）与一个 `SessionStore`（`sessions/<id>/session.json`）；支持默认会话、创建 / 列表 / 读取 / 保存。消息历史当前是 opaque JSON 数组，附件回放 UI 尚未接入。

## 9. RunStore

**职责**：run 的持久化与恢复。

```text
runs/<runId>/meta.json      # 状态、graphId、起止时间、错误摘要
runs/<runId>/graph.json     # 运行时的 Graph 定义快照（恢复所需）
runs/<runId>/events.jsonl   # GraphEvent 追加日志
runs/<runId>/checkpoint.json# GraphCheckpoint（暂停时写入）
```

- 追加写事件日志：按批次（RuntimeHost 每 16ms flush）追加，避免每事件一次 write；
- **打开工作区时**把状态仍为 `running` 的 run 标记为 `interrupted`（启动流程里没有这一步）；
- 写入不可用时只告警一次并继续（内存态），不影响执行。

## 10. RuntimeHost（main）

**职责**：FH 唯一的执行入口。

```ts
interface RuntimeHost {
  start(req: RunStartRequest): Promise<RunSnapshot>;
  pause(runId: string): Promise<GraphCheckpoint>;
  resume(runId: string): Promise<RunSnapshot>;
  cancel(runId: string): void;
  get(runId: string): RunSnapshot | undefined;
}
```

- 输入是 `GraphDocument` + 输入值 + 可选 checkpoint，内部 `deserializeGraph` 后调用 `graph.run(...)`；暂停/恢复走 `GraphRun.pause()/resume()`，跨重启用 `resumeInterrupted()` 装载 RunStore 的 graph + checkpoint 后重新 start；
- 实现 wireclaw `GraphHost`：`resolveProvider`（ProviderRegistry）、`tools`（每工作区 LocalToolProvider：readFile / writeFile）、`attachments`、`onToolApproval`、`onUserInput`、`parameters`、`log`；
- 事件：`GraphRun.onEvent` → RunStore + 节流广播；
- 并发（目标，未实现）：每个工作台默认 1 个活动 run，可配置；
- 详见 [runtime.md](./runtime.md)。

> 当前实现：`start / pause / resume / cancel / get / list / resume-interrupted` 都已在 main 注册；`resolveProvider` 由 ProviderRegistry 提供；pause/resume 进程内恢复，Diagnostics 可跨重启恢复；并发限制仍未实现。

## 11. Contracts（L0）

**职责**：所有跨进程与跨模块的类型。

- IPC channel 常量、请求/响应 DTO、事件 topic 与 payload；
- `FhError` 错误码与结构；
- 领域标识（workspaceId / graphId / workbenchId / runId / sessionId）。

> 当前 contracts 已包含 `ids / errors / domain / run / workbench / provider / ipc`；模块接口的框架部分仍在 renderer。

**不做**：不 import React / Electron / Node；不放类实例；不做运行时逻辑（校验函数除外）。

## 12. Canvas（L4）

**职责**：通用画布能力，**与 Harness 无关**。

- core（纯 TS）：当前只有 `geometry`（屏幕↔世界坐标、矩形包含/相交）、`edge-key` 与 `CanvasNode/CanvasEdge/CanvasDocument/CanvasCommand` 类型；**命令**（`applyCanvasCommand` / `addNode` / `updateNodeConfig`）在 `designer/core/commands.ts`，**动画**是 CSS 实现（流动虚线等），没有 `CanvasAnimationApi`；
- view（React）：视口、节点层、连线层、小地图、ContextMenu、运行态节点/边状态与问题定位聚焦；没有 `<Controls>`（左下缩放工具栏已移除）；
- NodeContent 由 registry 注入，画布本身不渲染任何业务节点。

```ts
type CanvasNode = { id: string; kind: string; position: Vec2; size?: Size; data: unknown };
type CanvasEdge = { id: string; source: PortRef; target: PortRef; kind?: string };
type CanvasDocument = { nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: Viewport };
```

**不做**：不 import wireclaw、不定义 Harness 语义、不持有运行状态。

## 13. Workbench Framework（L4，M5 已实现）

**职责**：把「一个工作台」抽象为「实例文档 + 视图 + 运行控制」。

> 现状：`renderer/src/workbench/` 提供 `WorkbenchDefinition`、`WorkbenchController`、`WorkbenchPlan`、registry 与 `WorkbenchHost`；实例文档持久化到 `documents/workbenches/<id>.json`，通过 `workspace:listWorkbenches` 列出。当前 View 自持 hooks（设计器复用现有 document/run/undo），`WorkbenchController` 由设计器上报给 Shell。工作台类型：`harness-designer` / `graph-table` / `plan-runner`；`plan-runner` 在 renderer 侧按顺序调用 `run:start`，尚未下沉 RuntimeHost。

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

- 当前 View 自持 hooks（设计器复用 `useDesignerDocument` / `useDesignerRun`），通过 Shell 上报 `WorkbenchController`；框架级统一工具栏与命令栈注入留给后续；
- 工作台实例文档见 [data-model.md](./data-model.md)；
- 一个实例可绑定多个 graph；组合优先用 wireclaw 的 subgraph，只有独立多 run 才用 `WorkbenchPlan`；
- `plan-runner` 已提供顺序执行多个独立 run 的示例；`bindings` 与 RuntimeHost 编排仍未接线。

## 14. Harness Designer（L5）

**职责**：默认工作台，可拖拽、连线、校验、运行、导入导出。

**当前实现（M5）**：作为 `harness-designer` 工作台注册到 Workbench Framework；加载/保存任意 Harness 文档、多图、导入导出、画布编辑（含框选 / 右键平移 / 内联编辑 / Body 输入端口槽）、撤销重做与复制粘贴、自动保存与冲突副本、递归 `validate()`、问题面板、运行日志与检查器、运行状态与暂停·继续。

- 节点面板数据来自 wireclaw：`createEditorCatalog(registry, { presets })` → `NodeCatalogEntry[]` + presets（M2 已接入，含默认 config / configSchema / 分类 / 关键词）；
- `GraphDocument` → `CanvasDocument` 单向 adapter 由设计器实现（`designer/core/adapter.ts`）；
- 布局写入 `GraphDocument.ui`（节点 `ui` 与图级 `ui`）；实例级覆盖（`layout.overrides`）尚未接线；
- 运行前用 `Graph.validate()`（renderer 的 wireclaw 浏览器构建）；内嵌图递归校验与问题定位已在 M3 接入，`requirements` catalog 的宿主来源等 M6；
- 导入导出：文档菜单提供单 `GraphDocument` JSON 导入（新建文档）与导出（可选剥离 `ui`）；`.fhws` 整工作区导入导出仍只有 main 通道。

## 15. Other Workbenches（L5）

- 运行底层都是 Harness Graph，但以不同动画/交互呈现；
- 必须实现 `WorkbenchDefinition`，不得绕过 Workbench Framework 直接连 RuntimeHost；
- 多 graph 组合由 `WorkbenchPlan` 描述（图引用、输入绑定、输出消费）；目标由 RuntimeHost 编排，当前 `plan-runner` 是 renderer 侧临时实现。

## 16. Import / Export

| 格式 | 内容 | 用途 | 状态 |
| --- | --- | --- | --- |
| Harness JSON | 单个 `GraphDocument` | 工作流互通、版本管理 | ⬜ 未实现 |
| `.fhws` | zip：`export.json` + `manifest.json` + `documents/**` + `objects/**` | 整工作区迁移 | ✅ 已实现（不含 runs/sessions） |
| 备份 | 迁移前的自动副本 | 恢复 | ⬜ 未实现（无迁移表） |

两者不混用：Harness JSON 不包含工作台实例信息，`.fhws` 才包含。

## 17. Observability（目标，基本未实现）

- main 日志：分级、按 run 分文件、脱敏（密钥永不出现）——当前统一用 `console.*`，未分级/未分文件；
- run 事件日志：`runs/<runId>/events.jsonl` 已落盘、可回放；导出诊断包未实现；
- renderer 错误边界：**尚未实现**（没有 ErrorBoundary 组件），UI 异常会冒泡到整棵 React 树。
