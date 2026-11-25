# 执行、事件与 IPC

## 1. 为什么在 main 进程执行

| 因素 | 说明 |
| --- | --- |
| Node 能力 | wireclaw 的附件、MCP stdio、本地文件能力都依赖 Node |
| 凭证 | Provider 密钥只在 main，renderer 永不接触明文 |
| 稳定性 | 执行不随 renderer 重载/崩溃而中断 |
| 未来可演进 | RuntimeHost 以接口暴露，后续可迁到 utility process 而不改 contracts |

替代方案（renderer 内执行）被否决：需要把文件与密钥暴露给渲染进程，与安全模型冲突。utility process 作为**后续优化**保留接口位置，不作为一期目标。

## 2. 组件拓扑

```text
RuntimeHost（main）
  ├─ runs: Map<runId, handle>   运行中的 GraphRun + 事件缓冲（内联实现）
  ├─ GraphHost 装配             resolveProvider / tools / attachments /
  │                             onToolApproval / onUserInput / parameters / log
  ├─ 事件节流                    GraphRun.onEvent → RunStore → 16ms 批量 → IPC
  ├─ RunStore                  runs/<runId>/{meta,graph,events,checkpoint}
  └─ SessionService            每个已打开工作区一个 AttachmentFileManager
```

> `RunRegistry` / `EventPipeline` 是目标角色名，当前运行表与节流内联在 `RuntimeHost`。Provider 由 `ProviderRegistry`（`main/services/provider-registry.ts`）从 AppConfig + SecretsStore 构造并缓存，`RuntimeHost.resolveProvider` 直接查询它；配置或密钥变化后 reload。

## 3. 运行生命周期

```text
start → running → completed
         │  ↑
       pause│resume        （pause 在节点边界生效，返回 checkpoint）
         ↓  │
       paused
         │
       cancel → cancelled
         │
       error  → failed
```

- FH 层的 `runId` 是稳定标识；wireclaw 引擎另有自己的 run id，两者不互通，FH 只持久化自身 `runId`（`RunSnapshot` 没有 `engineRunIds` 字段）；
- `pause()` 返回 `GraphCheckpoint` 并落 `checkpoint.json`；进程内用 `GraphRun.resume()`，跨重启用 `run:resume-interrupted` 从 RunStore 装载 graph + checkpoint 后重新 start；
- `cancel()` 通过 `GraphRun.cancel()` + `AbortSignal`，已完成的节点结果保留在 records 中；
- 并发限制（每个工作台 1 个 run、超出返回 `E_CONFLICT`）**尚未实现**：`start()` 不做按工作台/工作区的并发检查，`E_CONFLICT` 目前只用于 pause/resume 状态不满足。

## 4. GraphHost 装配

| wireclaw 字段 | FH 来源 | 说明 |
| --- | --- | --- |
| `resolveProvider(providerId)` | `ProviderRegistry`（AppConfig + SecretsStore） | 按 providerId 返回已构造的 `AIProvider`，密钥不出 main；配置/密钥变更后 reload |
| `tools` | ToolRegistry（wireclaw）+ 本地工具注册 | 工具定义与审批策略由 FH 决定；**当前仍是空 ToolRegistry** |
| `attachments` | SessionService → `AttachmentFileManager` → `WorkspaceFileHost` | 按 contentHash 读写 |
| `onToolApproval(request, nodeId)` | IPC 往返到 renderer 审批对话框 | 超时默认拒绝；UI 已接 |
| `onUserInput(request, nodeId)` | IPC 往返到 renderer 输入对话框 | 超时/取消返回取消结果；UI 已接 |
| `parameters` | 工作台实例参数 + 运行入参 | 用于 `NodeRequirement(kind: "parameter")` 校验；静态校验已支持 catalog 递归下传，**宿主 catalog 来源待 M6** |
| `log(level, message, data)` | Logging（脱敏） | 不写密钥、不写完整工具参数（当前走 `console`） |

## 5. 事件管道

```text
GraphRun.onEvent(event)            // wireclaw：同步通知，不可阻塞
  → 投影为 RunEventDto（custom 带 seq；runId 来自引擎事件）
  → RunStore.append(event)         // 追加 events.jsonl
  → 按 run 缓冲（内存）
  → 固定 16ms flush（RuntimeHost.flushIntervalMs 默认 16）
  → ipc: fh:event { topic: "run", payload: { runId, snapshot, events[] } }
```

规则：

- **不重排、不丢弃生命周期事件**（`run:*`、`node:start/end/error/skipped`）；
- 目标（未实现）：`node:stream` 在批次内按 `(nodeId, port)` 合并文本片段；buffer 设上限，renderer 长时间不消费时只对 `node:stream` 降级丢弃；
- run 结束立即 flush，并写 `run:end`。

