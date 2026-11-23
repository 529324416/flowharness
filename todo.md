# TODO

## 开发环境（已完成）

- [x] 建立 pnpm workspace（`apps/*` + `vendor/wireclaw`）
- [x] 将 wireclaw 作为 submodule 纳入 `vendor/wireclaw`（`workspace:*` 链接）
- [x] 打通「包名引用」链路：`import { Graph } from "wireclaw"`（main 与 renderer 均验证）
- [x] 搭建 Electron 桌面壳（main / preload / renderer 三端构建）
- [x] 固定工具链：Node 24 / pnpm 12 / TypeScript 7 / Electron 45 / electron-vite 6 / Vite 8
- [x] Electron 二进制镜像下载辅助：`pnpm ensure:electron`
- [x] 开发环境自检：`typecheck` + `build` + `smoke` 三段验证全部通过
- [x] wireclaw 增量构建脚本：`pnpm watch:wireclaw`

## 下一步（工作台功能）

- [ ] 将 Graph 的实际运行能力接入工作台界面
- [ ] Graph 编辑器：节点/边增删、参数与端口校验（复用 wireclaw 的 `Graph.validate`）
- [ ] 运行态可视化：订阅 `GraphEvent`，展示节点状态、token 流与暂停/恢复
- [ ] Session 管理：多会话、历史、checkpoint 恢复
- [ ] 本地文件能力：走 `wireclaw/node` + main 进程，经 preload 暴露受控接口
- [ ] Provider 配置界面（DeepSeek / Ollama / MiniMax / Qwen）
- [ ] 渲染进程与主进程的 IPC 契约收敛为带类型的 channel 定义

## 工程化（后续）

- [ ] 打包分发（electron-builder / electron-forge），产物签名与更新通道
- [ ] CI：`install → ensure:electron → build:wireclaw → typecheck → build → smoke`
- [ ] 统一格式化与 lint（建议 Biome 或 ESLint + Prettier，与 wireclaw 风格对齐）
- [ ] 首次提交（当前仓库尚无 commit，submodule 引用处于暂存状态）

## Wireclaw 侧（随宿主需求推进）

- [ ] 补齐未完成的 Agent 模块能力（见 `vendor/wireclaw/todo.md`）
- [ ] 在 FlowHarness 中验证并收敛 Graph 运行时 API
- [ ] 发布节奏与版本约定：submodule 提交固定 + npm 发布并行
