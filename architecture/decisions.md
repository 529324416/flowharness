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
- 半透明在 S0 中默认关闭（**Step 4 已由 ADR-009 改为默认真透明**）；`FLOWHARNESS_WINDOW_MODE=transparent` 曾是实验模式。
- `mica` / `acrylic` 作为实验分支保留；当前环境截图无可辨收益，不作为默认。

**后果**
- 自绘按钮拿不到 Win11 Snap Layouts 的原生悬停菜单；若必须保留，改用 overlay。
- 需要自行接管菜单快捷键与窗口 bounds 持久化（在 Shell v2 完成）。
- 透明模式在窗口阴影、缩放、截图链路上仍有稳定性问题，留到 step 4 复验。

**否决**
- 继续使用原生标题栏：视觉割裂，无法统一拖拽区/命令区。
- 直接默认真透明：可读性、性能与截图链路风险过高。

---

## ADR-009：默认真透明 + 中性黑；桌面 blur 不可用

**背景**
Step 4 需要在保持可读性的前提下，把全局配色从“青绿倾向的暗色”收敛为中性黑，并落地真透明。用户确认：真透明 + 背景模糊、青绿只做语义色、橙红只做能量色。

**决定**
- 默认窗口 `transparent: true`、`frame: false`、`thickFrame: true`、`backgroundColor: "#00000000"`。
- 深色 token 改为中性石墨黑；青绿只保留选中/焦点/链接/少量文字；橙红 energy 只用于节点运行与活跃连线。
- 透明模式内容表面使用 0.5–0.94 alpha，并叠加极低透明度 scanline；Panel 使用 84% alpha（不加 `backdrop-filter`，否则在透明窗口中会压成黑块）。
- **不使用 CSS `backdrop-filter` 模糊桌面**：透明窗口里 Chromium 不采样桌面/其他窗口，实测 blur 与无 blur 完全一致。
- **不使用原生 Acrylic/Mica / DWM AccentState 作为默认**：当前 Electron 45 + Win11 26H2 实测仍为不透明；外部 DWM API 测试无效果，且属于未文档化接口。
- fallback：`FLOWHARNESS_WINDOW_MODE=frameless` 回到不透明无边框窗口。

**后果**
- 桌面会清晰透出，但不会被模糊；无原生窗口阴影，只有 inset 1px 边框。
- 透明窗口需要 GPU 合成；`--disable-gpu` 会退化为不透明，截图/CI 需区分。
- 若必须实现桌面模糊，需要原生模块或桌面捕获方案，留到后续单独评估。

**否决**
- 用未文档化 DWM API 强行 blur：跨版本风险高，已验证无效。
- 为透明牺牲正文可读性：alpha 不低于 0.5，节点/面板保持接近不透明。

---

## ADR-010：UI 打磨——去饱和色板、125% 字号、节点双层、面板化

**背景**
Step 4 之后进入功能开发前的视觉收口：主色与状态色过饱和、非画布字号（9–13px）偏小、Session 与 Canvas 用共享分隔线“拼”在一起、节点 Footer 的 type/ports/id 信息没有实际用途。

**决定**
- 主色与状态色饱和度降到原值的 30%；移除 `--fh-accent-soft`、`--fh-energy`、`--fh-energy-soft`、`--fh-energy-glow`；
- Rail/Session 选中只用表面色高亮与中性边框，不再着色；活跃连线改用 `--fh-edge-active`；
- 非画布字号整体放大 125%（`--fh-ui-scale`，正文 16.25px），图标同步放大；画布内部字号不变，间距继续走 4px 基线；
- 节点固定 HeaderBar + Body 双层，移除 Footer；节点在任何窗口模式下都不透明；
- Session 与 Canvas 各自 1px 外框 + 6px 圆角、2px 间隙，形成面板化布局；
- 浮动面板默认 95% 不透明，由 `--fh-panel-alpha` 统一控制，预留设置入口。

**后果**
- 视觉更安静，语义色仍能通过色相与图标/文本区分；
- 画布与外壳的字号体系分离，后续做设计器功能时不会牵动外壳密度；
- 面板化后 Sidebar 与 Canvas 的边界由各自边框表达，窗口材质与面板材质可以独立演进。

