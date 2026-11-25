# 数据模型与存储

## 1. 三类文档

| 文档 | 所有者 | 可移植性 | 内容 |
| --- | --- | --- | --- |
| **Harness Graph**（`GraphDocument`） | wireclaw 格式 | 高：单独导出/导入 | 节点、连线、参数、事件、图级 `ui` |
| **Workbench Instance**（M5 起） | FH | 中：随 `.fhws` 迁移 | 绑定哪些 graph、实例级布局、参数、运行计划 |
| **Workspace manifest** | FH | 中：随 `.fhws` 迁移 | 工作区元信息、设置、schema 版本 |

关键约束：

- `GraphDocument` 由 wireclaw 序列化/反序列化，FH **不修改其字段语义**；
- 工作台实例只**引用** graph（`graphId`），不内联 graph 内容；
- 删除引用的检查：M7.1 起 `deleteDocument` 会扫描 `documents/workbenches`，仍被实例引用的 graph 返回 `E_CONFLICT`；删除工作台实例本身不反向检查。

## 2. 工作区目录

```text
<workspaceRoot>/<name-slug>-<shortId>/
  manifest.json
  lock                        # open 时写入 { pid, startedAt, appVersion }
  documents/
    harness/
      <documentId>.json       # GraphDocument；M4 起一个工作区可有多份
    workbenches/
      <instanceId>.json       # WorkbenchInstanceDocument（M5 起）
  objects/
    <hash[0:2]>/<hash>        # BlobStore 内容文件
    index.json                # 元数据 + 引用（可重建）
  runs/
    <runId>/
      meta.json
      graph.json
      events.jsonl
      checkpoint.json
  sessions/                   # 工作区会话（SessionStore，M6.2 起）
```

- 目录名带 shortId 便于人眼识别，**id 本身才是主键**；
- `objects/index.json` 丢失时可从 `objects/` 目录重建（文件名即哈希）；
- 文档/manifest 的写入都经过 `WorkspaceStore`；`runs/` 由 `RunStore`、`objects/` 由 `BlobStore` 直写；
- **`backups/` 目前不存在**：迁移机制未实现，等 M4 做迁移时再加。

## 3. manifest.json

```json
{
  "schemaVersion": 1,
  "id": "ws_6f1a0c9b2d34",
  "name": "我的工作台",
  "createdAt": "2026-11-24T00:00:00.000Z",
  "updatedAt": "2026-11-24T00:00:00.000Z",
  "settings": {}
}
```

- `id` 由 `ws_` + 12 位随机十六进制组成；目录名是 `slug(name)-id.slice(-8)`，与 id 无关；
- `settings` 是工作区级自由对象，当前恒为 `{}`；应用级设置放 AppConfig（见 [modules.md](./modules.md)）；
- 没有 `runtime.wireclawVersion` 字段；`parseManifest` 重建对象时会丢弃未知字段。

## 4. Harness Graph 文档（对外称“工作流”）

> UI / 文档中面向用户的名称统一为 **工作流（workflow）**；`GraphDocument` 仅作为 wireclaw 与 contracts 的内部类型名保留。

即 wireclaw 的 `GraphDocument`：

```json
{
  "version": 1,
  "id": "main",
  "title": "主工作流",
  "nodes": [
    {
      "id": "constant",
      "type": "core.constant",
      "typeVersion": 1,
      "config": { "value": { "type": "text", "text": "hello from flowharness" } },
      "ui": { "x": 96, "y": 140 }
    },
    {
      "id": "output",
      "type": "core.output",
      "typeVersion": 1,
      "ui": { "x": 456, "y": 140 }
    }
  ],
  "edges": [
    { "from": { "nodeId": "constant", "port": "value" }, "to": { "nodeId": "output", "port": "text" } }
  ],
  "ui": { "viewport": { "x": 24, "y": 28, "zoom": 1 } }
}
```

要点：

