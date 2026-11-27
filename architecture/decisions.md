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

---

## ADR-019：工作台作用域导航与 Session 树

**背景**

M6.3 之后，左侧栏仍是全局 Session 列表，而设计器画布承载的是 Workspace 内的 `GraphDocument`。Session 是运行 / 对话上下文，不是工作区文档；M6.2 把 Session 接到真实存储后，这个层级错位更明显：文档与工作台切换藏在 TitleBar，左栏却展示与当前画布无直接关系的会话。M6.3 的会话历史还以顶层视图存在，进一步把「运行结果」和「工作区文档」混在一起。

**决定**

- 数据归属不变：`GraphDocument` / `Session` / `Blob` / `Run` 归 **Workspace**；`WorkbenchInstance` 只保存 `type / graphs / plan / parameters / layout` 等展示与绑定状态，是「视图 + 绑定 + 已保存状态」，不是数据所有者。
- 左侧栏改为 Shell 提供的 **Panel 宿主**；PanelContent 由当前 `(workbench type, mode)` 提供：
  - `harness-designer` 设计模式：GraphDocument 列表；
  - `harness-designer` 运行模式：Session 树；
  - 其他工作台各自提供导航（Plan 步骤、未来 Agent 会话等）。
- 移除全局 SessionSidebar、顶层 `sessions` 视图与 `Ctrl+4`；运行结果与会话历史改为 Canvas 浮动面板。
- Session 采用 Workspace 级**递归文件夹树**：
  - `sessions/<folderId>/.../<sessionId>/session.json` + 每层 `folder.json`；
  - folder id 作目录名，用户标题只放元数据，避免标题进路径；
  - 旧 `sessions/<id>` 迁移到根；
  - 草稿目录由 `manifest.settings.draftSessionFolderId` 配置。
- `WorkbenchInstance.graphs` 是权威绑定：切换文档时同步 primaryGraph；删除 graph 时解除实例引用（M8 UI 打磨 3 / ADR-025 修订）。
- 工作台运行阶段是「固定工作流 + 动画」的运行页；设计 → 运行是同一实例的 `design` / `run` 模式切换，不是新的全局页面。
- 浮动面板透明度 `--fh-panel-alpha` 从 0.95 调整为 0.78；固定 TitleBar / StatusBar 不变。

**后果**

- Shell 增加导航宿主；`WorkbenchDefinition` 增加 navigation / mode 契约；`PanelLayer` 提升到工作台壳层。
- 现有 SessionSidebar / DocumentMenu / SessionHistoryView 的职责重新分配；DocumentMenu 动作迁移或复用。
- 需要目录 CRUD、移动 / 重命名、路径安全、旧数据迁移与草稿目录设置。
- 导航语义与工作台类型绑定，后续新增工作台必须提供 PanelContent。

**否决**

- 保留全局 Session 侧栏：与画布内容层级不一致，且 Session 尚未成为真实写入方。
- 每个视图各自维护左栏：会出现多套导航，选中状态与刷新难以统一。
- 独立全局运行页面：工作台本身就是运行载体，独立页面会割裂画布与结果。
- 先用逻辑 manifest 树代替真实目录：文件树更符合 workspace 可调试 / 可迁移原则；真实目录的移动 / 重命名成本由 folder id 与元数据承担。

---

## ADR-020：RunResult 作为 wireclaw 的运行结果聚合

**背景**

`GraphRunResult` 目前有 run 状态、输出与节点记录（`NodeRunRecord`），但模型调用的 provider / model / usage / thinking，以及 Agent 会话的完整 `SessionData` 都只存在于节点局部变量里。FH 需要把一次运行的结果持久化、展示，并能「保存为会话」；仅靠 `events.jsonl` 或 `NodeRunRecord.outputs` 无法还原这些数据。RunResult 属于执行层，应由 wireclaw 定义，FH 不复制引擎模型。

**决定**

- wireclaw 新增版本化、JSON-safe 的 `RunResult` v1：
  - 运行元信息：`runId / graphId / status / startedAt / endedAt / input / outputs / error?`；
  - `entries: RunResultEntry[]`，按节点执行顺序聚合。
- `RunResultEntry` 使用判别联合：
  - `kind: "model-call"`：`nodeId / nodeType / graphPath? / providerId / modelId / mode("chat" | "generate")`、输入 `prompt / system / attachments`、输出 `text / thinking / attachments / usage / stopReason / failureReason`、状态与耗时；
  - `kind: "session"`：`nodeId / nodeType / graphPath? / providerId / modelId`、完整 `SessionData`、状态与耗时；
  - 错误统一为字符串，不跨边界传 `Error` / 类实例。
- 采集方式：节点在 `execute` 内把结果写到 NodeContext 的收集器，或由 runner 在节点完成后调用 `collectRunResults()`；`Subgraph / Loop / ForEach` 的 entries 带 `graphPath` 向上冒泡。
  - 实现（M7.4）：`GraphRun` 内建 `RunResultCollector`；`NodeContext.collect` 提交 entry 草稿，运行时补齐 `id / nodeId / nodeType / graphPath`；容器节点共享 collector 并追加路径段（数组形式）。
- 暂停 / 中断的 partial entries 先不写入 checkpoint（v1）；RunStore 仍保留事件与节点记录。若需要跨重启保留 partial RunResult，再升 checkpoint v3。
- `GraphRunResult` 增加 `graphId` 与 `entries`；wireclaw 提供 `createRunResult(result, input?)` 生成版本化 `RunResult` 文档，FH 直接持久化该文档。
- FH 侧：
  - `runs/<runId>/result.json` 持久化 RunResult；
  - `SessionRecord.schemaVersion: 2`，新增 `kind: "conversation" | "run"`；
  - `conversation` 的 `history` 是 wireclaw `SessionData`；`run` 的 `history` 是 `RunResult`；
  - run session 默认保存到草稿文件夹；`attachments` 从 RunResult 的附件引用派生；
  - `messageCount` 只用于 conversation；run session 用 `entryCount`，不伪造消息。
- 不在 FH 侧用 `node:end` 事件拼 RunResult；不把 RunResult 改写成 wireclaw `SessionData`。
- FH 持久化前把 `RunResult.runId` 改写为自身稳定 `runId`（wireclaw 引擎 runId 只留在事件与日志中），使 `runs/<runId>/result.json`、run session 与 UI 引用一致。

**状态**：M7.4 已实现（wireclaw `RunResult` v1 / 序列化 / 采集，FH result.json / run 会话回放）；运行结果面板与手动保存入口已由 ADR-028 的自动运行会话取代，`result.json` 继续保留。

**后果**

- wireclaw 增加 RunResult 类型、序列化 / 校验、节点采集与测试；`GraphRunResult` 形状扩展。
- FH contracts 的 `SessionRecord` 升到 schemaVersion 2，SessionStore 按 `kind` 校验 / 回放，RunStore 增加 `result.json`，IPC / UI 需要区分两种 session。
- RunResult 可能较大（Agent 会话完整 history）；需要体积上限，后续再评估按 entry 引用 / 裁剪。

**否决**

- 复用 `NodeRunRecord.outputs`：丢失 provider / model / usage / thinking / session history。
- FH 从事件流重建：session 数据（工具调用、system prompt、usage）不在事件里。
- 把 run 结果伪造成 `SessionData` 消息：消息语义不成立，回放与后续 Agent 会话会混淆。

---

## ADR-021：工作台双区导航（工作流 + 会话）

**背景**