**否决**
- 整体等比放大 125%：间距与控件同步膨胀，密度下降，与工具型工作台目标冲突；
- 保留 `--fh-energy`：与“状态色统一去饱和”的目标冲突，且活跃边已有主色可表达；
- 保留节点 Footer：信息噪音大于价值，端口数量由画布手势承担。

---

## ADR-011：窗口层级、字体回退与画布缩放下的清晰描边

**背景**
第一轮 UI 打磨后还剩几类细节：部分中文与画布文字落回宋体；TitleBar/StatusBar 仍透出桌面，Session 与 Canvas 的最终 alpha 不一致；浮动面板遮挡画布；节点在缩小后边框与圆角发虚；输入框有额外的 focus 高亮；状态栏带一条与 Footer 不属的方角边框；画布左下角的微型缩放工具栏多余。

**决定**
- 字体栈统一以 `Microsoft YaHei UI` 优先；`--fh-font-mono` 在等宽字体后也加入它，保证 CJK 不落回宋体；
- 窗口分三层：TitleBar / StatusBar 使用 `--fh-surface-solid` 完全不透明；中间 Body 使用单一 `--fh-body-bg`（95%）承载 Session 与 Canvas；Session/Canvas/Rail 自身背景透明，避免双层 alpha 叠加导致两侧不一致；
- 浮动面板默认尺寸缩到原 80%（属性 256×432、运行日志 448×224）；
- 节点描边使用 `border-width: calc(1px / var(--fh-canvas-zoom))`，由 React Flow `onMove` 把 zoom 写入 CSS 变量；圆角仍按 6px 正常比例缩放；
- 输入框移除 focus 边框与 ring，只保留原生光标；
- 移除 TitleBar 的底部边框（Body 面板已有边框，表面色差足够分割）；
- Footer 与 TitleBar 同级：全宽、不内缩、不透明，只保留底部窗口圆角；不再作为 Body 内的圆角面板；
- 移除画布左下缩放工具栏；Session 与 Canvas 间隙从 2px 提升到 4px。

**后果**
- Body 的透明度只由一层决定，Session 与 Canvas 的最终 alpha 可验证一致（255 的 chrome / 242 的 body）；
- 缩放到任意比例时描边屏幕宽度恒为 1px（50% 时等效于 2px 本地宽度），不存在阈值跳变；小数缩放位置仍会有 1px 的抗锯齿，这是浏览器栅格化限制；
- 节点描边不再随 zoom 变细到不可见，圆角按比例缩小以保持形态；
- `onMove` 只写一个 CSS 变量，不触发 React 重渲染。

**否决**
- 在缩放到某个阈值时把边框切成 2px：阈值处会跳变，且仍不能覆盖所有分数缩放；
- 给 Body 和面板各加一层 95% alpha：两层叠加后实际接近不透明，Session 与 Canvas 也难以保持一致；
- 用 SVG `vector-effect` 修复节点描边：节点是 HTML/CSS transform，祖先的缩放发生在图层合成阶段，非缩放描边不会参与补偿。

**实现备注（2026-11-25）**：属性面板默认宽度已与 `MIN_WIDTH=280` 对齐，折叠高度与 `PanelFrame` 头部共用 `PANEL_HEADER_HEIGHT=34`；早期 256/32 的偏差已消除。见 [../design/components.md](../design/components.md) §2.1。

---

## ADR-012：文档保存采用整文档快照 + 内容哈希 revision

**背景**
设计器需要自动保存与并发保护。`workspace:applyCommands` 是给未来多写者 / 批处理预留的；单写者阶段让 main 合并命令会重复 adapter 与 `GraphDocument` 语义，也容易在合并时丢掉未知字段。

