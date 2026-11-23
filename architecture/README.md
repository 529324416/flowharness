# FlowHarness 架构文档

> 状态：**目标架构已定稿**（2026-11-24）。当前代码仍是可运行的最小脚手架，实现进度见文末。
> 术语：FH = FlowHarness。

## 阅读顺序

1. [overview.md](./overview.md) — 分层、依赖规则、进程模型
2. [modules.md](./modules.md) — 每个模块的职责与契约
3. [data-model.md](./data-model.md) — 工作区数据、文档、导入导出
4. [runtime.md](./runtime.md) — 执行、事件、IPC、安全
5. [ui.md](./ui.md) — React、画布、工作台框架、设计器
6. [decisions.md](./decisions.md) — 已定稿的架构决策（ADR）

## 六个已定稿的关键决策

| # | 决策 | 理由摘要 |
| --- | --- | --- |
| 1 | **Harness 在 main 进程执行** | Node 能力（文件、MCP stdio）、凭证隔离、renderer 崩溃不影响运行；未来可平滑迁到 utility process |
| 2 | **BlobStore 内容寻址 + WorkspaceFileHost 桥** | wireclaw 的 `IFileHost` 本来就是 contentHash 维度；去重/索引/GC 由 `AttachmentFileManager` 负责，FH 不重复实现 |
| 3 | **画布 = 无框架 headless core + 薄 React 视图** | 画布对 Harness 零感知，可单测、可替换；react-flow 只作为交互实现细节 |
| 4 | **Renderer 使用 React 19** | 画布生态与 react-flow 最成熟；与 TypeScript 7 的 `tsc` 直接兼容（Vue 的 vue-tsc 目前尚不支持 TS 7，已实测） |
| 5 | **Workspace = 目录 + manifest，导出 `.fhws`** | 可调试、可增量写、易导入导出；单文件数据库留到规模需要时再换 |
| 6 | **布局数据归属：`GraphDocument.ui` 可移植，实例级覆盖存工作台文档** | 尊重 wireclaw 已预留的 `ui` 槽位，同时支持多图组合的画布 |

## 术语表

| 术语 | 含义 |
| --- | --- |
| **Workspace** | 数据容器：一个工作区目录，包含文档、对象、运行记录与会话 |
| **GraphDocument** | 一个 Harness 工作流（wireclaw 的纯 JSON 格式，可独立导入导出） |
| **WorkbenchInstance** | 工作区里的一份画布实例文档，绑定 1..n 个 graph |
| **Workbench Framework** | 所有工作台共用的框架：画布宿主、运行控制、命令与保存 |
| **Harness Designer** | 默认工作台，也是框架的参考实现 |
| **Run** | 一次 Graph 执行（有 runId、事件流、可选 checkpoint） |
| **Session** | 一次 AI 会话（wireclaw `Session`），持有附件与会话历史 |
| **Blob** | 内容寻址的二进制对象（上传文件、图片等） |
| **FileHost** | wireclaw `IFileHost` 的 FH 侧实现，按内容哈希读写 Blob |
| **Module** | renderer 侧可注册的 UI 能力单元（画布、工作台类型、节点渲染器） |

## 实现状态

| 能力 | 状态 |
| --- | --- |
| pnpm workspace + wireclaw submodule + 包名引用 | ✅ 已实现 |
| Electron main / preload / renderer 脚手架 | ✅ 已实现 |
| 验证链：typecheck / test / build / smoke | ✅ 已实现 |
| `packages/contracts`（IPC 通道 / DTO / 错误码） | ✅ 已实现（Phase 0） |
| React renderer + design tokens + ThemeProvider | ✅ 已实现（Phase 0） |
| main 服务层（AppConfig / Secrets / BlobStore / WorkspaceStore / WorkspaceFileHost） | ✅ 已实现（Phase 1） |
| IPC 路由、`fh-asset://` 协议、数据层单测 | ✅ 已实现（Phase 1） |
| Runtime Host + RunStore + Session 服务 | ⬜ 未开始 |
| Canvas + Workbench Framework | ⬜ 未开始 |
| Harness Designer | ⬜ 未开始 |
| 打包分发、CI | ⬜ 未开始 |

图例：✅ 已实现 ｜ 🚧 进行中 ｜ ⬜ 未开始
