# 模块构成与契约

本文按层列出每个模块的职责、对外契约与明确不做的事。接口为设计草案，实现时以 `packages/contracts` 为准。

## 一览

| 层 | 模块 | 一句话 |
| --- | --- | --- |
| L1 | Platform | 窗口、IPC 路由、`fh-asset` 协议、路径与主题同步 |
| L1 | Logging | 主进程日志与运行诊断 |
| L2 | AppConfig | 应用级配置（工作区位置、偏好） |
| L2 | Secrets | Provider 密钥，主进程独占 |
| L2 | BlobStore | 内容寻址的二进制存储 |
| L2 | WorkspaceStore | 工作区文档、索引、迁移、导入导出 |
| L2 | WorkspaceFileHost | wireclaw `IFileHost` 的 FH 实现 |
| L2 | SessionService | Session 生命周期与附件管理器装配 |
| L2 | RunStore | run 记录、事件日志、checkpoint |
| L2 | RuntimeHost | Graph 执行、事件流、暂停/恢复/取消 |
| L0 | Contracts | IPC 契约、DTO、错误码、模块接口 |
| L3 | App Shell | 应用外壳、主题 provider、模块宿主 |
| L4 | Canvas | 无框架画布核心 + React 视图 |
| L4 | Workbench Framework | 工作台契约、运行控制、命令与保存 |
| L5 | Harness Designer | 默认工作台，框架的参考实现 |
| L5 | Other Workbenches | 面向不同目标的工作台 |

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
- 运行期由 main 组装 `AIProvider`，密钥不进入事件、日志、错误信息。

## 4. Theme

**职责**：明暗双主题的 token、切换与首帧一致性。

- `design tokens`：语义化 CSS 变量（`--fh-bg`、`--fh-surface`、`--fh-text`、`--fh-accent`…），组件禁止写死颜色；
- renderer：`<html data-theme="light|dark">`，偏好来自 AppConfig；
- main：`nativeTheme.themeSource` + 窗口 `backgroundColor` 同步，避免闪白；
- 首帧：preload 暴露初始主题，renderer 在挂载 React 前写入 `data-theme`。

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
- 引用关系写入 `objects/index.json` 的 `refs`（`{ kind: "session" | "run" | "document", id }`）；
- GC roots 由 WorkspaceStore / SessionService 提供。

## 8. SessionService

**职责**：Session 的创建、加载、关闭；为每个 Session 装配 `AttachmentFileManager`。

- 持有当前打开的 session（内存），历史落 `sessions/<sessionId>/`；
- 提供 wireclaw `GraphHost.attachments`；
- 会话历史与附件引用持久化，支持重新打开与回放。

## 9. RunStore

**职责**：run 的持久化与恢复。

```text
runs/<runId>/meta.json      # 状态、graphId、起止时间、错误摘要
runs/<runId>/events.jsonl   # GraphEvent 追加日志
runs/<runId>/checkpoint.json# GraphCheckpoint（暂停时写入）
```

- 追加写事件日志；批量落盘，避免每个事件一次 fsync；
- 启动时把状态仍为 `running` 的 run 标记为 `interrupted`，有 checkpoint 则可恢复。

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

- 输入是 `GraphDocument` + 输入值 + 可选 checkpoint，内部 `deserializeGraph` 后调用 `graph.run(...)` / `graph.resume(...)`；
- 实现 wireclaw `GraphHost`：`resolveProvider`（Secrets + Provider 配置）、`tools`、`attachments`、`onToolApproval`、`onUserInput`、`parameters`、`log`；
- 事件：`GraphRun.onEvent` → RunStore + 节流广播；
- 并发：每个工作台默认 1 个活动 run，可配置；
- 详见 [runtime.md](./runtime.md)。

## 11. Contracts（L0）

**职责**：所有跨进程与跨模块的类型。

- IPC channel 常量、请求/响应 DTO、事件 topic 与 payload；
- `FhError` 错误码与结构；
- 模块接口（`FhModule`、`WorkbenchDefinition` 的**无框架部分**）；
- 领域标识（workspaceId / graphId / workbenchId / runId / sessionId）。

**不做**：不 import React / Electron / Node；不放类实例；不做运行时逻辑（校验函数除外）。

## 12. Canvas（L4）

**职责**：通用画布能力，**与 Harness 无关**。

- core（纯 TS）：坐标变换、命中测试、选择、命令、布局应用、动画原语；
- view（React）：视口、节点层、连线层、小地图、Controls、ContextMenu；
- NodeContent 由 registry 注入，画布本身不渲染任何业务节点。

```ts
type CanvasNode = { id: string; kind: string; position: Vec2; size?: Size; data: unknown };
type CanvasEdge = { id: string; source: PortRef; target: PortRef; kind?: string };
type CanvasDocument = { nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: Viewport };
```

**不做**：不 import wireclaw、不定义 Harness 语义、不持有运行状态。

## 13. Workbench Framework（L4）

**职责**：把「一个工作台」抽象为「画布 + 文档 + 运行控制」。

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

- 提供运行工具栏、错误面板、命令栈（undo/redo）、自动保存；
- 工作台实例文档见 [data-model.md](./data-model.md)；
- 一个实例可绑定多个 graph；组合优先用 wireclaw 的 subgraph，只有独立多 run 才用 `WorkbenchPlan`。

## 14. Harness Designer（L5）

**职责**：默认工作台，可拖拽、连线、校验、运行、导入导出。

- 节点面板数据来自 wireclaw：`createEditorCatalog(registry, { presets })` → `NodeCatalogEntry[]` + presets；
- `GraphDocument` ⇄ `CanvasDocument` 的 adapter 由设计器实现；
- 布局写入 `GraphDocument.ui`（节点 `ui` 与图级 `ui`），实例级覆盖写入工作台文档；
- 运行前 `graph.validate({ requirements })`，问题以 `HarnessIssue` 展示；
- 导入导出就是 `GraphDocument` 的 JSON，不做私有加工。

## 15. Other Workbenches（L5）

- 运行底层都是 Harness Graph，但以不同动画/交互呈现；
- 必须实现 `WorkbenchDefinition`，不得绕过 Workbench Framework 直接连 RuntimeHost；
- 多 graph 组合由 `WorkbenchPlan` 描述（图引用、输入绑定、输出消费），由 RuntimeHost 编排。

## 16. Import / Export

| 格式 | 内容 | 用途 |
| --- | --- | --- |
| Harness JSON | 单个 `GraphDocument` | 工作流互通、版本管理 |
| `.fhws` | zip：manifest + documents + objects（可选 runs/sessions） | 整工作区迁移 |
| 备份 | 迁移前的自动副本 | 恢复 |

两者不混用：Harness JSON 不包含工作台实例信息，`.fhws` 才包含。

## 17. Observability

- main 日志：分级、按 run 分文件、脱敏（密钥永不出现）；
- run 事件日志：可回放、可导出；
- renderer 错误边界：捕获 UI 异常，上报到 main 日志，不拖垮整个应用。
