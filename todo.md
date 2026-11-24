# TODO

> 原则：**UI 先稳定，功能后生长**。每个 Phase 结束都做一次 UI 回归，不允许“功能完成、视觉退化”。

## 已完成

### 开发环境

- [x] pnpm workspace（`apps/*` + `packages/*` + `vendor/wireclaw`）
- [x] wireclaw 作为 submodule 纳入，并以普通包引用（`import { Graph } from "wireclaw"`）
- [x] Electron 桌面壳（main / preload / renderer 三端构建）
- [x] 工具链：Node 24 / pnpm 12 / TypeScript 7 / Electron 45 / electron-vite 6 / Vite 8
- [x] 验证链：`typecheck` + `test` + `build` + `smoke`
- [x] Windows 一键启动：`run.bat`（沙箱失败自动降级）
- [x] 二次提交并推送到 GitHub

### 架构与设计

- [x] 六层划分与依赖规则（[overview.md](architecture/overview.md)）
- [x] 模块职责、数据模型、执行/IPC、UI 架构（[architecture/](architecture/README.md)）
- [x] 六 + 一条 ADR（[decisions.md](architecture/decisions.md)）
- [x] 设计契约：tokens / canvas / components（[design/](design/README.md)）

### Phase 0 — 基础迁移

- [x] `packages/contracts`（IPC 通道 / DTO / 错误码）
- [x] renderer 迁移 React 19 + `@vitejs/plugin-react`
- [x] design tokens + ThemeProvider + 首帧主题

### Phase 1 — main 数据层

- [x] Platform（窗口 / IPC 路由 / `fh-asset://`）
- [x] AppConfig / Secrets / BlobStore / WorkspaceStore / WorkspaceFileHost
- [x] `.fhws` 导入导出、pid 锁、原子写、迁移
- [x] Vitest 单测（数据层）

### Phase 2 — 执行层

- [x] RuntimeHost（`GraphHost` 装配、start/pause/resume/cancel）
- [x] RunStore（meta / graph / events / checkpoint / interrupted）
- [x] 事件投影与节流、IPC 事件流
- [x] 审批 / 用户输入 IPC 往返
- [x] 自检 run：Constant → Output
- [ ] 完整 Session 生命周期与 Provider 工厂（挪到 Phase 5）

### Phase 2.5 — UI 基础

- [x] tokens（深色优先 + 青绿）、六区外壳、组件原语、Styleguide
- [x] 画布静态视觉样张（节点六态 / 连线三态 / 小地图）
- [x] 窗口菜单移除、窗口尺寸自适应、画布缩放防裁切、图标 20px

---

## Phase 2.6 — UI 打磨：Shell v2 + SciFi 画布（当前）

> 已确认：VS Code 布局逻辑；无边框 + 自绘标题栏；单一 Session Sidebar；内部浮动 Panel；SciFi 节点/连线；半透明先 spike。
> 色彩角色：**中性深色底**；**青绿只用于选中/焦点/链接/部分强调文字**（不做大面积底色）；
> **橙红只用于节点能量/连线流动**；成功/警告/危险状态色独立，并必须配图标或文本。

### S0 可行性 Spike（已完成）

- [x] `frame: false` + 自绘 TitleBar + 窗口 IPC（minimize / toggle-maximize / close / maximized）
- [x] 拖拽区、双击最大化（bounds 持久化移交 Shell v2）
- [x] Snap Layouts 对比：全自绘按钮（无原生弹层）vs `titleBarOverlay`（保留原生按钮）；决定采用自绘
- [x] 半透明方案对比：原生 Mica/Acrylic 无可辨收益；`transparent + backdrop-filter` 可用但不稳定
- [x] 截图兼容：`PrintWindow` 抓不到 DWM 材质/透明背景，需前台抓屏验证
- [x] 产出：frameless / overlay / standard 对比截图 + ADR-008
- [x] 结论：默认 `frameless` 不透明；`transparent` 保留为实验模式，step 4 再定

### 1 Shell v2（布局已完成）

- [x] TitleBar：应用图标 / 菜单 / 命令中心 / 窗口按钮
- [x] 布局：Ribbon 48 + Session Sidebar 260（可收起/拖宽）+ Canvas + StatusBar 22
- [x] Hero 空态：新建会话 / 打开示例 / 模板
- [x] 菜单与快捷键（Ctrl+N / B / W / K / 1–3）
- [x] Session Sidebar 先用 mock 数据，接口按未来 `SessionSummary` 设计
- [x] 产出：`shell-v2-hero.png` / `shell-v2-canvas.png` / `shell-v2-collapsed.png`
- [x] 窗口 bounds 持久化（多显示器/DPI 校正；step 2 完成）