M7.3 把左栏改为按 `(workbench type, mode)` 切换：设计模式只显示工作流，运行模式只显示 Session 树。实际使用中两类导航经常同时需要——运行模式里仍要切换工作流，设计模式里也常要查看 / 新建会话；如果只能二选一，用户必须来回切换模式或在标题栏菜单里绕路。M7.5 的运行页同样需要“固定工作流 + 会话”同时可见。

**决定**

- `WorkbenchDefinition` 新增可选的 `splitNavigation: { top, bottom }`，两个槽位分别指向 `navigation` 中已有的模式组件。
- `harness-designer` 声明 `splitNavigation: { top: "design", bottom: "run" }`：上半区工作流列表，下半区 Session 树；`mode` 只影响主视图，不再决定左栏出现哪一类导航。
- Shell 新增 `SplitSidebar` 宿主：两区共享侧栏宽度；中间横向分隔条可拖动调整高度比例（默认 50/50，范围 20%–80%），比例写入 `localStorage["fh.sidebar.split"]`。
- `NavigationPanel` 增加 `section` 变体：作为分区时占满分区高度，不重复宽度拖拽；收起按钮只保留在上半区。
- 其他工作台不声明 `splitNavigation`，继续按 `mode` 渲染单一导航。

**后果**

- ADR-019 的“左栏内容只由 `(type, mode)` 决定”被放宽为：默认按 mode；声明 split 后改为固定双区。
- 运行阶段不再丢失工作流切换入口；设计阶段也能直接浏览会话。
- 两个分区各带页头 / 页脚，垂直空间紧张时依赖拖动比例或收起侧栏；后续如需要可再引入分区折叠。
- 新增 `designer-split-nav` 视觉基线；导航槽位解析增加测试。

**否决**

- 用页签在“工作流 / 会话”间切换：仍然是二选一，且切换成本高于直接分栏。
- 运行模式继续只显示会话、把工作流入口放进标题栏：与 M7.5 的运行页目标冲突。
- 恢复全局 Session 侧栏：违背 ADR-019 的工作台作用域原则。

---

## ADR-022：运行消息写入 conversation 会话

> 状态：自动写入目标已由 ADR-028 调整为“运行开始时自动创建会话并逐步写入”；本 ADR 的 entries → 消息转换规则继续有效。

**背景**

M6.3 完成后，conversation 会话只有读取 / 回放能力，没有任何生产写入路径：Agent / ModelCall 节点在 wireclaw 内部创建临时 Session，消息只随 RunResult 的 `session` / `model-call` entries 暂存。用户在会话树里打开 conversation 会话时仍是空的；「保存到会话」也只生成 run session（RunResult），消息语义没有落到 conversation session。

**决定**

- FH 在主进程把 `RunResult` entries 转换为真实消息：
  - `session` 条目直接使用完整的 wireclaw `SessionData`；
  - `model-call` 条目按实际输入 / 输出重建 system / user / assistant 消息（含附件、thinking、usage、stopReason），失败调用可以只有 user 消息；
  - 只追加消息，不写 RunResult、不伪造运行状态。
- 新增 `session:appendRun` 与 `SessionStore.appendRunMessages`：必须写入 `kind: "conversation"` 会话；append 后重新派生 `messageCount` 与附件指纹。
- 目标会话来自当前选中的 conversation 会话：
  - 运行模式下，若当前没有 conversation 会话，进入运行阶段时自动创建「运行对话」；
  - run 结束后自动追加一次（同一 run 去重）；
  - 结果面板提供手动「写入对话」，供设计模式或切换会话后重试。
- run session（RunResult）与 conversation session（消息）保持分离；「保存到会话」仍只生成 run session。

**后果**

- conversation 会话开始有真实写入路径，会话历史不再永远为空；
- 失败调用可能留下以 user 消息结尾的历史；append 使用 SessionHistory 重建而非严格 commit，避免一次失败阻塞后续写入；
- 同一 run 的消息只追加一次；切换会话后手动写入会写到新会话；
- 消息写入发生在 run 结束后，不是节点执行中实时流式写入；实时写入与聊天输入留到后续；
- 手动聊天输入仍缺少入口，Agent 会话的持续对话尚未接入。

**否决**

- 把 RunResult 直接塞进 conversation history：违背 ADR-020 的 kind 分离；
- 每个 run 自动新建 conversation 会话：会话树噪音大，且无法选择目标；
- 在通知层（`node:end` 事件）重建消息：缺少 Agent 的 system / tool / usage 信息。

---

## ADR-023：运行页与动画原语

> 状态：独立 `flow-runner` 运行页已由 ADR-027 移除；`RunView` 契约保留，但 `harness-designer` 在 2026-11-27 起改为在同一 `View` 内渲染运行上下文条。

**背景**

M7.5 需要工作台在运行阶段有独立视图，并让运行过程“可看”：节点在执行、连线在流动、视口跟随当前节点。ADR-003 / ui.md 的目标 `CanvasAnimationApi` 一直未实现；如果现在引入完整动画 API，会牵动事件映射、Canvas core 与多个工作台，收益不明。

**决定**

- `WorkbenchDefinition` 增加 `RunView`，`WorkbenchHost` 按 `mode` 选择；`View` 是配置 / 编辑视图，`RunView` 是运行视图。
- 新增参考实现 `flow-runner` 工作台：固定只读画布 + 运行控制（运行 / 暂停 / 继续 / 取消）+ 节点时间线 + 「返回配置」；实例仍持久化 `mode / runId / sessionId`。
- 动画不复刻 `CanvasAnimationApi`，先复用节点/边状态与 CSS：
  - **pulse**：`SciFiNode` 在 `running` 状态使用 CSS box-shadow 脉冲；
  - **flow**：`SciFiEdge` 的 active 边沿用流动虚线；
  - **focus**：运行页把当前 running 节点转成 `CanvasView.focusNode`（带 seq），由画布把视口聚焦到该节点；
  - 全部动画遵守 `prefers-reduced-motion`。
- `harness-designer` 的运行阶段仍复用设计画布与浮动面板（“画布 + 结果 + 会话”），不改成独立只读页；需要固定只读运行页的场景使用 `flow-runner`。

**后果**

- 运行页有可复用参考，动画成本低且不新增依赖；
- 动画语义仍分散在节点 / 边状态与 CSS，不是工作台可调用的统一 API；后续需要时再抽出 `CanvasAnimationApi` 包装这些状态；
- `flow-runner` 使用只读 `CanvasView`，不承担编辑与自动保存；
- 运行页的焦点跟随只在 `flow-runner` 中启用，设计器运行模式保持用户视口。

**否决**

- 现在实现完整 `CanvasAnimationApi`：事件→动画映射与多工作台适配成本高，当前需求用状态 + CSS 已覆盖；
- 引入动画库：与“CSS 优先、无额外依赖”的既有决定冲突；
- 把 `harness-designer` 运行阶段改成只读运行页：与“画布 + 结果面板 + Session 导航”的目标不一致。

---

## ADR-024：工作台模板与 .fhws 导入策略

**背景**

M8 需要让新建工作台不止是“空实例 + 当前图”，同时把长期只有 main 通道的 `.fhws` 整工作区导入导出接到 UI。导入时可能出现同名工作区，需要明确冲突策略。

**决定**

