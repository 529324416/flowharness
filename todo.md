# TODO

## 已完成

### 开发环境

- [x] pnpm workspace（`apps/*` + `vendor/wireclaw`）
- [x] wireclaw 作为 submodule 纳入，并以普通包引用（`import { Graph } from "wireclaw"`）
- [x] Electron 桌面壳（main / preload / renderer 三端构建）
- [x] 固定工具链：Node 24 / pnpm 12 / TypeScript 7 / Electron 45 / electron-vite 6 / Vite 8
- [x] Electron 二进制镜像下载辅助：`pnpm ensure:electron`
- [x] 三段验证：`typecheck` + `build` + `smoke`
- [x] wireclaw 增量构建脚本：`pnpm watch:wireclaw`
- [x] 首次提交并推送到 GitHub

### 架构

- [x] 六层划分与依赖规则（[overview.md](architecture/overview.md)）
- [x] 模块职责与契约（[modules.md](architecture/modules.md)）
- [x] 数据模型与工作区格式（[data-model.md](architecture/data-model.md)）
- [x] 执行 / 事件 / IPC / 安全（[runtime.md](architecture/runtime.md)）
- [x] React / 画布 / 工作台 / 设计器（[ui.md](architecture/ui.md)）
- [x] 六条 ADR（[decisions.md](architecture/decisions.md)）

## 下一阶段：按架构实现

### Phase 0 — 基础迁移（已完成）

- [x] 建立 `packages/contracts`（IPC DTO、错误码、模块接口）
- [x] renderer 从原生 TS 迁移到 React 19 + `@vitejs/plugin-react`
- [x] design tokens + ThemeProvider + 首帧主题
- [x] 验证 `@vitejs/plugin-react` 在 Vite 8 / rolldown 下的 peer 配置（额外 peer 均为 optional）
- [x] 保留并更新 `pnpm smoke`（renderer 上报 `framework: "react"`）

### Phase 1 — main 数据层（已完成）

- [x] Platform：窗口、IPC 路由、`fh-asset://` 协议
- [x] AppConfig（schemaVersion / 原子写 / 迁移 / 损坏回退）
- [x] Secrets（safeStorage，无明文降级）
- [x] BlobStore（内容寻址，`objects/<hash[0:2]>/<hash>`，索引可重建）
- [x] WorkspaceStore（文档、锁、迁移、导入导出 `.fhws`）
- [x] WorkspaceFileHost（`IFileHost` 桥）
- [x] Vitest 单测覆盖 data layer（28 项）

### Phase 2 — 执行层

- [ ] RuntimeHost（`GraphHost` 装配、start/pause/resume/cancel）
- [ ] RunStore（meta / events.jsonl / checkpoint）
- [ ] SessionService + AttachmentFileManager 装配
- [ ] 事件节流与 IPC 事件流
- [ ] 审批 / 用户输入 IPC 往返
- [ ] 中断 run 的恢复策略

### Phase 3 — 画布

- [ ] Canvas core（几何、命令、选择、边 key、动画原语）+ 单测
- [ ] Canvas view（react-flow 受控模式、小地图、Controls、ContextMenu）
- [ ] Node renderer registry
- [ ] 主题接入

### Phase 4 — 工作台

- [ ] Workbench Framework（定义、实例、controller、命令栈、自动保存）
- [ ] Harness Designer：catalog/preset 接入、GraphDocument ⇄ CanvasDocument adapter
- [ ] 校验（`Graph.validate`）与问题面板
- [ ] 运行事件 → 动画映射
- [ ] 导入导出 Harness JSON

### Phase 5 — 其他工作台与工程化

- [ ] WorkbenchPlan（仅独立多 run 场景）
- [ ] 第二个工作台验证框架复用性
- [ ] 打包分发（electron-builder / electron-forge）
- [ ] CI：install → ensure:electron → build:wireclaw → typecheck → build → smoke
- [ ] 格式化与 lint（与 wireclaw 风格对齐）

## Wireclaw 侧（随宿主需求推进）

- [ ] 补齐未完成的 Agent 模块能力（见 `vendor/wireclaw/todo.md`）
- [ ] 在 FH 中验证并收敛 Graph 运行时 API
- [ ] 发布节奏与版本约定：submodule 提交固定 + npm 发布并行
