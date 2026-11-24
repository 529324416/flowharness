# TODO

> 当前状态：Step 4（中性配色 + 真透明 + 商务扁平）已完成；下一步进入 **Phase 3.5 — Harness Designer 工作台**。
>
> 原则：**UI 先稳定，功能后生长**。每个 Phase 结束做一次 UI 回归，不允许“功能完成、视觉退化”。

## 已完成

### 工程与架构

- [x] pnpm workspace（`apps/*` + `packages/*` + `vendor/wireclaw`）
- [x] wireclaw 作为 submodule 纳入，并以普通包引用（`import { Graph } from "wireclaw"`）
- [x] Electron main / preload / renderer 三端构建
- [x] Node 24 / pnpm 12 / TypeScript 7 / Electron 45 / electron-vite 6 / Vite 8
- [x] `typecheck / test / build / smoke` 验证链
- [x] Windows 一键启动 `run.bat`（沙箱受限自动降级）
- [x] 六层架构、模块职责、数据模型、执行/IPC、UI 文档
- [x] ADR-001 ~ ADR-009
- [x] 设计契约：tokens / canvas / components

### Phase 0 — 基础迁移

- [x] `packages/contracts`（IPC 通道 / DTO / 错误码）
- [x] React 19 + `@vitejs/plugin-react`
- [x] design tokens + ThemeProvider + 首帧主题

### Phase 1 — main 数据层

- [x] Platform（窗口 / IPC 路由 / `fh-asset://`）
- [x] AppConfig / Secrets / BlobStore / WorkspaceStore / WorkspaceFileHost
- [x] `.fhws` 导入导出、pid 锁、原子写、迁移
- [x] 数据层单测

### Phase 2 — 执行层

- [x] RuntimeHost（`GraphHost` 装配、start/pause/resume/cancel）
- [x] RunStore（meta / graph / events / checkpoint / interrupted）
- [x] 事件投影与节流、IPC 事件流
- [x] 审批 / 用户输入 IPC 往返
- [x] 自检 run：Constant → Output
- [ ] 完整 Session 生命周期与 Provider 工厂（Phase 5）

### Phase 2.5 — UI 基础

- [x] tokens、六区外壳、组件原语、Styleguide
- [x] 画布静态视觉样张（节点状态 / 连线状态 / 小地图）
- [x] 窗口菜单移除、窗口尺寸自适应、画布缩放防裁切、图标 20px

### Phase 2.6 — Shell v2 / Panels / Canvas

- [x] `frame: false` + 自绘 TitleBar + 窗口 IPC
- [x] TitleBar / Ribbon / Session Sidebar / Hero / StatusBar
- [x] 菜单与快捷键（Ctrl+N / B / W / K / 1–3）
- [x] Session Sidebar 先 mock，接口按未来 `SessionSummary` 设计
- [x] 窗口 bounds 持久化（多显示器 / DPI 校正）
- [x] PanelFrame / FloatingPanel：拖动、缩放、层级、折叠、关闭、位置钳制
- [x] 运行日志与属性检查 Panel 接入
- [x] 首版不做 docking

### Phase 3 — Canvas 核心与视图

- [x] `canvas/core`：坐标变换、命中测试、边 key、命令 + 单测
- [x] `canvas/view`：react-flow 12 受控模式、节点/边层、小地图、Controls、自定义右键菜单
- [x] Node renderer registry（`kind → React 组件`）
- [x] 节点/连线视觉、状态点、端口、流动/错误动画
- [x] `prefers-reduced-motion`
- [ ] 大图性能基线（300 节点）
- [ ] GraphDocument adapter / 节点库 / 撤销栈（Phase 3.5）

### Step 4 — 配色 / 真透明 / 商务扁平

- [x] 中性石墨黑全局配色；青绿只做语义色
- [x] 橙红 energy 收敛到关键区域（2026-11-25 已移除，由主色替代）
- [x] 默认真透明窗口；`FLOWHARNESS_WINDOW_MODE=frameless` 为不透明 fallback
- [x] 浮动 Panel 半透明；内容区 12px 圆角
- [x] 节点 6px 圆角、纯色、紧凑间距（不缩字号）
- [x] 背景网格线；低亮度
- [x] 移除选中辉光、节点渐变、连线发光
- [x] `capture:ui` 默认 opaque frameless，保证 renderer 截图可读
- [ ] 亮色主题视觉走查
- [ ] 真实桌面可读性 / 性能 / 窗口阴影 / 缩放验收

> 平台限制：桌面 blur 不可用（CSS `backdrop-filter` 不采样桌面；Acrylic/Mica 在当前环境不透明）。见 ADR-009。

### UI 打磨（2026-11-25）

- [x] 标记按钮去主色：Rail/Session 选中只用表面高亮，不额外着色
- [x] 主色 / 成功 / 警告 / 危险 / 信息饱和度降至原值 30%
- [x] 移除 `--fh-accent-soft`、`--fh-energy`、`--fh-energy-soft`，引用改由表面色与 `--fh-edge-active` 承担
- [x] 浮动面板默认 95% 不透明，`--fh-panel-alpha` 预留可调
- [x] Session/Canvas 分隔条 hover 改为中性高亮
- [x] 非画布文字放大至 125%，图标同步放大，保持 4px 紧凑间距
- [x] 节点改为 HeaderBar + Body 双层，移除 Footer；节点始终不透明
- [x] Session 与 Canvas 面板化：各自 1px 外框 + 6px 圆角，间隙 4px
- [x] 字体统一 `Microsoft YaHei UI`（含 mono 的 CJK 回退）
- [x] 窗口层级：TitleBar/StatusBar 不透明，Body 单一 95% 半透，Session/Canvas 一致
- [x] 浮动面板缩至原尺寸 80%（属性 256×432 / 运行日志 448×224）
- [x] 节点描边按 1/zoom 反向缩放，缩小后保持 1px 屏幕描边
- [x] 输入框移除 focus 高亮；Footer 改回全宽 Chrome 层（仅底部圆角）；TitleBar 移除底边框；移除画布缩放工具栏

### 质量

- [x] 12 个测试文件 / 48 个测试通过
- [x] `pnpm typecheck` / `pnpm build` / `pnpm smoke` 通过
- [x] 视觉基线截图与设计文档同步

## 下一步 — Phase 3.5 Harness Designer

- [ ] 节点库：`createEditorCatalog` + `NodePresetLibrary`
- [ ] GraphDocument ⇄ CanvasDocument adapter；布局写入 `ui`
- [ ] 检查器按节点类型渲染（configSchema 表单 + 定制组件）
- [ ] `Graph.validate` 与问题面板
- [ ] 运行事件 → 画布动画映射
- [ ] Harness JSON 导入导出
- [ ] 撤销/重做、复制/粘贴

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
- [ ] 更多工作台类型

## Phase 7 — 可观测性与工程化

- [ ] run 事件回放 / 诊断包导出
- [ ] 日志分级、脱敏、traceId 展示
- [ ] 格式化与 lint
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