### 2 Panels（已完成）

- [x] Panel 外框：Header / Body / 可选 Footer
- [x] FloatingPanel：拖动、缩放、z-index 聚焦、折叠、关闭、位置钳制
- [x] Panel 管理器：打开列表、默认位置、层级；首版不做 docking
- [x] 接入运行日志与属性检查两个 Panel
- [x] 窗口 bounds 持久化 + 单测
- [x] 产出：`panels-default.png` / `panels-collapsed.png`

### 3 Canvas 视觉（并入 Phase 3，1–2 轮）

- [ ] SciFi NodeCard v2：切角/细描边/等宽标签/状态符号
- [ ] 端口、连线、流动/数据包/脉冲动画
- [ ] 性能约束与 `prefers-reduced-motion`
- [ ] 与 Canvas core/view 一起落地，不做一次性假节点

### 4 半透明应用（0.5 轮）

- [ ] 按 S0 结论应用到 TitleBar / Ribbon / Panel / StatusBar
- [ ] 内容区保持接近不透明，保证文字与节点可读性
- [ ] 性能与截图回归

> 验收方式：每轮用 `pnpm capture:ui` 截取 FlowHarness 窗口（Windows），人工确认后再进入下一轮。

---

## Phase 3 — Canvas 核心与视图

- [ ] `canvas/core`：坐标变换、命中测试、选择、命令、边 key、布局、动画原语 + 单测
- [ ] `canvas/view`：react-flow 受控模式、节点/边层、小地图、Controls、ContextMenu
- [ ] Node renderer registry（`nodeType → React 组件`）
- [ ] 画布与主题 token / `canvas/metrics.ts` 对齐
- [ ] 空态 / 大图性能基线（300 节点）

## Phase 3.5 — Harness Designer 工作台

- [ ] 节点库：`createEditorCatalog` + `NodePresetLibrary`
- [ ] GraphDocument ⇄ CanvasDocument adapter；布局写入 `ui`
- [ ] 检查器按节点类型渲染（configSchema 表单 + 定制组件）
- [ ] `Graph.validate` 与问题面板
- [ ] 运行事件 → 画布动画映射
- [ ] Harness JSON 导入导出

## Phase 4 — Workbench Framework

- [ ] `WorkbenchDefinition` / 实例文档 / controller / 命令栈 / 自动保存
- [ ] 模块注册表与视图宿主
- [ ] `WorkbenchPlan`（仅独立多 run 场景；优先 subgraph）
- [ ] 第二个工作台验证框架复用性

## Phase 5 — Session / Provider 闭环

- [ ] Provider 工厂 + Secrets 接入（DeepSeek / Ollama / MiniMax / Qwen）
- [ ] 模型 / Agent 节点真正可运行
- [ ] Session 生命周期、历史、附件回放
- [ ] 审批 / 用户输入 UI
- [ ] 跨重启 resume（checkpoint + graph 装载）

## Phase 6 — 模板、导入导出与多工作台

- [ ] 工作台模板 / 节点预设
- [ ] `.fhws` 导入导出 UI 与冲突策略
- [ ] 更多工作台类型（按目标定制动画）

## Phase 7 — 可观测性与工程化

- [ ] run 事件回放 / 诊断包导出
- [ ] 日志分级、脱敏、traceId 展示
- [ ] 格式化与 lint（与 wireclaw 风格对齐）
- [ ] CI：install → ensure:electron → build:wireclaw → typecheck → test → build → smoke

## Phase 8 — 打包与发布

- [ ] electron-builder / electron-forge 打包
- [ ] 自动更新通道与签名
- [ ] 发布流程与版本约定

## 远期

- [ ] 云端 Workspace 与同步
- [ ] 多人协作
- [ ] 插件市场 / 第三方工作台沙箱

## Wireclaw 侧（随宿主需求推进）

- [ ] 补齐未完成的 Agent 模块能力（见 `vendor/wireclaw/todo.md`）
- [ ] 在 FH 中验证并收敛 Graph 运行时 API
- [ ] 发布节奏：submodule commit 固定 + npm 发布并行
