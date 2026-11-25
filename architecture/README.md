# FlowHarness 架构文档

> 状态：**目标架构已定稿**（2026-11-24）。当前已实现开发环境、main 数据/运行时、Shell v2、浮动 Panel、Canvas、真透明主题、M1 最小可运行 Designer、M2 节点库 / configSchema 表单 / 预设、M3 校验与运行可视化、M4 文档生命周期与编辑体验、M5 Workbench Framework、M6 Session / Provider 闭环、M7.1 工作台导航宿主 / M7.2 Session 树存储、M7.3 Session 树导航 / 历史面板、M7.4 RunResult 与运行结果会话、M7.4.1 双区导航；进度见文末。
>
> 当前阶段：**M7 进行中（M7.0 设计定稿；M7.1 工作台导航宿主；M7.2 Session 树存储；M7.3 Session 树导航 / 历史面板 / 工作流右键菜单；M7.4 RunResult / 运行结果面板 / 保存到草稿 Session；M7.4.1 双区导航已完成）**。
> 术语：FH = FlowHarness。

## 阅读顺序

1. [overview.md](./overview.md) — 分层、依赖规则、进程模型
2. [modules.md](./modules.md) — 每个模块的职责与契约
3. [data-model.md](./data-model.md) — 工作区数据、文档、导入导出
4. [runtime.md](./runtime.md) — 执行、事件、IPC、安全
5. [ui.md](./ui.md) — React、画布、工作台框架、设计器
6. [decisions.md](./decisions.md) — 架构决策记录（ADR-001 ~ ADR-021）

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
| Runtime Host + RunStore（run 持久化 / checkpoint / interrupted） | ✅ 已实现（Phase 2） |
| 事件投影与节流、审批 / 用户输入（main handler + renderer 对话框） | ✅ 已实现（M6.1） |
| M3 问题面板 / 内嵌图递归校验 / 运行事件→画布 / 暂停·继续 | ✅ 已实现（2026-11-25） |
| M4 多图文档 / 撤销复制 / 框选·右键平移 / Harness JSON 导入导出 | ✅ 已实现（2026-11-25） |
| M5 Workbench 定义 / 实例 / registry + host / 三个工作台 | ✅ 已实现（M5） |
| M5 WorkbenchPlan（独立多 run 顺序执行） | ✅ 已实现（M5.2；renderer 编排） |
| M5 节点内联编辑 / Body 输入端口槽拖拽 | ✅ 已实现（M5） |
| M5 plan.bindings / layout.overrides | ⬜ 未接线 |
| M6.1 Provider 工厂 / Secrets / 设置页 / RuntimeHost resolveProvider | ✅ 已实现（M6.1） |
| M6.1 审批 / 用户输入对话框；跨重启 checkpoint 恢复 | ✅ 已实现（M6.1） |
| M6.2 Session 生命周期 / SessionStore | ✅ 已实现（M6.2） |
| M6.3 Session 历史序列化 / 回放视图 / 附件渲染 | ✅ 已实现（M6.3） |
| M7.0 工作台导航 / Session 树 / RunResult 设计 | ✅ 设计定稿（ADR-019 / ADR-020） |
| M7.1 工作台导航宿主 / GraphDocument 左栏 / 文档绑定 | ✅ 已实现（M7.1） |
| M7.2 Session 递归文件夹 / SessionRecord v2 / 草稿目录 / IPC | ✅ 已实现（M7.2） |
| M7.3 Session 树导航 / 历史面板 / 工作流右键菜单 / 设计-运行切换 | ✅ 已实现（M7.3） |
| M7.4 RunResult / 运行结果面板 / 保存到草稿 Session / run 回放 | ✅ 已实现（M7.4） |
| M7.4.1 双区导航（工作流 + 会话上下分区，ADR-021） | ✅ 已实现（M7.4.1） |
| M6.2 wireclaw checkpoint v2（graphHash + nodeVersions） | ✅ 已实现（M6.2） |
| M6.2 工作区文件工具 / 运行前 requirements catalog | ✅ 已实现（M6.2） |
| SessionService（AttachmentFileManager / SessionStore 装配） | ✅ 已实现（Phase 2 附件；M6.2 会话） |
| UI 基础：tokens / 组件原语 / 画布样张 / Styleguide | ✅ 已实现（Phase 2.5） |
| Shell v2：无边框标题栏 / Ribbon / 会话侧栏 / StatusBar（HeroView 未接入） | ✅ 已实现（Phase 2.6） |
| 中性黑配色 + 真透明窗口（桌面清晰、无 blur） | ✅ 已实现（Step 4） |
| UI 打磨：去饱和色板 / 125% 字号 / 节点双层 / Session+Canvas 面板化 | ✅ 已实现（2026-11-25） |
| 内部浮动 Panel（运行日志 / 属性检查） | ✅ 已实现（Phase 2.6 step 2） |
| 窗口 bounds 持久化（多显示器/DPI） | ✅ 已实现（step 2） |
| Session 生命周期（创建 / 列表 / 读取 / 保存） | ✅ M6.2 / M6.3（历史回放） |
| Canvas core + react-flow 交互 | ✅ 已实现（Phase 3 Step 3） |
| Canvas core 纯 TS / view 薄层（无 react-flow 类型泄漏） | ✅ 已实现（M1.1） |
| 商务扁平节点 / 网格线 / 去辉光 | ✅ 已实现（Step 4C） |
| GraphDocument adapter / 语义命令 / 布局与 viewport | ✅ 已实现（M1） |
| 设计器编辑 / 自动保存 / 冲突处理 / 检查器 | ✅ 已实现（M1.4 / M1.5） |
| 节点目录 / configSchema / 默认 config / 分类（wireclaw catalog v2） | ✅ 已实现（M2） |
| 节点库（分类 + 搜索 + 最近使用 + 预设）与检查器 schema 表单 | ✅ 已实现（M2） |
| 失效连线检测与提示 | ✅ 已实现（M2） |
| 问题面板（校验 / 连线 / 运行）与节点定位 | ✅ 已实现（M3） |
| 内嵌子图递归校验与 requirements 定位 | ✅ 已实现（M3） |
| 运行事件 → 节点 / 边状态与暂停·继续 | ✅ 已实现（M3） |
| 画布几何 / 面板 / 侧栏尺寸一致性收口 | ✅ 已实现（2026-11-25） |
| UI 打磨 2：面板加深、主题化 Select / Checkbox | ✅ 已实现（2026-11-25） |
| 撤销/重做 / 复制粘贴 / 多图 | ✅ 已实现（M4） |
| 文档菜单（新建 / 重命名 / 复制 / 删除 / 最近打开） | ✅ 已实现（M4） |
| Harness JSON 导入导出（可剥离布局） | ✅ 已实现（M4） |
| 画布框选 / 右键拖动平移 | ✅ 已实现（M4） |
| 保存保护（切换 / 关闭前 flush、冲突副本） | ✅ 已实现（M4；系统级关闭仍有限制） |
| 300 节点性能基线 | ⬜ 未开始 |
| Workbench Framework | ✅ M5（定义 / 实例 / 宿主 / 三个工作台 / Plan） |
| Harness Designer | ✅ M5（编辑 / 运行 / 问题 / 多图 / 内联） |
| 打包分发、CI | ⬜ 未开始 |

图例：✅ 已实现 ｜ 🚧 进行中 ｜ ⬜ 未开始
