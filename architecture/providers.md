# Provider 与 API Key

> 状态：M9.0 ~ M9.5 已落地（决策、契约、数据层、迁移、运行时解析、健康探测、IPC、设置页、节点下拉、健康标记与 Provider 节点 / 连线）。
> wireclaw 侧的 Provider 实现细节见 [`provider` 架构文档](../../vendor/wireclaw/architecture/providers.md)（AIProvider / ModelProvider / 模型能力）。

## 1. 分层

FH 不实现模型协议，只负责“选择哪个 Provider、用哪个密钥、从哪个模型目录里选模型”。

```text
GraphDocument
  core.model.config = { providerId, modelId }
        │
        ▼
ProviderProfile (FH 应用级)
  id / adapter / apiKeyId / baseUrl / enabled / models[]
        │
        ├─ apiKeyId → SecretsStore(secrets.bin) → 明文只在 main
        └─ adapter → wireclaw Provider 类 + 工厂
        ▼
AIProvider（wireclaw）
  DeepSeekProvider / QwenChatProvider / QwenImageProvider /
  MiniMaxChatProvider / MiniMaxH3ImageProvider / MiniMaxH3VideoProvider /
  OllamaProvider
```

- 图里只出现 `providerId`（profile id）与 `modelId`；
- API Key、密文与密钥指纹不进入 `GraphDocument`、节点预设库或 `.fhws`；
- 适配器（adapter）同时表达协议与能力：同一协议可以有 chat / image / video 多个 profile。

## 2. 数据

### 2.1 ApiKeyRecord

| 字段 | 说明 |
| --- | --- |
| `id` | `key_...`；同时是 `secrets.bin` 的条目键 |
| `protocol` | `deepseek` / `qwen` / `minimax` / `ollama` |
| `label` | 用户可读名称 |
| `baseUrl?` | 区域 / 自建端点 |
| `status` | `unverified` / `active` / `invalid` / `quota` / `network` |
| `fingerprint?` | SHA-256 前 12 位，仅用于识别 |
| `lastCheckedAt?` / `lastError?` | 最近一次验证时间与归一化错误 |

明文密钥只存在 `%APPDATA%/FlowHarness/secrets.bin`；renderer 永远拿不到。`invalid` 只由 401/403 触发；402/429 记为 `quota`，不把 key 判死。

### 2.2 ProviderProfile

| 字段 | 说明 |
| --- | --- |
| `id` | 写入 `GraphDocument.providerId`；迁移保留旧 id |
| `adapter` | `deepseek.chat` / `qwen.chat` / `qwen.image` / `minimax.chat` / `minimax.image` / `minimax.video` / `ollama.chat` |
| `apiKeyId?` | 可为空（Ollama）；必须与 adapter 的协议一致 |
| `baseUrl?` | 覆盖适配器默认端点 |
| `defaultModelId?` | 建议模型；节点仍以自身 `modelId` 为准 |
| `enabled` | 禁用后运行解析失败并按节点警告展示 |
| `models` | 持久化模型目录（id / name / 能力摘要） |
| `modelsFetchedAt?` / `modelsSource?` | 目录时间与来源（api / builtin / manual） |

### 2.3 存储

- `%APPDATA%/FlowHarness/provider-library.json`，`schemaVersion 1`，`ProviderLibraryStore` 原子写；
- 读取宽容（坏条目丢弃、失效 key 引用清空、损坏备份 `.corrupt-*`），写入严格（重复 id / 缺失 key / 协议不匹配直接拒绝）；
- 更高 `schemaVersion` 返回 `E_MIGRATION`，不覆盖未来数据；
- 应用级数据，不进入 workspace / `.fhws`；后续用户配置统一导出时作为独立模块打包。

## 3. 适配器矩阵

| adapter | 协议 | wireclaw 类 | key | 目录来源 |
| --- | --- | --- | --- | --- |
| `deepseek.chat` | deepseek | `DeepSeekProvider` | 必需 | `GET /models` |
| `qwen.chat` | qwen | `QwenChatProvider` | 必需 | `GET /models` |
| `qwen.image` | qwen | `QwenImageProvider` | 必需 | 内置 / 手动（无统一目录） |
| `minimax.chat` | minimax | `MiniMaxChatProvider` | 必需 | `GET /v1/models` |
| `minimax.image` | minimax | `MiniMaxH3ImageProvider` | 必需 | 内置 / 手动 |
| `minimax.video` | minimax | `MiniMaxH3VideoProvider` | 必需 | 内置 / 手动 |
| `ollama.chat` | ollama | `OllamaProvider` | 不需要 | `GET /api/tags` |

