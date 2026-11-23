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

## Phase 2.6 — UI 打磨（当前，2–3 轮逐轮验收）

### R1 视觉系统 v2

- [ ] 明暗两套对比度走查（正文 / 次要文本 / 边框 / 画布网格）
- [ ] 表面层级：背景 / 面板 / 浮层 / 节点 拉开层次，减少“一片黑”
- [ ] 字体：字号阶梯、字重、行高、数字与中文混排
- [ ] 图标：统一 stroke 与尺寸（16 / 18 / 20），Rail 与 TopBar 对齐
- [ ] 组件状态：hover / focus-visible / active / disabled / invalid
- [ ] 产出：Styleguide v2 截图（明暗各一张）

### R2 画布优先布局

- [ ] 主区域改为「节点库 240 + 画布 + 检查器 320」，弱化卡片式结构
- [ ] 顶部运行控制收进画布浮动工具栏；TopBar 只留全局入口
- [ ] 底部面板默认收起，展开高度 160–200；空状态不再占满
- [ ] 画布空态 / 运行态 / 失败态的真实 mock 内容
- [ ] 窗口：标题栏与内容区的关系、最小尺寸与默认尺寸再确认
- [ ] 产出：Designer 截图（默认 / 运行 / 失败）

### R3 细节、动效与验收

- [ ] 菜单 / 弹窗 / Tooltip / ContextMenu 的间距与层级
- [ ] 空 / 加载 / 错误 / 权限状态
- [ ] 微交互：节点 hover、连线流动、面板展开、焦点迁移
- [ ] `prefers-reduced-motion` 走查
- [ ] 产出：逐页截图 + 最终确认

> 验收方式：每轮用 `pnpm capture:ui` 截取 FlowHarness 窗口（Windows），配合 Styleguide 人工确认后再进入下一轮。

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
