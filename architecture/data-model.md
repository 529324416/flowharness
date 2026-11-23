# 数据模型与存储

## 1. 三类文档

| 文档 | 所有者 | 可移植性 | 内容 |
| --- | --- | --- | --- |
| **Harness Graph**（`GraphDocument`） | wireclaw 格式 | 高：单独导出/导入 | 节点、连线、参数、事件、图级 `ui` |
| **Workbench Instance** | FH | 中：随 `.fhws` 迁移 | 绑定哪些 graph、实例级布局、参数、运行计划 |
| **Workspace manifest** | FH | 中：随 `.fhws` 迁移 | 工作区元信息、设置、schema 版本 |

关键约束：

- `GraphDocument` 由 wireclaw 序列化/反序列化，FH **不修改其字段语义**；
- 工作台实例只**引用** graph（`graphId`），不内联 graph 内容；
- 一个 graph 可被多个工作台实例引用；删除时需检查引用。

## 2. 工作区目录

```text
<workspaceRoot>/<name-slug>-<shortId>/
  manifest.json
  lock
  documents/
    harness/
      <graphId>.json          # GraphDocument
    workbenches/
      <instanceId>.json       # WorkbenchInstanceDocument
  objects/
    <hash[0:2]>/<hash>        # BlobStore 内容文件
    index.json                # 元数据 + 引用（可重建）
  runs/
    <runId>/
      meta.json
      events.jsonl
      checkpoint.json
  sessions/
    <sessionId>/
      session.json
      attachments.json
  backups/
    manifest.<timestamp>.json
```

- 目录名带 shortId 便于人眼识别，**id 本身才是主键**；
- `objects/index.json` 丢失时可从 `objects/` 目录重建（文件名即哈希）；
- 所有写入都在 `WorkspaceStore` 内完成，其他模块不得直接写文件。

## 3. manifest.json

```json
{
  "schemaVersion": 1,
  "id": "ws_01J9Z2K5T3",
  "name": "我的工作台",
  "createdAt": "2026-11-24T00:00:00.000Z",
  "updatedAt": "2026-11-24T00:00:00.000Z",
  "settings": {
    "defaultWorkbenchId": "wb_01J9Z2K5T4"
  },
  "runtime": {
    "wireclawVersion": "0.1.1"
  }
}
```

- `wireclawVersion` 仅用于诊断与迁移提示，不作为强制校验；
- 工作区级设置放 `settings`，应用级设置放 AppConfig（见 [modules.md](./modules.md)）。

## 4. Harness Graph 文档

即 wireclaw 的 `GraphDocument`：

```json
{
  "version": 1,
  "id": "graph-01J9Z2M...",
  "title": "示例工作流",
  "nodes": [
    {
      "id": "n1",
      "type": "agent-run",
      "typeVersion": 1,
      "config": { "providerId": "deepseek", "model": "deepseek-chat" },
      "ui": { "x": 120, "y": 80, "width": 220 }
    }
  ],
  "edges": [
    { "from": { "nodeId": "n1", "port": "text" }, "to": { "nodeId": "n2", "port": "in" } }
  ],
  "ui": { "viewport": { "x": 0, "y": 0, "zoom": 1 } }
}
```

要点：

- **连线没有独立 id**，由 `from` + `to` 的端口地址唯一确定；画布侧用稳定 key（如 `n1:text->n2:in`）作为边 id，不要另造一份会漂移的 id；
- **布局放在 `ui`**：wireclaw 明确约定 `ui` 供设计器存放坐标、运行时忽略。因此布局随 graph 一起导出/导入，天然可移植；
- 节点级 `ui` 与图级 `ui` 都是自由 `JsonObject`，FH 需定义自己的子结构并做版本兼容；
- `inputs` / `requires` 由 wireclaw 管理，FH 只透传。

## 5. Workbench Instance 文档

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
- `plan` 为空表示单图；多图组合时填写（见 [ui.md](./ui.md)）；
- `parameters` 是该实例的运行入参默认值。

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
- 引用表用于 GC：`AttachmentFileManager.gc(referencedHashes)` 的 roots 由 WorkspaceStore 汇总；
- 删除会话/运行时先移除 refs，再触发 GC；
- UI 读取走 `fh-asset://<workspaceId>/<hash>`，不把字节塞进 IPC。

## 7. Run 记录

```text
runs/<runId>/meta.json
runs/<runId>/events.jsonl
runs/<runId>/checkpoint.json
```

```json
// meta.json
{
  "schemaVersion": 1,
  "runId": "run_01J9Z...",
  "graphId": "graph-01J9Z...",
  "workbenchId": "wb_01J9Z...",
  "status": "completed",
  "startedAt": 1732435200000,
  "endedAt": 1732435260000,
  "error": null
}
```

- `events.jsonl` 每行一个 `GraphEvent`，追加写；
- `checkpoint.json` 保存 wireclaw `GraphCheckpoint`，仅在暂停/优雅退出时产生（引擎不提供周期性 checkpoint）；
- 恢复时把 checkpoint 与**原 Graph 定义**一起加载（wireclaw 明确要求），所以 run 记录必须引用 `graphId` 而不是只存快照。

## 8. 会话

```text
sessions/<sessionId>/session.json     # wireclaw 会话历史序列化结果
sessions/<sessionId>/attachments.json # 引用到的 contentHash 列表
```

- 会话历史与附件索引分离，保证 `AttachmentFileManager` 的 GC 有可靠 roots；
- 会话不内联二进制，只引用 Blob。

## 9. 导入 / 导出

### Harness JSON

单个 `GraphDocument` 的 JSON 文件，供工作流互通与版本管理。不包含工作台实例信息。

### `.fhws`

zip 包：

```text
export.json            # { format: "fhws", formatVersion: 1, exportedAt, appVersion }
manifest.json
documents/harness/*.json
documents/workbenches/*.json
objects/**             # 可选：不含对象时体积更小
runs/                  # 可选
sessions/              # 可选
```

- 导入时校验 `formatVersion`，先在临时目录解包、校验、迁移，再整体移入；
- id 冲突策略：默认**新建新 id**（导入为副本），后续可提供「合并/覆盖」选项；
- 导出默认不含 runs（运行数据体积大且敏感），按需勾选。

## 10. 版本与迁移

- `manifest.schemaVersion` 与各文档 `schemaVersion` 独立；
- 迁移函数登记在 `{ from, to, migrate }` 表中，按序执行；
- 迁移前写 `backups/manifest.<timestamp>.json`；
- 迁移失败：工作区以**只读**方式打开并展示错误，绝不半写；
- `GraphDocument.version` 的迁移归 wireclaw；FH 只负责自己的文档。

## 11. 写入与锁

- **原子写**：写 `<file>.tmp` → flush → rename；Windows 上 rename 遇到占用（杀软/索引器）时重试并退避；
- **单写者**：Electron 单实例锁 + 工作区 `lock` 文件（pid、startedAt、appVersion）；pid 不存在或超时视为陈旧锁；
- **一致性**：先写内容文件，再写索引；索引损坏时按目录重建；
- **自动保存**：renderer 侧 debounce（≈400ms），关闭窗口/切换工作台时强制 flush。