健康探测优先复用目录端点；没有目录的生成适配器用同协议 chat 探针验证 key，目录取 Provider 的 `modelInfo`。启动不联网，模型目录刷新是显式动作。

## 3.1 运行时解析（M9.2）

- `ProviderRegistry.init(legacyProviders)`：读库 → 构建实例；库为空时在内存迁移旧 `AppConfig.providers` 并尽力落盘；
- `get(providerId)`：返回已构造的 `AIProvider`，缺 key / 禁用 / 工厂失败返回 `undefined`；
- `refreshModels(profileId)`：chat 拉目录并写回 profile，生成适配器读 `modelInfo`；成功把 key 标 `active`，失败按 401/402/网络分类写回 key 健康；
- `addKey` / `revalidateKey` / `replaceKey` / `deleteKey` 与 profile CRUD 通过 IPC 暴露；
- `node:error` 由失败节点回溯 `model` 输入边找到 `core.model` 的 `providerId`，并沿错误 `origin` 链读取 `httpStatus`；401/403/402/429 回写 key 健康并广播 `provider` topic；
- 设置页使用 `provider:library` / `provider:key:*` / `provider:profile:*` / `provider:models:refresh`；旧 `providers:list` / `providers:test` / `secrets:*` 已在 M9.3 移除；
- 受限环境（AppData 只读 / 权限不足）：secrets 与 library 的修改会回退到 main 内存，当前会话继续可用；`ProviderLibraryView.persistenceError` 与设置页警告说明未落盘，重启后丢失。

## 4. 健康状态与节点提示

- `unverified`：尚未验证 / 网络不可用；节点黄色提示，允许运行；
- `active`：最近一次验证通过；
- `invalid`：401/403；节点红色三角提示，仍允许选择与尝试运行；
- `quota`：402/429；只提示额度 / 限流，不把 key 判失效；
- `network`：超时 / 端点不可达；按未验证处理。

节点标题右侧的健康标记由 `collectDesignerProblems` 的 provider 问题源投影（M9.4）：缺 profile / model 为 error，key invalid / unverified 为 warning。预检只阻断 error，不阻断 stale key 的运行尝试。

M9.6 起 Model Call 还会检查目录 `capabilities`：chat 模式要求模型支持 chat，generate 模式要求支持 generate，并检查 `modality` 是否在 `capabilities.outputs` 中；目录没有 capabilities 时保持宽容，不误报旧模型。

## 4.1 Provider 节点与连线（M9.5）

- wireclaw 新增 `provider` 端口值类型：`HarnessValue = { type: "provider"; provider: { providerId } }`；`isPortTypeCompatible` / `isHarnessValueCompatible` 支持 provider ↔ provider；
- `core.provider`：无输入，单 `provider` 输出；config 只含 `providerId`，执行时输出引用，不持有 Provider 实例或密钥；
- `core.model`：新增可选 `provider` 输入；连接存在时以连接值优先，未连接回退 config.providerId；configSchema 只要求 `modelId`；
- 图校验由 wireclaw `Graph.validate` 保证 Provider → Model 端口类型兼容；checkpoint / 序列化沿用现有 Graph 结构，不新增字段；
- 设计期健康：Provider 节点自身检查 profile / 启用 / key；连接后的 Model 不再重复检查 profile，由 Provider 节点负责，Model 只检查 modelId / 目录；
- 节点摘要：Provider 节点显示 Profile 标签；连接后的 Model 显示“来源 Profile · modelId”；
- 右键「添加节点」的落点换算到画布坐标，避免平移 / 缩放后把节点插到视口外。

## 5. 迁移

1. **M9.1（影子迁移）**：库文件不存在时，从 `AppConfig.providers`（或全新 v2 的默认 4 条）生成 profile（保留 id），把旧 `secrets.bin` 条目复制到 `key_<providerId>`。
2. **M9.3（切换）**：AppConfig v2 移除 `providers`；只有库文件确认存在后才 finalize，旧 secrets 镜像在新 key 存在后删除；Provider 库成为唯一事实源。

旧 graph 不需要迁移：`providerId` 原样保留。导入缺 profile 的 `.fhws` 时，节点显示 provider 警告，但文档本身可正常打开。
