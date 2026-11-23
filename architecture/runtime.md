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
  ├─ RunRegistry           运行中的 GraphRun（runId → handle）
  ├─ GraphHost 装配         resolveProvider / tools / attachments /
  │                         onToolApproval / onUserInput / parameters / log
  ├─ EventPipeline          GraphRun.onEvent → RunStore → 节流 → IPC
  ├─ RunStore               meta / events.jsonl / checkpoint.json
  ├─ SessionService        Session + AttachmentFileManager
  └─ ProviderFactory       AppConfig + Secrets → AIProvider
```

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

- FH 层的 `runId` 是稳定标识；wireclaw 每次 `GraphRun` 的引擎 id 记入 `meta.engineRunIds`，不假设二者相同；
- `pause()` 返回 `GraphCheckpoint`；恢复用 `graph.resume(checkpoint, options)`，**必须同时加载原 Graph 定义**；
- `cancel()` 通过 `GraphRun.cancel()`（必要时配合 `AbortSignal`），已完成的节点结果保留在 records 中；
- 并发：每个工作台默认同时 1 个 run；超出时返回 `E_CONFLICT`，不做隐式排队。

## 4. GraphHost 装配

| wireclaw 字段 | FH 来源 | 说明 |
| --- | --- | --- |
| `resolveProvider(providerId)` | AppConfig + Secrets + ProviderFactory | 按 providerId 构造/复用 `AIProvider`，密钥不出 main |
| `tools` | ToolRegistry（wireclaw）+ 本地工具注册 | 工具定义与审批策略由 FH 决定 |
| `attachments` | SessionService → `AttachmentFileManager` → `WorkspaceFileHost` | 按 contentHash 读写 |
| `onToolApproval(request, nodeId)` | IPC 往返到 renderer 审批 UI | 超时默认拒绝 |
| `onUserInput(request, nodeId)` | IPC 往返到 renderer 表单 | 超时/取消返回取消结果 |
| `parameters` | 工作台实例参数 + 运行入参 | 用于 `NodeRequirement(kind: "parameter")` 校验 |
| `log(level, message, data)` | Logging（脱敏） | 不写密钥、不写完整工具参数 |

## 5. 事件管道

```text
GraphRun.onEvent(event)            // wireclaw：同步通知，不可阻塞
  → 规范化（补 runId / 工作台上下文 / seq）
  → RunStore.append(event)         // 追加 JSONL，异步批量落盘
  → EventPipeline.buffer            // 按 run 缓冲
  → 每 16–33ms 或缓冲达到阈值 flush
  → ipc: fh:event { topic: "run", payload: { runId, events[], status } }
```

规则：

- **不重排、不丢弃生命周期事件**（`run:*`、`node:start/end/error/skipped`）；
- `node:stream` 可在批次内按 `(nodeId, port)` 合并文本片段，降低 IPC 次数；
- 缓冲区设上限；renderer 长时间不消费时，只对 `node:stream` 降级（丢弃并记录警告），保证状态正确；
- run 结束立即 flush，并写 `run:end`。

renderer 侧：

- 订阅 `fh:event`，按 `runId` 分发给对应 `RunController`；
- 迟到挂载时用 `run:get` 拉取快照 + `run:list` 补齐；
- `custom` 事件作为工作台动画的领域钩子。

## 6. 暂停、恢复与检查点

- 只在**节点边界**暂停，正在执行的节点会完成；
- 暂停后写 `runs/<runId>/checkpoint.json`；
- 应用优雅退出时对运行中的 run 尝试暂停并落盘；异常退出则下次启动标记 `interrupted`；
- 启动恢复：有 checkpoint → 允许「继续」；无 → 标记失败并保留事件日志供查看。

## 7. 审批与用户输入

```text
main: onToolApproval(request)
  → 生成 requestId，发 fh:event { topic: "approval", payload: request }
renderer: 展示审批 UI
  → fh.approval.respond({ requestId, decision })
main: resolve Promise
```

- 超时（默认 5 分钟，可配置）→ 拒绝，并按策略取消当前 run；
- 用户输入同构，返回 wireclaw 的 `UserInputResult`；
- 关闭窗口/切换工作台时，未决请求自动取消，避免悬挂 Promise。

## 8. Session 与附件

- 每个打开的 Session 对应一个 `AttachmentFileManager`，host 以 contentHash 访问；
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

### invoke 通道

| 命名空间 | 通道 |
| --- | --- |
| app | `app:getInfo` |
| config | `config:get` / `config:update` / `config:reset` |
| secrets | `secrets:has` / `secrets:set` / `secrets:delete`（无 `get`） |
| workspace | `workspace:list` / `create` / `open` / `close` / `readDocument` / `applyCommands` / `export` / `import` |
| blob | `blob:stat` / `blob:delete` |
| session | `session:create` / `open` / `close` / `list` |
| run | `run:start` / `pause` / `resume` / `cancel` / `get` / `list` |
| approval | `approval:respond` |

### 事件 topic

`run`、`workspace`、`config`、`theme`、`approval`、`input`。

### 校验与错误码

- 每个 invoke 在 main 边界做运行时校验（结构 + 范围），拒绝未知 channel 与非法字段；
- 错误码：`E_NOT_FOUND`、`E_INVALID_ARGUMENT`、`E_CONFLICT`、`E_PERMISSION`、`E_IO`、`E_MIGRATION`、`E_RUNTIME`、`E_CANCELLED`、`E_TIMEOUT`、`E_INTERNAL`；
- 错误信息脱敏：密钥、绝对路径中的用户名、完整工具参数不直接透出到 renderer。

## 10. 安全

- `contextIsolation: true`、`sandbox: true`（目标；当前脚手架为 `false`，实现阶段收紧）、`nodeIntegration: false`；
- preload 只暴露白名单 API，不暴露 `ipcRenderer` 本身；
- CSP：`default-src 'self'`；`img-src 'self' data: fh-asset:`；开发态允许 `ws:`（HMR）；
- `fh-asset://` 处理器：校验 workspaceId 格式、哈希格式、工作区已打开，杜绝路径穿越；
- 不加载远程页面；外部链接交给系统浏览器；
- 密钥只在 main；日志与错误统一脱敏。

## 11. 失败与恢复

| 场景 | 行为 |
| --- | --- |
| renderer 重载 | run 继续；重载后订阅事件 + `run:get` 恢复视图 |
| main 崩溃 | 启动时把 `running` 标记为 `interrupted`；有 checkpoint 可恢复 |
| wireclaw 抛错 | 归一化为 `E_RUNTIME`，保留原始 cause 到日志，事件流写 `run:end(status=failed)` |
| IPC 超时 | renderer 展示可重试错误，不静默重发 |
| 工作区迁移失败 | 只读打开 + 明确错误，绝不半写 |

## 12. 可观测性

- 每个 run 一份事件日志（`events.jsonl`），可回放、可导出为诊断包；
- main 日志按 run 分文件、分级、脱敏；
- `traceId` 贯穿 IPC 调用与 run，便于定位问题。