- 工作台模板放在 renderer 的 `workbench/templates.ts`：每条模板声明目标 `type`、默认实例标题、可选 `createGraph(graphId)`。创建流程复用现有保存文档 → 刷新 → 打开，不引入新的持久化格式。
- 当前模板：Harness 设计器（空白 / 当前工作流）、节点清单、批量运行、运行页（空白 / 当前工作流）。
- `.fhws` 导入导出通过 main 的系统对话框（`workspace:exportArchive` / `workspace:importArchive`），文件菜单提供入口。
- 冲突策略：导入**总是创建新 workspace id 的工作区副本**，不合并、不覆盖现有工作区；档案不包含 `runs/` 与 `sessions/`（沿用 ADR-005 的导出范围）。
- 节点预设继续使用 wireclaw `NodePresetLibrary`；M8 增加“图片生成”预设，共 4 条内置预设。用户预设库的导入导出留作后续。

**后果**

- 新建工作台可从空白 / 当前工作流起步，模板本身不产生额外 schema；
- `.fhws` 导入可重复执行，每次得到独立副本；同名工作区会并列存在，由 id / 路径区分；
- 导入不包含运行与会话，迁移后需要重新运行；
- 模板列表是静态数据，新增工作台类型时需要同步模板；未注册类型会在打开时进入“未知工作台”空态。

**否决**

- 导入时按名称合并 / 覆盖：与单写者、无迁移表的现状冲突，容易静默丢数据；
- `.fhws` 包含 runs / sessions：体积与敏感数据风险高，且当前没有完整迁移约定；
- 模板保存为独立文件格式：当前模板只是创建参数，复用现有文档 API 足够。

---

## ADR-025：删除工作流时解除工作台引用

**背景**

M7.1 起 `deleteDocument` 会检查 `documents/workbenches` 引用：只要有任何工作台实例绑定该图（包括当前正在打开的工作台），删除就返回 `E_CONFLICT`。实际使用中这挡住了最常见的操作——删除当前正在编辑的工作流。工作台实例在 ADR-019 里只是“视图 + 绑定”，不是数据所有者，不应因为一份展示绑定而阻止数据删除。

**决定**

- main 的 `WorkspaceStore.deleteDocument(harness)` 在删除前**解除引用**：
  - 从实例 `graphs` 移除该 graphId；
  - 从 `plan.graphs` 与 `plan.bindings` 移除相关条目；计划为空时 `plan = null`；
  - 更新实例 `updatedAt`，不删除实例本身。
- renderer 删除成功后重新读取文档列表与当前工作台实例；若删除的是当前打开的图，按以下顺序回退：
  1. 本次会话中上一条渲染过的工作流（切换历史）；
  2. 工作台实例仍绑定（已解除后）的第一条图；
  3. 文档列表第一条；
  4. 都没有时保持 `null`，设计器显示空态，**不再自动新建**。
- 工作台 `canOpen` 允许空 `graphs`，由各视图显示空态；空态提供「新建工作流」，创建后按现有 primaryGraph 绑定逻辑重新绑定。
- `WorkbenchInstance.graphs` 的权威绑定语义不变：选中工作流仍会同步 primaryGraph。

**后果**

- 删除当前工作流不再报错；删除最后一个工作流后进入空态而非隐式重建。
- 删除会修改其他工作台实例文档（仅移除引用），因此 renderer 在删除后刷新工作台列表与实例 revision。
- `plan-runner` 的计划可能因删除而变空，需要重新选择图。
- 视觉 / 交互回归由 `designer-doc-flow` 场景与单测覆盖（workspace-store 引用解除用例）。

**否决**

- 保留 `E_CONFLICT`，由 UI 先询问“解除全部绑定？”：多一步确认，且用户意图已是删除，绑定只是展示状态。
- 删除时静默删除整个工作台实例：会丢失实例标题、布局、mode 与会话绑定。
- 删除后自动新建 `main` 工作流：用户看到的是“刚删掉的东西又回来了”，与明确删除的意图冲突。

---

## ADR-026：工作区级节点库、插入菜单与「节点清单」退场

**背景**

M2 的节点库只有 4 条写死在 `designer/core/presets.ts` 的内置预设，插入入口是画布右键的临时浮层；用户无法保存自己的节点组合，也无法整理。M5 为验证框架复用做过一个 `graph-table`「节点清单」工作台，它只是表格演示，与节点预设无关，名称也和“节点库”混淆。

**决定**

- 节点库改为**工作区级数据**：`documents/presets/library.json`，通过 `DocumentRef { kind: "presetLibrary", id: "library" }` 复用 WorkspaceStore 的 read/save（revision、原子写、4 MB 上限），不新增 main 服务与 IPC。
- 库文档结构：`{ schemaVersion: 1, folders: PresetFolder[], presets: PresetRecord[] }`；预设记录保存 `id / name / description / type / typeVersion / config / tags / folderId / 时间戳`，`id` 即 wireclaw `NodePresetDocument.presetId`。文件夹只有稳定 id + 标题 + parentId，类似 Session 树。
- 内置 4 条预设继续用代码维护，插入菜单里作为「内置预设」展示；用户库独立，管理 UI 只编辑用户库。
- 创建路径：画布节点右键「创建预设节点」→ 命名 / 简介 / 文件夹 Modal → 捕获当前节点 `type / typeVersion / config` 写入工作区库；创建后打开管理模式并定位到新预设。
- 两套 UI：
  - **插入菜单**（`NodeLibraryPalette`）：最近使用 → 用户库（按文件夹分组）→ 内置预设 → 节点类型；支持搜索、↑↓ + Enter、条目拖拽到画布（HTML5 DnD + `CanvasView` 屏幕→画布坐标换算）。
  - **管理模式**（`PresetManagerDialog`）：左右结构，左侧文件夹 / 预设树，右侧编辑名称、简介、所属文件夹与按 `configSchema` 渲染的默认参数；支持新建文件夹、重命名、删除（删除文件夹时内容上移）。
- 全局入口：标题栏「视图 → 节点库 / 管理节点库…」与 `Ctrl+Shift+N` / `Ctrl+Shift+M`；画布右键「添加节点」仍打开插入菜单并锚定光标。
- `graph-table` 工作台与对应模板删除；旧实例在 `WorkbenchHost` 显示“已由节点库取代”的说明，不再注册新类型。

**后果**

- `.fhws` 导出自动包含 `documents/presets/library.json`；导入副本也会带上节点库。
- 节点库大小受 4 MB 文档上限约束；预设 config 需保持 JSON-safe。
- 全局快捷键与标题栏菜单通过 `presets/bus.ts` 通知工作台 View，不引入新的全局状态库。
- 暂不提供独立于 `.fhws` 的节点库导入 / 导出 UI（M8 剩余项），也不提供文件夹拖拽排序。
- 旧 `graph-table` 实例需要用户手动删除或切换工作台。

**否决**

- 放 AppConfig / userData（应用级）：与“工作区级预设库”的 M8 目标冲突，且无法随 `.fhws` 迁移。
- 新增 `PresetStore` + IPC：预设库就是一份 JSON 文档，复用 `readDocument / saveDocument` 的 revision 与原子写更简单。
- 把内置预设写进每个工作区的库：升级预设置时需要迁移，且用户删除后无法恢复；内置与用户库分离更可控。
- 保留 `graph-table` 工作台：表格只读演示价值低，名称与节点库冲突。

---

## ADR-027：移除独立运行页，运行复用设计器画布

**背景**

M7.5 引入了 `flow-runner` 工作台作为“固定只读运行页”的参考实现：进入运行是另一个工作台实例，靠是否可编辑、是否有时间线来区分。实际使用中，用户点击运行后最终仍回到设计器画布；独立运行页只是同一张图、同一套运行控制的另一种外壳，增加了工作台类型、模板与导航分支，却没有带来新的运行能力。