**决定**
- renderer 每次保存提交整份 `GraphDocument` 快照。
- main 读取当前文件字节并计算 SHA-256，以 `sha256:<hex>` 形式作为 `revision` 返回。
- 保存请求携带 `baseRevision`：`null` 表示创建；非 null 必须与当前 revision 一致，否则返回 `E_CONFLICT`。
- 文档写入复用原子写；manifest 的 `updatedAt` 属于副作用，写失败只告警，不让调用方误判文档保存失败。
- 同一文档的保存按 `workspaceId + ref` 串行化，保证 revision 检查与写入之间不被插队。
- `workspace:applyCommands` 暂时保留契约但不实现；M4 多图 / 批处理时重新评估。

**后果**
- 单写者下实现简单，冲突显式暴露，不静默覆盖。
- 每次保存写整份文档；在 4 MB 上限内可接受，后续需要再做增量命令。
- 文件被外部修改时 revision 变化，保存失败并提示重载。
- JSON 校验与大小限制在 main，renderer 不能绕过。

---

## ADR-013：GraphDocument 是设计器唯一事实源，Canvas 只发语义命令

**背景**
设计器需要编辑节点、连线、config 与 viewport。若把 `CanvasDocument` 当事实源并整图反向转回 `GraphDocument`，容易丢失 `typeVersion / requires / inputs / metadata / parameters / events / toolSet`。

**决定**
- `GraphDocument` 是唯一持久化事实源；
- `toCanvasDocument` 只做单向投影；
- Canvas 发出 `moveNodes / removeNodes / connect / disconnect / setViewport` 语义命令；
- Designer 的 `applyCanvasCommand` 只修改命令涉及的字段，其余字段原样保留；
- `addNode / updateNodeConfig` 是设计器动作，不进入 Canvas 命令。

**后果**
- 编辑不会误删 wireclaw 字段；
- Canvas 保持对 Harness 零感知；
- 未来接入 Workbench Framework 时，命令层可直接复用。

---

## ADR-014：Canvas core 纯 TS，react-flow 只存在于 view

**背景**
原 `canvas/core/types.ts` 直接引用 `@xyflow/react` 的 `Node/Edge`，使 core 与第三方模型耦合，违背 ADR-003。

**决定**
- `canvas/core` 只定义 `CanvasNode / CanvasEdge / CanvasDocument / CanvasPort / CanvasCommand` 等领域类型；
- react-flow 的类型与组件集中在 `canvas/view`（`flow-types.ts`）；
- CanvasView 负责领域文档与 react-flow 节点/边之间的临时视图状态。

**后果**
- core 可单测、可替换渲染层；
- 拖拽中间态留在 view，文档只在 `onNodeDragStop` 后更新。

---

## ADR-015：renderer 使用 wireclaw 浏览器构建，IPC 只传 JSON

**背景**
设计器需要节点 catalog、端口描述与运行前校验，但 renderer 不应把 wireclaw 类实例或 main 能力带进 UI。

**决定**
- Designer 层使用 `wireclaw` 浏览器构建的 `createBuiltinNodeRegistry / describeNodeType / deserializeGraph / Graph.validate`；
- `canvas` 模块不引用 wireclaw；
- 跨 IPC 只传纯 JSON（GraphDocument、事件 DTO）；main 用 wireclaw 再校验并执行。

**后果**
- 设计器与运行时共享同一套节点定义，但边界仍是 JSON；
- renderer bundle 会包含 wireclaw 浏览器构建（当前约 1.6 MB），后续按需代码分割；
- 未知节点类型在 designer 侧降级为占位节点，由校验输出问题。

---

## ADR-016：自动保存采用 400ms 串行协调器

**背景**
编辑需要自动保存，但不能并发写、不能在 revision 竞争时静默覆盖，也不能在组件卸载后让旧保存结果覆盖新工作区状态。

**决定**
- `SaveCoordinator` 负责 400ms debounce、串行保存链与 revision 更新；
- `E_CONFLICT` 立即停止自动保存，进入 conflict 状态，等待用户重新加载；
- 切换工作区 / 卸载时调用 `flush()`，完成后 dispose；
- 旧 coordinator 的状态回调通过引用校验丢弃；
- 保存状态在 StatusBar 展示。

**后果**
- 单写者下冲突显式、状态可观察；
- 窗口直接关闭时最后 <400ms 的编辑仍可能丢失（无 main-renderer 退出握手）；
- undo/redo 与更细粒度的增量保存留到 M4。

