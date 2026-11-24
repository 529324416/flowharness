# 架构决策记录（ADR）

> 每条决策记录：背景、决定、后果、被否决的替代方案。
> 新增决策请追加编号，不覆盖历史。

---

## ADR-001：Harness 在 main 进程执行

**背景**
wireclaw 的附件、MCP stdio、本地文件能力都依赖 Node；Provider 密钥需要与 UI 隔离；renderer 可能因 UI 开发频繁重载。

**决定**
RuntimeHost 运行在 Electron main 进程，实现 wireclaw `GraphHost`，通过类型化 IPC 向 renderer 暴露 `run:start/pause/resume/cancel/get` 与事件流。

**后果**
- 需要设计 IPC 契约、事件节流、审批往返；
- renderer 重载不影响运行；
- 未来可把 RuntimeHost 迁到 utility process，只要保持 `RuntimeContract` 不变。

**否决**
- renderer 内执行：需要向渲染进程暴露文件与密钥，安全模型不可接受；
- 一期直接上 utility process：复杂度高、收益在隔离性，当前阶段不值得。

---

## ADR-002：内容寻址 BlobStore + WorkspaceFileHost

**背景**
wireclaw 的 `IFileHost` 接口按 `contentHash` 读写（`read/readMeta/write/list/delete/flush/close`），去重、索引、缓存、GC 由 `AttachmentFileManager` 负责。需求描述中的「按 workspace/sessionId/fileId 存放」与该接口语义不一致。

**决定**
- 底层 `BlobStore` 做内容寻址：`objects/<hash[0:2]>/<hash>`；
- `WorkspaceFileHost implements IFileHost` 直接映射哈希；
- workspace/session/run 归属记在 `objects/index.json` 的 `refs` 中，不体现在路径上。

**后果**
- 同一内容只存一份，跨会话/工作台复用；
- GC 需要可靠的引用根：由 WorkspaceStore/SessionService 汇总；
- 删除必须先移除 refs，避免悬空引用。

**否决**
- 每个 session 独立对象目录：实现简单但丢失去重，迁移与 GC 更复杂；
- 重新实现一套索引/去重：与 `AttachmentFileManager` 重复。

---

## ADR-003：Canvas = 无框架 core + 薄 React 视图

**背景**
画布需要同时满足：可被多个工作台复用、可单测、未来可能替换渲染方案；而交互细节（缩放、拖拽、连线）用成熟库更稳。

**决定**
- `modules/canvas/core` 为纯 TS：几何、命令、选择、边 key、动画原语；
- `modules/canvas/view` 为 React，内部使用 `@xyflow/react` 实现交互；
- 对外只暴露 FH 自己的 `CanvasNode/CanvasEdge/CanvasDocument` 与 `CanvasAnimationApi`；
- 节点内容通过 registry 注入，Canvas 不感知 Harness。

**后果**
- react-flow 成为实现细节，替换只影响 `view/`；
- 受控模式要求文档是唯一事实来源，所有变更走命令；
- 动画由工作台把 `GraphEvent` 映射为原语调用，Canvas 不内置业务语义。

**否决**
- 直接用 react-flow 的数据模型贯穿全局：领域层被第三方模型绑架，测试困难；
- 完全自研交互：短期成本高，收益不足以抵消。

---

## ADR-004：Renderer 使用 React 19

**背景**
需要选择 UI 框架。候选：React、Vue 3（团队此前有 Electron+Vue 经验）、Svelte、原生。

**决定**
React 19 + Vite 8 + electron-vite 6；类型检查用 `tsc --noEmit`。

**理由**
1. 画布生态：react-flow（`@xyflow/react`）最成熟，自定义节点/边/小地图/动画资料最多；
2. 工具链：本仓库使用 TypeScript 7.0.2，React 的纯 `tsc` 链路直接可用；
3. 本项目 UI 由 AI 实现，团队既有框架经验不是约束条件（用户已确认）。