**决定**

- 删除 `flow-runner` 工作台及其 2 条模板；`WorkbenchHost` 不再注册该类型；`workbench/templates.ts` 收敛为 3 条模板（Harness 空白 / 当前、批量运行）。
- 运行统一在 `harness-designer` 内完成：`design` / `run` 仍是同一实例的模式切换，运行上下文条在同一 `View` 内按 `mode` 渲染，主视图仍是同一张画布与浮动面板；`harness-designer` 不再声明 `RunView`（契约保留给未来工作台），切换阶段不重挂载 `DesignerView` / `CanvasView`。
- 运行期间由现有 `editingDisabled` 逻辑把画布设为只读（执行中 / 暂停中 / 控制中 / 保存冲突），结束或返回设计后恢复编辑；不再需要单独的只读工作台来禁止编辑。
- 只读期间节点仍渲染内联控件与输入端口槽（仅 disabled），保持节点高度与连线锚点不变，避免点击运行时画布布局跳动。
- 旧 `flow-runner` 实例在打开工作区时迁移为 `harness-designer`：保留 graph 绑定与标题（标题为“运行页”时改为“主工作台”），`mode = design`、`runId = null`；`WorkbenchHost` 仍保留兜底说明，避免迁移失败时进入未知工作台。
- 移除 `designer-flow-runner` 截图场景；M7.5 的视觉基线不再保留该场景。

**后果**

- 工作台类型收敛为 `harness-designer` / `plan-runner` 两种（加旧的 `graph-table` 兜底说明）；模板从 5 条减到 3 条。
- 运行时的画布只读、动画（节点 pulse / 活跃边）与运行日志（含可定位问题行）仍可用，但不再提供独立运行工作台的“固定工作流 + 时间线”外壳。
- 设计 → 运行的模式与 `mode / runId / sessionId` 持久化不变；`flow-runner` 实例迁移是一次性文档写入。

**否决**

- 保留 `flow-runner` 但隐藏入口：仍要维护第二套运行页面与模板，收益为零。
- 删除 `RunView` / `mode`：设计器运行阶段的上下文条与实例 `mode` 恢复仍需要它们。
- 迁移时把旧实例改成 `plan-runner` 或删除：会丢失 graph 绑定和标题。

---

## ADR-028：运行即自动创建会话并逐步写入

**背景**

M7.4 / M7.4.2 的运行结果是临时的：结果页签只在运行结束后汇总 `RunResult`，「保存到会话」和「写入对话」要用户手动点；选中 conversation 会话时才自动追加消息。实际使用中用户更希望“点运行就得到一条会话”，运行过程本身也应该在会话面板里逐步可见，而不是等结束后再决定保存。

**决定**

- 点击运行时自动在**工作区草稿目录**创建一条空 conversation 会话（无草稿目录时放根目录），标题为「运行 · <工作流> · HH:mm」；立即选中并自动打开「会话历史」浮动面板。
- 运行过程按 `RunResult` entries 增量写入该会话：
  - wireclaw `GraphRun` 暴露只读 `resultEntries`（RunResultCollector 快照）；
  - main 新增 `run:entries` 读取当前 / 已完成的 entries；
  - renderer 运行中每 450ms 轮询，按 entry `id` 去重，通过 `session:appendEntries` 追加消息；运行结束再补最后一批；
  - ModelCall / Agent entry 仍走 ADR-022 的消息转换规则（system / user / assistant / tool）。
- 运行结束时再把输出摘要（每个输出端口的文本 / JSON / 附件标记）作为 system 消息通过 `session:appendMessage` 写入，保证 Constant → Output 这类没有模型条目的工作流也有结果可查。
- 移除运行日志的「结果」页签和「保存到会话 / 写入对话」按钮；`RunResult` 仍持久化到 `runs/<runId>/result.json`，run session（`kind: "run"`）与 `session:saveRun` / `session:appendRun` 接口保留给旧数据与后续导出，但不再有 UI 入口。
- 进入运行模式不再自动创建「运行对话」会话；会话只在真正点击运行时创建。

**后果**

- 每次运行都会在草稿目录产生一条会话，Session 树计数与历史面板随之刷新；同一 run 的条目按完成顺序出现，粒度为节点完成，不是 token 级流式。
- `session:appendEntries` 会校验 entries（复用 RunResultSerializer 的合成结果），无效数据返回 `E_INVALID_ARGUMENT`。
- 输出摘要以 system 消息呈现；附件展示仍通过 `[附件 <hash>]` 文本标记，不内联二进制。
- 运行中关闭 / 重载 renderer 会丢失轮询，但已写入的会话消息与 `runs/<runId>/result.json` 保留；重新打开会话仍可查看已写入部分。

**否决**

- 只在运行结束后写入一次：会话面板在长时间运行中始终为空，不符合“逐步弹出”。
- 仅从 `node:end` / `node:stream` 事件重建消息：缺少 system prompt、usage、thinking 与 Agent 工具调用，且与 RunResult 双轨。
- 自动创建 `kind: "run"` 会话存 RunResult：需要实时更新整个 RunResult 文档，且会话历史以结果视图为主，不符合“逐条消息”的交互。
- 保留结果页签：与自动会话重复，且用户明确要求移除。

---

## ADR-029：API Key 与 Provider Profile 分离

**背景**

现有 `AppConfig.providers` 把协议、实例、端点、默认模型和密钥引用压进 `ProviderConfig`，密钥按 `providerId` 存放在 `SecretsStore`。设置页每个 `kind` 固定一条，无法同协议多密钥 / 多区域；模型目录只在 `providers:test()` 后存在于 main 内存，重启丢失；`core.model` / `core.model.call` 不声明 requirements，节点只能手填 `providerId` / `modelId`；HTTP 错误只保留字符串，无法区分 401/403 与 402/429。

**决定**

- **API Key 是协议凭据**：`ApiKeyRecord { id, protocol, label, baseUrl?, status, lastCheckedAt, lastError?, fingerprint?, createdAt, updatedAt }`。明文只存在于 main 的 `secrets.bin`，以 key id 为条目键；库文件只保存不可逆指纹与健康元数据。
- **Provider Profile 是图里的实例**：`ProviderProfile { id, label, adapter, apiKeyId?, baseUrl?, defaultModelId?, enabled, models, modelsFetchedAt, modelsSource }`。`adapter` 表达“协议 + 能力”（`deepseek.chat` / `qwen.image` / `minimax.video` / `ollama.chat`），与协议解耦；同一协议可由多个 profile 复用不同 key / 端点。
- 图节点只引用 `providerId`（profile id）与 `modelId`；API Key、密文与密钥引用不进入 `GraphDocument`、节点预设库或 `.fhws`。预设只捕获 profile + model。
- 健康状态机：`unverified` / `active` / `invalid` / `quota` / `network`。只有 401/403 标记 `invalid`；402/429 只记 `quota`，凭据仍视为有效。失效 key 仍可选择，节点显示警告，是否运行由用户决定。
- 模型目录持久化在 profile 上（`id / name / 能力摘要 / fetchedAt / source`）；启动不联网，刷新由显式动作触发；下拉优先使用持久化目录。
- Provider/Key 库是应用级独立数据（ADR-030），便于后续把用户配置统一打包导出。

**后果**