- **连线没有独立 id**，由 `from` + `to` 的端口地址唯一确定；画布侧用稳定 key（如 `n1:text->n2:in`）作为边 id，不要另造一份会漂移的 id；
- **布局放在 `ui`**：wireclaw 明确约定 `ui` 供设计器存放坐标、运行时忽略。因此布局随 graph 一起导出/导入，天然可移植；
- 节点级 `ui` 与图级 `ui` 都是自由 `JsonObject`，FH 需定义自己的子结构并做版本兼容；
- 节点 `type` 必须使用 wireclaw 内建名（`HarnessBuiltinNodeType`，如 `core.constant` / `core.model.call` / `core.log`），不是显示名；
- `inputs` / `requires` 由 wireclaw 管理，FH 只透传。

## 5. Workbench Instance 文档（M5 已实现）

```json
{
  "schemaVersion": 1,
  "id": "wb_01J9Z2K5T4",
  "type": "harness-designer",
  "title": "主工作台",
  "graphs": [
    { "graphId": "graph-01J9Z2M...", "role": "main" }
  ],
  "plan": null,
  "mode": "design",
  "runId": null,
  "sessionId": null,
  "layout": {
    "viewport": { "x": 0, "y": 0, "zoom": 1 },
    "overrides": { "n1": { "x": 320, "y": 160 } }
  },
  "parameters": {},
  "createdAt": "2026-11-24T00:00:00.000Z",
  "updatedAt": "2026-11-24T00:00:00.000Z"
}
```

- `layout.overrides` 只存**实例级**偏移（例如同一 graph 在多工作台里摆放不同）；默认布局以 graph 的 `ui` 为准；
- `mode / runId / sessionId` 由工作台保存当前阶段与运行上下文；旧实例缺省按 `mode: "design"`、null 处理；
- `plan` 为空表示单图；`plan-runner` 用 `graphs` 顺序执行独立 run（bindings 暂未使用）；
- `parameters` 是该实例的运行入参默认值。

> 现状（M5）：`workbench/instance.ts` 负责创建 / 校验实例，`documents/workbenches/<id>.json` 通过通用文档 API 读写，`workspace:listWorkbenches` 返回摘要；每个工作区自动创建一个 `harness-designer` 实例，并记录主图绑定。`plan-runner` 使用 `plan.graphs` 顺序执行独立 run；`plan.bindings` 与 `layout.overrides` 尚未接线。

## 6. Blob 与附件

```json
// objects/index.json
{
  "version": 1,
  "objects": {
    "9f2c...e1": {
      "name": "diagram.png",
      "mimeType": "image/png",
      "size": 12345,
      "createdAt": "2026-11-24T00:00:00.000Z",
      "refs": [
        { "kind": "session", "id": "s_01J9Z..." },
        { "kind": "run", "id": "run_01J9Z..." }
      ]
    }
  }
}
```

- 内容去重：同一 hash 只存一份；
- 引用表与 GC 的**接口已实现**（`addRef` / `removeRef` / `gc`），但生产路径尚未接线：`objects/index.json` 的 `refs` 目前恒为空，`gc()` 只在单测里调用；
- 目标：删除会话/run 前先移除 refs，再由 WorkspaceStore 汇总 roots 触发 `AttachmentFileManager.gc(referencedHashes)`；
- UI 读取走 `fh-asset://<workspaceId>/<hash>`，不把字节塞进 IPC（已实现）。

## 7. Run 记录

```text
runs/<runId>/meta.json        # RunSnapshot（与 IPC 快照同构）
runs/<runId>/graph.json       # 运行时的 GraphDocument 快照
runs/<runId>/events.jsonl     # RunEventDto，逐行追加
runs/<runId>/checkpoint.json  # GraphCheckpoint v2（graphHash/nodeVersions），仅显式暂停时写入
```

```json
// meta.json（RunSnapshot，没有 schemaVersion）
{
  "runId": "run_...",
  "graphId": "main",
  "status": "completed",
  "startedAt": 1732435200000,
  "endedAt": 1732435260000
}
```