renderer 侧：

- 订阅 `fh:event`，只消费当前 `runId` 的批次；启动响应前到达的事件先缓冲（`useDesignerRun`）；
- 事件投影同时更新节点与边：`node:start` 点亮入边、`node:end` 点亮出边、`node:error` 标记相连边、`run:end` 清理 active 边（`designer/core/run-events.ts`）；
- 暂停 / 继续由 `run:pause` / `run:resume` 触发，即使引擎未补发事件，renderer 也会同步节点状态；
- 迟到挂载补齐（`run:get` + `run:list`）**尚未接入**：preload 暴露 `startRun / pauseRun / resumeRun / cancelRun / getRun`，设计器使用前五个与 `onEvent`；
- `custom` 事件作为工作台动画的领域钩子。

## 6. 暂停、恢复与检查点

- 只在**节点边界**暂停，正在执行的节点会完成；
- 暂停后写 `runs/<runId>/checkpoint.json`；
- 异常退出遗留的 `running` 在**打开工作区时**标记为 `interrupted`；
- 目标（未实现）：优雅退出时对运行中的 run 暂停落盘、启动时按 checkpoint 恢复。当前 `resume()` 只在进程内、且必须持有同一个 `RuntimeHost` 实例。

## 7. 审批与用户输入

```text
main: onToolApproval(request)
  → 生成 requestId，发 fh:event { topic: "approval", payload: request }
renderer: 展示审批 UI
  → fh.approval.respond({ requestId, decision })
main: resolve Promise
```

- 超时固定为 5 分钟（`APPROVAL_TIMEOUT_MS`，**不可配置**）→ 默认 `deny`；超时不会取消当前 run；
- 用户输入同构，超时返回 `cancelled: true`；
- 关闭窗口时对未决请求 `settleAll`；切换/关闭工作台时尚未处理未决请求。

## 8. Session 与附件

- 当前每个**已打开的工作区**装配一个 `AttachmentFileManager`（还没有 Session 维度），host 以 contentHash 访问；
- `IFileHost` 的读写由 `WorkspaceFileHost` 落到当前工作区的 BlobStore；
- Session 关闭后保留历史与 refs；GC 由 WorkspaceStore 汇总 roots 后触发；
- 多工作台共享同一 Session 时，引用计数由 refs 管理，不做隐式拷贝。

## 9. IPC 契约

### 传输与封装

- renderer → main：`ipcRenderer.invoke(channel, payload)`；
- main → renderer：单一复用通道 `fh:event`（`{ topic, payload }`），便于 preload 做白名单；
- 统一响应：

```ts
type IpcResult<T> = { ok: true; data: T } | { ok: false; error: FhErrorDto };
type FhErrorDto = { code: FhErrorCode; message: string; details?: unknown; traceId?: string };
```

### invoke 通道（契约 / main 已注册 / preload 已暴露）

| 命名空间 | 通道 | main 注册 | preload 暴露 |
| --- | --- | --- | --- |
| app | `app:getInfo` | ✅ | ❌（renderer 直接用 preload 注入的 versions/platform） |
| window | `window:minimize` / `toggle-maximize` / `close` / `is-maximized` | ✅ | ✅ |
| config | `config:get` / `config:update` / `config:reset` | ✅ | `get`/`update` ✅，`reset` ❌ |
| secrets | `secrets:has` / `secrets:set` / `secrets:delete`（无 `get`） | ✅ | ✅ |
| providers | `providers:list` / `providers:test` | ✅ | ✅ |
| workspace | `workspace:list` / `create` / `open` / `close` / `readDocument` / `saveDocument` / `listDocuments` / `deleteDocument` / `exportHarness` / `listWorkbenches` / `export` / `import` | ✅ | 前十个 ✅，`export`/`import` ❌ |
| workspace | `workspace:applyCommands` | ❌（仅契约，见 ADR-012） | ❌ |
| blob | `blob:stat` / `blob:delete` | ✅ | ❌ |
| session | `session:create` / `open` / `close` / `list` | ❌（仅契约） | ❌ |
| run | `run:start` / `pause` / `resume` / `cancel` / `get` / `list` / `resume-interrupted` | ✅ | ✅ |
| approval | `approval:respond` | ✅ | ✅ |
| input | `input:respond` | ✅ | ✅ |

> **main 注册 ≠ renderer 可用**：preload 只暴露白名单方法，新增通道必须同步 `packages/contracts`、`preload/index.ts` 与 `bridge.d.ts`。

### 事件 topic

契约：`run`、`workspace`、`config`、`theme`、`window`、`approval`、`input`。