- 换 key 只需改 profile 的 `apiKeyId`，所有引用该 profile 的节点自动生效；不需要批量改图。
- 旧 graph 的 `providerId` 必须继续有效，因此迁移保留旧 id（`ollama` / `deepseek` / `minimax` / `qwen`）。
- 渲染进程只能拿到 profile、key 元数据、指纹与健康状态，拿不到明文；验证网络请求只在 main 发起。
- 生成类 Provider 进入同一套库后，Model Call 可按能力过滤模型；Qwen image / MiniMax image/video 不再需要另造一套配置体系。

**否决**

- 在节点里直接选 API Key：密钥引用会进入图和预设，导致换 key 要改图、共享 / 导出容易泄漏凭据。
- 只保留 `ProviderConfig` 并允许多条同 kind：协议与能力仍然混在一起，生成类 Provider 无法表达，健康状态也无处持久化。
- 把密钥放进 workspace 或 `.fhws`：凭据是用户 / 机器级数据，不属于某个工作区；导出会泄漏。
- 只把模型目录放内存：重启后下拉为空，等于回到手填。

---

## ADR-030：Provider 库的存储与两阶段迁移

**背景**

M9 需要在不破坏现有设置页与运行链路的前提下引入新库。旧配置在 `AppConfig.providers`，旧密钥以 providerId 存在 `secrets.bin`；两者都仍被当前 `ProviderRegistry` 使用。

**决定**

- 新库文件：`%APPDATA%/FlowHarness/provider-library.json`，`schemaVersion: 1`，结构 `{ schemaVersion, keys, profiles }`；密钥仍写现有 `secrets.bin`，格式不变，条目键改为 key id。
- `ProviderLibraryStore`：宽容读（丢弃坏条目、清空失效 key 引用）、严格写（重复 id / 缺失 key / 协议不匹配直接拒绝）、原子写；损坏文件备份为 `<file>.corrupt-<timestamp>.json` 后以空库继续；更高 `schemaVersion` 抛 `E_MIGRATION`，绝不覆盖。
- **阶段一（M9.1，影子迁移）**：库文件不存在时，首次启动把 `AppConfig.providers` 转成 profile（保留 id），把旧 secrets 复制到 `key_<id>`；旧条目暂时保留，`AppConfig` 仍为 schemaVersion 1，旧设置页继续可用。
- **阶段二（M9.3，UI 切换）**：新设置页接管后，`AppConfig` 升到 schemaVersion 2 并移除 `providers`；只有在库文件确认存在后才 `finalizeMigration()` 落盘，否则保留 v1 供下次重试；旧 secrets 镜像在新 key 的 secret 确认存在后删除。
- 模型目录随 profile 持久化；`.fhws` 明确不包含 Provider 库与密钥；导入缺 profile 的工作流时按节点警告处理。

**后果**

- 两阶段迁移保证每个会话结束应用仍可运行，且旧 graph 不受影响。
- 库文件损坏会丢失 profile/模型元数据（密钥仍在 `secrets.bin`），备份文件可用于人工恢复。
- `AppConfig` v2 的落盘被推迟到 Provider 库可用之后；如果库写入失败，配置仍保持 v1，下次启动可以重新迁移，不会出现“v2 配置 + 空 Provider 库”。
- M9.1 / M9.2 期间旧设置页的变更在 M9.3 切换时不再合并（旧页面已移除）；迁移以启动时读到的旧配置为准。
- 未来把配置统一打包导出时，只需导出 `provider-library.json` 与加密 secrets 的受控副本，不影响工作区格式。

**否决**

- 一次性切到 v2 并删除 `providers`：M9.1 阶段旧设置页会失效，违反“每轮结束保持可运行”。
- 把库塞进 `AppConfig`：模型目录与密钥元数据体积、更新频率和健康状态都不适合与主题 / 窗口配置混在一起，也不利于后续整体迁移。
- 迁移时删除旧 secrets：一旦新库写入失败会同时丢失旧密钥；阶段一只复制不删除。
- 迁移时改写 providerId：所有旧 graph 的 `core.model` 绑定会失效。

---

## ADR-031：Provider 节点与 provider 端口

**背景**

M9.4 的 Model 节点已能通过下拉选择 Provider，但同一 Provider 被多个 Model 复用时仍要重复选择；用户希望用 Provider 节点统一声明并连线到 Model。编码前评估过三种方案：

- A：不新增节点，只用 Model + 预设；
- B：`core.provider` 输出完整 `model` 绑定，直接接 Model Call；
- C：`core.provider` 输出 provider 引用，Model 节点增加 provider 输入。

**决定**

采用 **C**。在 wireclaw Harness 层新增 `provider` 端口值类型与 `ProviderRef { providerId }`；`core.provider` 输出引用，`core.model` 增加可选 `provider` 输入；连接优先，`config.providerId` 作为未连接回退。Provider 节点只保存 providerId，不持有 Provider 实例、密钥或模型目录。

**后果**

- Provider 复用变成显式连线；Model 仍可独立使用下拉，不强制新增节点。
- 旧 graph 不需要迁移：没有 provider 边时行为不变，config.providerId 继续生效。
- `provider` 值是 JSON-safe 的 `HarnessValue`，沿用现有 run / checkpoint / 序列化；端口类型兼容由 `Graph.validate` 检查。
- 设计期健康由 Provider 节点负责 profile / key；连接后的 Model 不再重复报同一 profile 问题，只检查 modelId / 目录。

**否决**

- A：无法表达“一个 Provider 被多个 Model 复用”的连线关系。
- B：只能把 provider + model 整体绑定，Model 节点无法复用 Provider 节点；语义也比 C 更窄。
- 把完整 Provider 配置 / 密钥塞进图值：违反“密钥只在 main、图只引用 id”的边界，并会让 checkpoint / 导出泄漏敏感信息。

---

## ADR-032：Provider 连接期约束与节点内联选择

**背景**

M9.5 的 Provider 节点只在 Body 显示 Provider 摘要，切换 Provider 要进检查器；Model 的 `providerId` 是普通下拉，即使已经通过连线接入 Provider 节点仍然可改。连接来源与 config 值不一致时，Inspector 显示的 Provider 与运行实际使用的 Provider 不同；切换 Provider 后，旧 `modelId` 可能已经不在新目录中，却仍保留在 config 里直到运行前才报错。

**决定**

- Provider 节点 Body 直接渲染 Provider 下拉；选项来自 Provider 库，缺失的当前值用占位项保留，写入仍走 `updateNodeConfig`。
- Model 的 `provider` 输入存在来源 Provider 时：
  - 检查器 Provider 字段显示来源 Profile 并禁用，同步写入的 config 也保留原 `providerId`（连接仍优先，config 保留为断开后的回退）；
  - 节点 Body 的 Provider 输入槽显示来源 Profile 名称，而不是端口名；
  - Model 下拉使用来源 Provider 的模型目录。
- 连接 Provider、切换 Provider 节点、或连接中改写 Model config 时，用 Provider 库的持久化模型目录校验 `modelId`；目录非空且不包含该模型时，删除 `modelId` 并弹出「模型已清空」警告，要求用户重新选择。
- 目录为空（尚未刷新）时不做清空，避免把旧图误判为不兼容。

**后果**

- Provider 的权威值从“连线 + config 二选一”收敛为“连线优先且可观察”；检查器不再显示与应用实际选择不一致的值。
- 连接 / 切换 Provider 可能修改多个 Model 节点并进入撤销栈；提示是可关闭的警告，不阻塞后续编辑。
- 不兼容模型不会在运行前才暴露；但 Provider 目录未刷新时仍只能依赖运行期错误。
- 不新增图字段，旧图与 `.fhws` 不需要迁移。

**否决**