**关键实证**
`vue-tsc@3.3.14` 依赖 `typescript/lib/tsc`，与 TS 7（原生版）不兼容，实测抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`；若选 Vue 需把 desktop 钉在 TS 6.0.3（已验证可行），并承担双 TS 版本的维护成本。

**后果**
- 引入 `@vitejs/plugin-react`，其在 Vite 8/rolldown 下需要补齐 peer（`oxc-transform-react` 等），接入阶段需验证；
- 组件与状态模式统一为 React（函数组件 + hooks + `useSyncExternalStore`）；
- 与架构分层无关：contracts、main 服务、RuntimeHost、数据模型均不含框架代码。

**否决**
- Vue 3 + Vue Flow：生态可用，但需要双 TS 版本并承担 vue-tsc 的兼容风险；
- 原生 TS：画布与表单的长期维护成本过高。

---

## ADR-005：Workspace 采用目录 + manifest，导出 `.fhws`

**背景**
工作区需要存文档、二进制、运行记录、会话；既要可调试，也要能整体迁移。

**决定**
- 工作区是目录：`manifest.json` + `documents/` + `objects/` + `runs/` + `sessions/`；
- 整体导入导出用 zip 包 `.fhws`（含 `export.json` 版本头）；
- 单 Harness 工作流仍用纯 `GraphDocument` JSON，不混入工作台信息；
- 单写者 + 原子写（临时文件 + rename）。

**后果**
- 可增量写、可人眼检查、可备份；
- 需要 schemaVersion + 迁移机制与锁文件；
- 索引损坏可从目录重建；
- 规模增大后（10 万+ 对象、复杂检索）再评估 SQLite，接口不变。

**否决**
- 单 JSON 文件：写入放大、损坏风险高；
- 一开始就用 SQLite：调试与导入导出反而更麻烦，收益当前不明显。

---

## ADR-006：布局归属——`GraphDocument.ui` 可移植，实例覆盖独立

**背景**
节点坐标既要随工作流导出/导入，又允许同一工作流在不同工作台里摆放不同。

**决定**
- 默认布局写入 wireclaw 的 `GraphDocument.ui`（节点 `ui` 与图级 `ui.viewport`）——该字段本就为设计器坐标预留，运行时忽略；
- 工作台实例文档用 `layout.overrides` 保存实例级覆盖，不写回 graph。

**后果**
- 导出 Harness JSON 时布局可随行（可选择剥离）；
- 同一 graph 可被多个实例以不同布局复用；
- FH 需要维护 `ui` 子结构的版本兼容，但不改变 wireclaw 的字段语义。

**否决**
- 全部布局放实例文档：graph 单独导出后丢失布局，设计器体验断裂；
- 全部布局塞进 graph：无法支持多实例不同摆放，也会污染工作流语义。

---

## ADR-007：UI 基础——深色优先、青绿主色、Radix 原语

**背景**
Phase 3 画布会大量定义视觉与交互；若没有 token、组件原语与外壳布局，画布逻辑会和临时样式耦合，后续返工成本高。

**决定**
- **深色优先**（默认 dark），亮色同等维护；主色 **青绿**；
- **紧凑密度**：控件 30px（sm 26）、节点 220px、4px 间距基线、13px 正文；
- 组件策略：**Radix Primitives 提供无障碍/键盘行为 + 自研 CSS Modules 样式**，不引完整 UI 套件；
- 图标统一 **Lucide**；
- 六区外壳：TopBar 44 / Rail 56 / Inspector 320 / BottomPanel 200 / StatusBar 24；
- 画布几何集中到 `canvas/metrics.ts`（节点 220、端口 10/命中 16、边 1.5、网格 16）；
- 以「样式指南」视图作为视觉契约的可评审入口。

**后果**
- tokens 成为唯一视觉事实源，组件不得硬编码颜色/间距；
- renderer 体积增加（Radix + Lucide），Phase 3 之后按需做代码分割；
- 画布视觉与交互在开工前已有可执行样张，Phase 3 只需把交互接上；
- 默认主题从 `system` 改为 `dark`，AppConfig 默认值随之调整。

**否决**
- 浅色优先：长时间画布工作与深色工具习惯不符；
- 完整 UI 套件（MUI/AntD）：视觉定制与包体受限；
- 完全自研浮层：菜单/弹窗的焦点与键盘行为维护成本高。

---

## ADR-008：无边框窗口 + 自绘标题栏；半透明默认关闭

**背景**
原生 Windows 标题栏与产品视觉不一致；Phase 2.6 需要先确定窗口 chrome，同时验证半透明是否值得作为默认外观。

**决定**
- 默认 `frame: false`，TitleBar 自绘：拖拽区、最小化/最大化/关闭、双击最大化；窗口状态通过 IPC 暴露给 renderer。
- 保留 `standard`（原生框）与 `overlay`（`titleBarOverlay` 原生按钮）作为 fallback。
- 半透明**默认关闭**；`FLOWHARNESS_WINDOW_MODE=transparent` 为实验模式：内容表面高不透明度 + `backdrop-filter: blur()`。
- `mica` / `acrylic` 作为实验分支保留；当前环境截图无可辨收益，不作为默认。

**后果**
- 自绘按钮拿不到 Win11 Snap Layouts 的原生悬停菜单；若必须保留，改用 overlay。
- 需要自行接管菜单快捷键与窗口 bounds 持久化（在 Shell v2 完成）。
- 透明模式在窗口阴影、缩放、截图链路上仍有稳定性问题，留到 step 4 复验。

**否决**
- 继续使用原生标题栏：视觉割裂，无法统一拖拽区/命令区。
- 直接默认真透明：可读性、性能与截图链路风险过高。