---

## ADR-017：节点 configSchema 采用 JSON Schema 子集，catalog 携带默认 config / 分类

**背景**
M2 需要按节点类型生成参数表单、给新节点预填默认 config、并在节点库里分类与搜索。wireclaw 原本只有 `configSchema?: JsonObject` 字段，既没有任何内建节点填写，也没有默认值或分类语义；FH 侧则只从 `describeNodeTypes` 拿端口。

**决定**
- wireclaw `NodeTypeDefinition` 增加 `defaultConfig`、`category`、`keywords`，并在注册时做 JSON 安全 / 字符串校验；`toDescriptor` 一并透出（顺带修复 `requirements` 在 catalog 中丢失的问题）；
- `NodeCatalogEntry` 与 `GRAPH_EDITOR_CATALOG_VERSION = 2` 暴露同一组字段；
- `configSchema` 使用**受支持子集**（object / string / number / integer / boolean / array / enum / required / properties / items / minimum / maximum / minLength / maxLength / minItems / maxItems / default / format），不引入 ajv 或 JSON Schema 实现；
- `editor/schema.ts` 提供 `validateNodeConfig()` 与 `defaultConfigFromSchema()`；无法表达的关键字（oneOf / $ref / 联合类型）不参与校验，编辑器回退到 JSON 文本域；
- 内嵌 GraphDocument（Subgraph / ForEach / Loop）的 `config.graph` 只做 JSON 文本域编辑，模板默认填入最小的 Input → Output 子图；
- 节点库的默认 config 由 catalog 深拷贝后交给编辑器；FH 用 `createEditorCatalog` 作为唯一目录来源，内置预设放在 `designer/core/presets.ts`。

**后果**
- 节点元数据只有 wireclaw 一份；新增节点类型时，schema / 默认 config / 分类与实现一起注册；
- 表单覆盖常见标量、枚举与字符串数组；复杂结构仍可编辑 JSON，不会因 schema 缺失而不可用；
- 目录版本升到 2，外部消费方需要按版本适配（FH 已同步）；
- 子集校验只保证「表单能表达、明显错误能提示」，语义校验仍归 `Graph.validate` 与运行时读取函数；M3 已把 issues 接入问题面板。

---

## ADR-018：浮动面板独立深色材质，表单控件主题化

**背景**
浮动面板此前与菜单、对话框共用 `--fh-surface-overlay`，层次上比节点还亮，不符合「面板应更沉默、比节点更深」的视觉目标；检查器表单里的 `<select>` 与 `<input type="checkbox">` 仍是系统原生控件，弹层与状态样式和 FH 主题割裂。

**决定**
- 新增面板专用 token：`--fh-panel-bg` / `--fh-panel-header-bg`（深色 #080a0d / #0b0e12，比 `--fh-node-bg` 更深；亮色对应 #eef1f4 / #e7ebef）；透明层仍由 `--fh-panel-alpha` 控制；
- `PanelFrame` 与节点库浮层使用面板 token；菜单、对话框等瞬态浮层继续使用 `--fh-surface-overlay`，允许略亮于面板以表达层级；
- `Select` 改为「主题化触发器 + Radix DropdownMenu 弹层」，不再渲染原生 select 弹层；
- `Checkbox` 隐藏原生外观，自绘方框与主色勾，但保留原生 `input` 的键盘、读屏与表单语义；
- 面板 / 侧栏尺寸收敛到 `layout-metrics.ts`，画布几何收敛到 `canvas/metrics.ts` 并通过 CSS 变量下发。

**后果**
- 面板、节点、浮层形成「节点 > 面板 > 背景」的稳定层次；
- 表单控件在深/亮主题下外观一致，键盘与关闭行为由 Radix 与原生 input 承担；
- 不新增依赖（复用已安装的 Radix DropdownMenu）。

**否决**
- 引入 `@radix-ui/react-select`：当前只有单选枚举，DropdownMenu 已覆盖键盘与关闭行为，新增依赖收益不足；
- 仅用 `accent-color` 美化原生 checkbox：跨平台外观不可控，无法与 FH 表面/描边体系一致。