- 只在运行前校验、不自动清空：用户仍会看到无效 modelId，且切换 Provider 后无法立即重新选择。
- 连接时删除 config.providerId：断开连接后模型失去回退值，旧图的回退语义也会被破坏。
- 把 Provider 目录写进图：目录属于应用级数据，会让导出与 checkpoint 携带易变信息。

---

## ADR-033：Constant 阅读态与编辑态分离

**背景**

Constant 一直是单行 `<input>`：正文被压成一行，长文本只能横向滚动；浏览器拼写检查会在节点里画出红色波浪线；想在节点上看全文或换行编辑都没有入口。节点宽度固定，直接换成 TextArea 会让所有 Constant 节点长期占据更大高度。

**决定**

- 非编辑态渲染 `<p>`：正文按 200 字符裁剪，CSS 最多显示 3 行；hover 用 Tooltip 展示最多 400 字符。
- Tooltip 使用与浮动面板一致的半透材质（`--fh-panel-bg` + `--fh-panel-alpha`），不再使用不透明 `--fh-surface-overlay`。
- 标题栏增加铅笔 / 对勾小按钮切换编辑态；编辑态把正文换成随内容自增高的 TextArea，高度上限 180px，超出后内部滚动；退出编辑态恢复 p 标签。
- 两种模式都设置 `spellCheck={false}`、`autoCorrect="off"`、`autoCapitalize="off"`，移除浏览器拼写错误下划线。
- 进入编辑态不清空节点高度状态；运行 / 只读时按钮禁用并自动退出编辑态。

**后果**

- 默认画布更紧凑，长文本有明确的查看与编辑路径；节点高度只在用户主动编辑时增长。
- 200 / 400 字符是渲染裁剪，不修改 GraphDocument 中的真实文本；正文仍完整保存。
- Tooltip 材质变化影响所有使用 `ui/Tooltip` 的位置，视觉上与浮动面板统一。
- 依赖 Radix Tooltip 的 hover / focus 行为；画布中的 p 需要 `tabIndex` 才能获得键盘焦点。

**否决**

- 始终使用 TextArea：节点默认变高，画布密度下降，且只读时仍保留输入框语义。
- 只做 CSS 省略号、不做字符裁剪：无法满足长文本 hover 查看的确定上限。
- 用浏览器原生 title 做 Tooltip：样式不受 tokens 控制，无法统一半透材质。

---

## ADR-034：浮动面板布局按 Graph 持久化

**背景**

设计器内部的属性 / 运行日志 / 会话历史浮动面板此前只存在于 App 内存：切换 Graph、重载或重启后每次都回到默认位置，用户需要反复摆放。面板属于某张工作流的编辑上下文，不同 Graph 的节点密度与视口不同，布局也不应互相覆盖。

**决定**

- 布局写入 `GraphDocument.ui.panels`：按 `inspector` / `run-log` / `session-history` 记录 `open / collapsed / x / y / width / height / z`；`x` / `y` 为 `null` 表示使用容器计算的默认位置。
- `useFloatingPanels` 增加 `applyLayout(layout | null)`：按 id 合并保存值，缺失面板恢复默认；同时把 z 栈顶抬到保存的最大值。
- 设计器在文档加载完成后读取一次 `ui.panels` 并应用；切换文档时重置已恢复标记。面板拖动 / 缩放 / 折叠 / 开关变化后 400ms 写回当前文档，使用 `replaceDocument(..., { history: false })`，不进入撤销栈。
- 保存布局时保留 `ui.viewport` 与其他未知键；没有保存布局的图应用默认布局，并在首次变化后写入。
- 布局随 GraphDocument 导出 / 导入；`.fhws` 与 Harness JSON 均自然携带。面板只是 `ui` 子结构，不进入运行语义。

**后果**

- 同一 Graph 重新打开或重启后还原面板位置、尺寸、折叠与开关状态；不同 Graph 各自独立。
- 面板操作会产生一次自动保存，但不产生撤销记录；拖动连续更新只在停稳后写一次。
- 旧图没有 `ui.panels` 时按默认布局打开，首次打开可能写入一次默认布局。
- 容器尺寸变化时仍由 `FloatingPanel` 钳制，并把钳制后的坐标写回。

**否决**

- 存到 AppConfig / localStorage：布局与 Graph 绑定，按工作区或应用全局保存会让不同图互相覆盖。
- 存到 WorkbenchInstance：一个实例可绑定多张图，切换图时仍要额外键；`ui` 本来就是 wireclaw 预留的可移植设计器布局槽位。
- 每次 pointermove 都保存：写入与画布重渲染过于频繁；改为 400ms 停稳防抖。

---

## ADR-035：模型目录按需自动刷新

**背景**

Provider Profile 的模型目录只在设置页显式刷新，新建 / 迁移的 Ollama profile 目录为 `[]`。用户把 Provider 接到 Model 后，Model 下拉只剩当前失效模型，无法从列表选择；用户也不一定知道要先去设置页刷新。

**决定**

- 设计器收集当前 Graph 中 Model 节点引用的 Provider Profile；仅当目录为空、没有 `modelsFetchedAt`、profile 可用且启用时，在后台调用 `provider:models:refresh`。
- main 的 `refreshModels` 成功后把模型列表、`modelsFetchedAt`、`modelsSource` 写回 `provider-library.json` 并广播 `provider` topic；renderer 收到后更新下拉，列表跨重启保留。
- 每个 profile 在一次文档会话内最多自动尝试一次，避免网络失败时反复请求；失败保留空目录，并在 Model 的 Model ID 字段下方显示错误，用户可到设置页手动重试。
- `modelsFetchedAt` 已存在时空目录不再自动刷新，视为“已检测但没有模型”。
- 自动刷新只在存在 Model 引用时触发，Provider 节点单独存在不联网；启动时仍不批量请求所有 Provider。

**后果**

- 首次打开 / 新建引用某个空白 Provider 的工作流时会产生一次实际模型目录请求；有 Ollama / 有效 key 时列表自动可用。
- 刷新失败会让 Provider key 健康状态按 401/402/网络分类更新；Model 检查器显示失败原因。
- 成功结果持久化在应用级 Provider 库，不进入 `.fhws`；不同工作区共享同一 Provider 目录。

**否决**

- 启动时刷新所有 Provider：违背“启动不联网”，且大量无关请求会拖慢启动。
- 只在设置页刷新：用户从 Model 下拉看不到模型，容易误以为 Provider 不可用。
- 失败后每次渲染重试：网络不可达时会形成请求风暴。

---

## ADR-036：节点内联属性覆盖全部内建 config

**背景**

此前节点 Body 只内联少数高频字段，Model 的 Provider / Model ID、Model Call 的 System / 思考参数、Agent 的工具与 temperature、ToolSet、Subgraph / Loop / ForEach 的内嵌图等仍要打开检查器。用户在画布上逐节点调整时需要频繁切换面板，且 Model ID 在节点上完全不可见。

**决定**

- 节点 Body 按节点类型渲染完整的可编辑 config 字段，不再依赖检查器才能修改。
- Model 节点显示 Provider 与 Model 两个 FH 下拉；Provider 输入已连接时 Provider 下拉锁定，Model 仍可改。
- 文本类字段使用紧凑输入 / TextArea；枚举用下拉；boolean 用勾选框；字符串数组用逗号分隔输入；对象与内嵌 Graph 使用紧凑 JSON TextArea，失焦解析、失败就地提示。
- 复杂 JSON 字段不引入专用编辑器，避免在 220px 节点内做第二套图编辑器；检查器仍保留完整表单 / JSON 视图。
- 只读（运行 / 冲突）期间保持同一套控件结构并禁用，节点高度和端口锚点不因运行状态跳变。