- `error` 只在失败时出现，不带 `schemaVersion`；
- `events.jsonl` 每行一个 `RunEventDto`，追加写；
- `checkpoint.json` 只在**显式暂停**时产生：引擎不提供周期性 checkpoint，也没有退出时自动落盘；
- checkpoint v2 保存 graphHash / nodeVersions；恢复按设计需要 checkpoint + 原 Graph 定义，当前可从 RunStore 跨重启恢复并校验图定义。

## 8. 会话（M6.3 已实现回放）

```text
sessions/<sessionId>/session.json     # SessionRecord：摘要 + wireclaw SessionData + attachments
```

- `history` 直接存储 wireclaw `SessionData`（`version / id / messages / isArchived`），FH 不复制消息模型；
- `messageCount` 与 `attachments` 由主进程从历史派生，附件仍是 Blob contentHash 引用，会话不内联二进制；
- 会话历史与附件索引分离，保证 `AttachmentFileManager` 的 GC 有可靠 roots。

> 现状（M6.3）：`SessionStore` 按工作区写入 `sessions/<id>/session.json`，支持默认会话、创建 / 列表 / 读取 / 保存；保存时用 `SessionSerializer` 校验并规范化历史，M6.2 的空数组在读取/保存时迁移为空会话。renderer 的「会话历史」视图通过 `session:open` 读取记录、回放消息 / 工具调用，并用 `blob:stat` + `fh-asset://` 展示附件。

## 9. 导入 / 导出

### Harness JSON（M4 已实现）

单个 `GraphDocument` 的 JSON 文件，供工作流互通与版本管理。不包含工作台实例信息。设计器的文档菜单提供「导入 Harness JSON」与「导出 JSON（含布局 / 无布局）」；导入总是创建新文档并重新生成 id，导出经 main 的原生保存对话框写入用户选择的位置。

### `.fhws`

zip 包（当前实际内容）：

```text
export.json            # { format: "fhws", formatVersion: 1, exportedAt, appVersion }
manifest.json
documents/**
objects/**             # 默认包含；ExportOptions.includeObjects=false 可排除（IPC 尚未接线）
```

- 导出**不包含** `runs/` 与 `sessions/`；
- 导入时校验 `formatVersion`（更高版本报 `E_MIGRATION`）后**直接写入最终目录**，没有临时目录、也没有迁移；
- id 冲突策略：导入一律新建 workspace id（导入为副本），没有「合并/覆盖」选项。

## 10. 版本与迁移（迁移未实现）

- `manifest.schemaVersion` 为 1；`GraphDocument.version` 由 wireclaw 管理，两者独立；
- 迁移函数表目前**不存在**：只校验 manifest / archive 版本不能高于当前支持值，否则抛 `E_MIGRATION`；
- 目标：迁移前写 `backups/manifest.<timestamp>.json`；迁移失败以**只读**方式打开（当前没有只读模式）；
- `GraphDocument.version` 的迁移归 wireclaw；FH 只负责自己的文档。

## 11. 写入与锁

- **原子写**：写 `<file>.tmp` → flush → rename；Windows 上 rename 遇到占用（杀软/索引器）时重试并退避；
- **单写者**：Electron 单实例锁**未启用**（受限环境无法创建 Chromium 单例锁）；工作区 `lock` 文件写 `pid / startedAt / appVersion`，陈旧判定只看 pid 是否存活，没有超时逻辑；
- **一致性**：先写内容文件，再写索引；索引损坏时按目录重建；
- **自动保存**：renderer 侧 debounce 400ms，卸载/切换工作区时 flush；窗口直接关闭时最后 <400ms 的编辑仍可能丢失（无 main-renderer 退出握手）。

## 12. M7 目标：Session 树与 RunResult（M7.2 / M7.4 已落地）

> M7.2 已实现递归目录、`SessionRecord` v2、草稿目录与迁移；M7.4 已实现 RunResult 采集 / 校验 / 持久化、运行结果面板、run 会话保存与回放；草稿目录可在 Session 树文件夹右键切换。

### 12.1 Session 目录树