当前有发射方：`run`（事件批次）、`window`（窗口状态）、`approval`、`input`；`workspace` / `config` / `theme` 尚未广播。

### 校验与错误码

- 统一运行期校验**尚未实现**：`platform/ipc.ts` 只做统一响应与错误归一化（`FhError` 保留错误码，其他异常降级 `E_INTERNAL`），参数由各 handler 自行校验；未知 channel 没有 handler；
- 错误码：`E_NOT_FOUND`、`E_INVALID_ARGUMENT`、`E_CONFLICT`、`E_PERMISSION`、`E_IO`、`E_MIGRATION`、`E_RUNTIME`、`E_CANCELLED`、`E_TIMEOUT`、`E_INTERNAL`；
- 错误信息脱敏：密钥、绝对路径中的用户名、完整工具参数不直接透出到 renderer。

## 10. 安全

- `contextIsolation: true`、`sandbox: false`（目标为 `true`，实现阶段收紧）、`nodeIntegration` 未显式设置（Electron 默认 `false`）；
- preload 只暴露白名单 API，不暴露 `ipcRenderer` 本身；
- CSP（`renderer/index.html`）：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: fh-asset:; connect-src 'self' ws:`；`ws:` 目前**在所有环境**都允许（为 HMR 保留），打包前应收紧；
- `fh-asset://` 处理器：校验 workspaceId 非空、哈希为 64 位十六进制、工作区已打开（否则 404），杜绝路径穿越；
- 目标（未实现）：拦截外部链接并交给系统浏览器；当前没有 `setWindowOpenHandler` / `will-navigate`；
- 密钥只在 main；日志与错误统一脱敏（脱敏目前依赖各调用点，尚未统一）。

## 11. 失败与恢复

| 场景 | 行为 |
| --- | --- |
| renderer 重载 | run 继续；重载后订阅事件 + `run:get` 恢复视图 |
| main 崩溃 | 打开工作区时把遗留 `running` 标记为 `interrupted`；Diagnostics 可从 RunStore 的 graph + checkpoint 恢复 |
| wireclaw 抛错 | 归一化为 `E_RUNTIME`，保留原始 cause 到日志，事件流写 `run:end(status=failed)` |
| IPC 超时 | renderer 展示可重试错误，不静默重发 |
| 工作区迁移失败 | 只读打开 + 明确错误，绝不半写 |

## 12. 可观测性

- 每个 run 一份事件日志（`events.jsonl`），可回放；
- 目标（未实现）：导出诊断包；main 日志按 run 分文件、分级、脱敏（当前为 `console.*`）；
- 目标（未实现）：`traceId` 贯穿 IPC 与 run（契约只留了可选字段，IPC 层未填）。

## 13. 当前实现（M3 之后）

| 能力 | 实现 |
| --- | --- |
| 执行 | `RuntimeHost` 反序列化 `GraphDocument` → `Graph.run()`；`cancel` 走 `AbortSignal` + `GraphRun.cancel()` |
| 暂停 / 恢复 | `GraphRun.pause() → GraphCheckpoint`，暂停时落 `checkpoint.json`；`GraphRun.resume()` 进程内恢复；TitleBar 提供暂停 / 继续 / 取消 |
| 运行可视化 | 节点状态 + 边 active/error 投影；问题面板汇总校验、失效连线与运行错误，可定位到节点 |
| 多文档 | `workspace:listDocuments` / `deleteDocument`；标题栏文档菜单切换、新建、重命名、复制、删除、导入导出 |
| 工作台 | `workspace:listWorkbenches`；实例文档存 `documents/workbenches`；WorkbenchHost 按 `type` 渲染 Designer / 节点清单 |
| 事件 | `GraphEvent → RunEventDto` 投影；按 run 缓冲，16ms 或 run 结束时批量广播 |
| 持久化 | `runs/<runId>/{meta,graph,events,checkpoint}`；打开工作区时把遗留 `running` 标为 `interrupted` |
| 审批 | main 发 `approval` 事件 → renderer `approval:respond`；5 分钟超时默认 `deny` |
| 用户输入 | 同上，超时默认 `cancelled: true` |
| 附件 | `SessionService` 为每个工作区装配 `AttachmentFileManager`，host 以 contentHash 访问 |

**已知限制**

- Agent 节点已有 Provider / 审批 / 输入 UI，但 `ToolRegistry` 仍为空，真实工具尚未注册；
- 运行前 requirements catalog 尚未从 ProviderRegistry 注入，校验阶段不会提前拦截缺失 Provider；
- wireclaw checkpoint 尚未携带 graph hash / node type version，恢复时按 graphId 匹配；
- 受限环境写盘不可用时，RunStore 退化为内存态（日志告警一次），执行本身不受影响。