**后果**

- 节点默认高度随 config 字段增加；Model Call / Agent / 复合节点明显变高，密集画布需要更大的节点间距。
- 所有编辑仍走 `updateNodeConfig` 与既有撤销 / 自动保存；JSON 字段只在失焦时提交，避免逐键写整图。
- 新节点类型若不提供 configSchema，仍回落到摘要；新增字段时需在 `InlineNodeConfig` 补对应控件。
- 内嵌 Graph 的 JSON 编辑仍不如检查器舒适，但满足“不打开属性栏也能改”的目标。

**否决**

- 把所有字段塞进检查器：用户已明确要求节点上直接修改。
- 在节点内实现完整的 schema 表单：220px 宽度下标签 / 提示成本过高，且会重复检查器。
- 为内嵌图单独做节点内图编辑器：交互复杂，当前 JSON 文本域足够表达且可回退。

---

## ADR-037：表单控件统一——FH 下拉、无聚焦描边、上游锁定只读

**背景**

节点内联仍有原生 `<select>`（Constant 的 text/json、Model Call 的 mode / modality、Agent 的 permission、Log 的 level）：弹层是系统样式，聚焦时还会套上全局 `:focus-visible` 的青绿描边。布尔字段（Value 的必填、Model Call / Agent 的思考、Loop 的失败重试、批量运行的图选择）仍是原生 checkbox，未被选中时是系统灰底方块。Model 的 Provider 连接上游后虽然被禁用，但仍渲染成下拉，界面上看起来仍像一个可编辑入口。

**决定**

- 节点内联枚举全部改用 `ui/Select`（Radix DropdownMenu + FH token），通过 `inlineSelect` 保留 22px 紧凑高度、3px 圆角与默认边框；菜单沿用检查器同一套 FH 弹层。
- 全局移除 `input` / `select` / `textarea` 的 `:focus-visible` 描边与 focus 期的边框变化；焦点只由光标表达。按钮、图标按钮等非表单控件仍保留 `--fh-border-focus` 焦点环。
- 布尔字段统一 `ui/Checkbox`（隐藏原生外观、自绘方框）；画布节点使用新增的 `compact` 变体（12px 方框、10px 文案、不占 32px 控件高度）。
- 被上游连接固定的字段不再渲染“禁用下拉”，改为只读行：锁图标 + 来源值 + 「上游」，hover 提示修改位置。来源值由工作台投影注入（`CanvasLockedField { value, reason }`），Canvas 只透传，不解释 Provider 语义。

**后果**

- 表单控件在深 / 亮主题下外观一致，节点与检查器使用同一套下拉与勾选原语；节点内联不再出现系统弹层。
- 键盘焦点在表单控件上不可见（与既有 `Input` 的约定一致）；可访问性依赖标签、光标与 aria-label。
- 上游锁定从“看起来可编辑但点不动”变为明确的只读信息；`lockedFields` 的类型由 reason 字符串升级为 `{ value, reason }`，`adapter` / `NodeVisual` / `SciFiNode` 只做透传。
- 节点高度不因锁定态变化；断开连接后回退值仍是 `config.providerId`（ADR-032）。

**否决**

- 只把原生 `<select>` 的聚焦描边去掉：弹层仍是系统样式，与 FH 菜单并存。
- 给表单控件换中性色焦点环：用户明确要求输入框与下拉不显示聚焦边框。
- 继续用禁用下拉展示上游值：控件语义仍是“可编辑”，且无法直接读出“来自上游”。

---

## ADR-038：JSON 字段使用代码主题

**背景**

检查器「JSON」页签、节点内联的 `parameters` / `hostTools` / 内嵌图 JSON 都是纯文本 textarea：没有键、字符串、数字的区分，长 JSON 难以扫读，错误也不易定位。与此同时项目没有编辑器依赖，也不希望为此引入 Monaco 级别的体积。

**决定**

- 新增 `ui/CodeArea`：透明 textarea（负责光标、选择、输入法、撤销与滚动）+ 同字体高亮层（`<pre aria-hidden>`）叠放，滚动位置由 `onScroll` 同步。
- 新增 `ui/json-highlight.ts`：把 JSON 源码扫描为 key / string / number / boolean / null / punctuation / plain token；只做展示层分词、不校验结构，无法识别的内容原样保留，保证拼接后与原文逐字一致。
- 颜色走新 token `--fh-code-*`：深色取 VS Code Dark+ 的去饱和版本（键 `#9cdcfe`、字符串 `#ce9178`、数字 `#b5cea8`、字面量 `#569cd6`），亮色给出对应浅色值。
- 接入三处：节点内联 JSON（10px 紧凑变体）、检查器 schema 表单里的 JSON 字段、检查器「JSON」页签；节点内联的高度仍由行数决定，超出后在控件内滚动。
- Constant 阅读态（2026-11-27 同日修正）：JSON 类型的截断预览同样经过 `JsonCodeText` 着色，和编辑态使用同一套 token 颜色与等宽字体。
- 不引入第三方编辑器；只支持 JSON，不做自动补全、折叠或校验提示。

**后果**

- JSON 在编辑态即可读出色块结构；选中、复制、输入法行为不变。
- 高亮层与 textarea 必须共享字体、字号、行高与内边距，否则光标与字形错位；换行被禁用（`wrap="off"`），横向滚动由 textarea 驱动。
- 纯展示分词对超大 JSON 会生成较多 span；当前 config 规模（4 MB 上限、常见几百行）可接受，后续若需要再换虚拟化。
- `json-highlight` 是纯函数，可单测；`CodeArea` 仍是薄组件，没有新增运行期依赖。

**否决**

- 引入 Monaco / CodeMirror：体积、主题与 Electron 集成成本远高于当前需求。
- 只读时高亮、编辑时纯文本：用户在编辑时最需要辨认结构。
- 用 `<textarea>` + CSS 渐变模拟着色：无法按 token 精确上色。

---

## ADR-039：未选择模型只做节点提示，不再阻断运行

**背景**

Model 节点清空模型（下拉选择「未选择模型」）后，Provider 问题收集把它作为 `error`：画布顶部立刻出现「无法运行：Provider 配置存在问题」横幅，运行按钮同时被禁用。用户只是把模型暂时清空、准备重新选择，却先收到一条无法运行的错误；同一节点标题已经有红色叹号，信息重复。同时 Model ID 下拉里出现了两个「未选择模型」：工作台注入了一份空值项，节点内联又补了一份。

**决定**

- `missing-model` 问题保持 `severity: "error"`（问题模型不降级），但**不进入阻断集合**：不弹 Provider 错误横幅、不进入运行日志的问题行、不禁用运行。
- 节点标题的红色叹号（`CanvasNodeNotice.severity = "danger"`）继续由 Provider 问题投影，hover 显示「Model 节点未选择模型」；这是该状态的唯一可见提示。
- 「未选择模型」只作为待补全状态：用户仍可运行；若直接运行，模型节点会在运行期失败并按运行错误展示。
- 下拉空值项由工作台选项统一提供；节点内联只在缺失时补一条（`withEmptyOption`），检查器与画布都恰好一条「未选择模型」。

**后果**

- 清空模型不再打断编辑；错误反馈从三条（横幅 / 日志 / 图标）收敛为一条（标题图标 + tooltip）。
- 用户可能在未选模型时点击运行，失败信息出现在运行期而不是设计期；这与“允许尝试”的既有取向一致（key 未验证也不阻断）。
- `missing-model` 仍出现在 `ProviderProblem` 列表中，供测试与后续面板复用；只是不再参与阻断与问题列表渲染。
- `Provider` 缺失、模型不在目录、能力不匹配仍按 error 阻断。