```text
sessions/
  <folderId>/
    folder.json            # { id, title, createdAt, updatedAt }
    ...                    # 可继续嵌套 folder
    <sessionId>/
      session.json         # SessionRecord v2
```

- folder id（`fld_...`）作目录名，用户标题只放 `folder.json`，避免标题进路径；
- session id（`ses_...`）作目录名；根目录也允许直接放 session；
- 草稿目录：首次读取树时自动创建「草稿」并写入 `manifest.settings.draftSessionFolderId`；草稿目录及其祖先禁止删除；
- 旧 `sessions/<id>/session.json` 即根级 session；v1 记录在读取时规范化为 v2，保存时写 v2。

### 12.2 SessionRecord v2

```json
{
  "schemaVersion": 2,
  "id": "ses_...",
  "kind": "conversation",
  "title": "主会话",
  "folderId": "fld_...",
  "status": "completed",
  "createdAt": "2026-11-26T00:00:00.000Z",
  "updatedAt": "2026-11-26T00:00:00.000Z",
  "messageCount": 4,
  "entryCount": 0,
  "history": { "version": 2, "id": "ses_...", "messages": [], "isArchived": false },
  "attachments": []
}
```

- `kind: "conversation"`：`history` 为 wireclaw `SessionData`，`messageCount` 有效；
- `kind: "run"`：`history` 为 wireclaw `RunResult`，`entryCount` 有效；
- `attachments` 从两种 history 的附件引用派生；
- v1 记录迁移为 `kind: "conversation"`。

### 12.3 RunResult v1（wireclaw）

```ts
type RunResult = {
  version: 1;
  runId: string;
  graphId: string;
  status: GraphRunStatus;
  startedAt: number;
  endedAt: number;
  input?: GraphRunInput;
  outputs: NodeOutputValues;
  entries: RunResultEntry[];
  error?: string;
};

type RunResultEntry =
  | {
      kind: "model-call";
      id: string;
      nodeId: string;
      nodeType: string;
      graphPath?: string[];
      providerId: string;
      modelId: string;
      mode: "chat" | "generate";
      status: "completed" | "failed";
      startedAt: number;
      endedAt: number;
      input: { prompt: string; system?: string; attachments?: AttachmentRef[] };
      output?: {
        text: string;
        thinking?: string;
        attachments?: AttachmentRef[];
        usage?: ChatUsage;
        stopReason?: string;
        failureReason?: string;
      };
      error?: string;
    }
  | {
      kind: "session";
      id: string;
      nodeId: string;
      nodeType: string;
      graphPath?: string[];
      providerId: string;
      modelId: string;
      status: "completed" | "failed";
      startedAt: number;
      endedAt: number;
      session: SessionData;
      error?: string;
    };
```

- RunResult 归 wireclaw；`GraphRunResult` 增加 `graphId` / `entries`，由 `createRunResult(result, input?)` 生成版本化文档；FH 只负责持久化、展示与「保存为 session」；
- `runs/<runId>/result.json` 与 meta / graph / events / checkpoint 同级；
- partial RunResult 暂不写 checkpoint。
- 实现备注（M7.4）：`RunResultSerializer` 负责 JSON 校验与规范化（session entry 复用 `SessionSerializer`）；`ModelCall` / `AgentRun` 通过 `NodeContext.collect` 提交条目，`Subgraph` / `Loop` / `ForEach` 让 `graphPath` 冒泡；FH 在持久化前把 `runId` 改写为自身稳定 runId，`run:result` 支持跨重启读取；`SessionStore.createRunSession` 负责派生 `entryCount` 与附件指纹。

### 12.4 文档绑定

- `WorkbenchInstance.graphs` 是权威绑定；左栏切换文档时同步 primaryGraph；
- 删除 graph 前检查实例引用；
- 运行模式的 Session 树是 workspace 级，不按实例隔离。
- M7.4.2：运行结束后 Agent / ModelCall 消息可追加到当前选中的 conversation 会话（`session:appendRun`）；run session 仍只保存 `RunResult`，实例只记录 `sessionId`，不内联消息。