**否决**

- 继续弹横幅：与节点红色叹号重复，且打断“先清空再重选”的常见操作。
- 把 severity 降级为 warning：图标会变成黄色，与用户要求的红色叹号不符，也削弱了“必须选择模型才能运行”的语义。
- 让运行按钮禁用但不提示：用户不知道为何点不动。

---

## ADR-040：节点数据端口化与本地回退

**背景**

Model Call / Agent Run 的 `model`、`prompt`（Agent 为 `input`）、`attachments`、`toolset` 只能由上游连接提供，节点本地没有编辑入口；`system`、`parameters`、`hostTools` 只能在节点本地修改，无法由上游节点喂入。同一条数据“从哪来”两套规则，用户既不能脱离上游直接编辑，也不能把本地字段接到上游。

**决定**

- 统一为「每个数据字段 = 输入端口 + 本地 config 回退」：端口连接时以端口值为准，未连接时读取节点 config。
- `core.model.call` 新增 `system` / `parameters` 输入；configSchema 新增 `providerId` / `modelId` / `prompt` / `attachments`（`[{ contentHash }]`）。`model` / `prompt` 改为可选输入。
- `core.agent.run` 新增 `system` / `hostTools` 输入；configSchema 新增 `providerId` / `modelId` / `input` / `attachments` / `toolset`。`model` / `input` 改为可选输入。
- 执行期先做端口覆盖（`system` / `parameters` / `hostTools`），再走原有 config 校验；模型绑定、prompt/input、attachments、toolset 在端口缺席时读 config；缺值在节点执行期报错，解析期不再抛 `MissingInput`。
- 画布把「端口连接」投影为字段锁：连接任何受支持端口后，对应字段渲染为只读锁定行（锁图标 + 上游值 + 「上游」）；锁定值按字段解析（Provider 显示 Profile、Model 显示模型 id、Constant 显示文本），检查器同字段禁用并显示锁定原因。
- Model Call / Agent 增加本地 Provider + Model 下拉，与 Model 节点一致；`model` 端口连接时保留本地回退值、锁定编辑；切换 Provider 时按持久化目录清空不兼容的 `modelId`。
- 端口行移除装饰性圆点，只保留节点边缘的连接柄；Agent Run 图标改为 Bot、Model Call 改为 BotMessageSquare。
- 节点 Body 字段顺序：必要数据 → 必要参数 → 常用标量 → 低频枚举 → 结构数据（`parameters` / `toolset` / `hostTools` / `attachments`）；2026-11-27 晚修订：可接入端口的数据字段整体优先于只能本地编辑的参数（ADR-041）。

**后果**

- 图可以完全不连上游、只靠本地 config 运行，也可以部分字段来自上游、部分本地。
- 缺少 model / prompt / input 不再在依赖解析时失败，而是在节点执行期给出节点错误；`Graph.validate()` 不拦截，设计器仍可按需要补提示。
- 节点明显变高：新增本地编辑控件与端口行；密集画布需要更大节点间距。
- 本地 `attachments` / `toolset` 通过 JSON 编辑，属于高级入口；误填会在运行期被校验拒绝。
- Model Call / Agent 的本地模型绑定暂不复用 Provider 健康检查（仍由 Model / Provider 节点承担），只参与 Model Call 的 chat / generate / modality 能力校验。

**否决**

- 继续“端口只读、config 只写”：同一条数据两种来源，用户无法在节点内补齐。
- 用 `inputDefaults` 承载本地值：需要新的文档命令、撤销栈与表单接线，且与 configSchema 表单重复。
- 给 `temperature` / `think` / `maxSteps` 等标量也加端口：收益低、节点更高；本轮只端口化数据字段，参数保持本地。

---

## ADR-041：节点端口徽标与数据行

**背景**

端口此前只在节点底部以「端口行」列表出现：只有输入、没有输出；端口 Handle 沿节点边缘均匀分布，与数据字段的纵向位置无关；未连接与已连接都用同一个小圆点，只能靠行内文字区分类型。节点变高后，底部列表离对应字段很远，连线时要来回找。

**决定**

- 节点 Body 顶部增加「数据行」区：先列输出端口（优先级高于输入），再列没有对应字段的输入端口；底部端口列表移除。
- 端口徽标与节点主体保持 5px 间距，贴在左右两侧；纵向与对应数据行的**上边缘**对齐（`top` = 行顶，不再垂直居中）。行位置由 `data-port-anchor` 标记，画布按 **offsetTop 布局链**（未缩放的整数坐标）测量，避免平移 / 缩放时 `getBoundingClientRect` 亚像素取整造成的徽标跳变；同时覆盖 react-flow 默认的 `translate(-50%, -50%)`。
- 未连接 = 灰色 20px 圆角方块 + 10px 数据类型图标（text / json / model / provider / toolset / attachments / any），图标在方块内几何居中；已连接 = 橙红色 20px 空圆环 + 6px 实心点（`--fh-port-connected`），不再显示类型；圆环上边缘与方块对齐。
- 连线端点与视觉徽标解耦：react-flow 对 Left / Right 句柄取**外缘**作为连线端点，因此句柄改为 6px 透明块（未连接中心对准方块中心，已连接对准实心点底部），视觉徽标作为独立元素渲染；命中区覆盖整块徽标，点击方块 / 圆环仍可拖线。
- 连线组件不再自绘端点小圆（`SciFiEdge` 的 endpoint 圆移除）；连线终点就是实心点底部。
- 端口颜色只由连接状态决定，不随节点选中或运行状态改变；节点边框也不再因选中改色。
- 端口徽标本身就是 React Flow `Handle`：视觉与命中区是同一个元素；保留 `data-input-port`，连线仍可落在字段行上。
- Model / Model Call / Agent 的内联字段行就是输入端口的锚点（`PortBlock`），例如 `model` 对齐模型绑定行、`prompt` 对齐 Prompt、`system` 对齐 System Prompt；没有字段可挂的输入（如 Output 节点的 text / json）作为数据行出现。
- 输出徽标同理：有下游连线时为橙红圆点，否则为灰色方块 + 类型图标。
- 字段顺序规则修订：**可接入端口的数据字段优先于只能本地编辑的参数**（本轮之前是「必要数据 → 必要参数 → …」，新增优先级更高）；同组内仍按必要 / 常用 / 结构排序。

**后果**

- 连线目标与数据字段一一对齐，节点更高（每个输出一行数据 + 已有字段），但不再需要底部端口列表。
- Handle 位置依赖渲染后测量；配置编辑导致行高变化时会重新测量并更新位置，连线端点随内容移动。
- 端口颜色稳定（连接 = 橙红、未连接 = 灰），选中节点不再改变节点 / 端口颜色；选中反馈只保留在检查器标题与多选行为上。
- 端口图标是纯视觉，不替代 aria-label；Handles 仍带 `aria-label`（方向 / 端口名 / 类型）。
- Styleguide 的静态节点样张没有画布测量，只渲染数据行与字段，不渲染徽标。

**否决**

- 保留底部端口行并在旁边加输出列表：字段与端口仍然分离，连线要跨节点找位置。
- 继续把 Handle 均匀分布在边缘：与数据行无关，且节点变高后偏差更大。
- 用文字标签表达类型：220px 节点内过于拥挤，图标更紧凑。

