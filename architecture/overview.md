# FlowHarness 架构概览

## 目标

FlowHarness 是一个 Agent 工作台（Agent Workbench）：用户在桌面端编排、运行、观察 Agent 工作流。它本身不实现 Agent 运行时，而是**宿主**——底层执行能力来自 Wireclaw。

```plaintext
┌──────────────────────────────────────────────────┐
│ apps/desktop                                     │
│                                                  │
│  renderer (Vite + TS, ESM)   ──IPC──▶  main      │
│        │  import "wireclaw"           (Electron, │
│        ▼                               CJS)      │
│  wireclaw 浏览器构建打包进产物      wireclaw 打包进 │
│                                     main bundle  │
└──────────────────────────────────────────────────┘
                       ▲
                       │ workspace:*（pnpm 软链）
┌──────────────────────┴───────────────────────────┐
│ vendor/wireclaw（git submodule）                  │
│   src/ ─ tsup ─▶ dist/browser + dist/node         │
│   tsconfig.build.json ─▶ dist/types               │
└──────────────────────────────────────────────────┘
```

## 分层与边界

| 层 | 位置 | 职责 | 不应做什么 |
| --- | --- | --- | --- |
| 宿主 UI | `apps/desktop/src/renderer` | 工作台界面、图编辑与运行态展示 | 直接访问 Node / 文件系统 |
| 宿主壳 | `apps/desktop/src/main` | 窗口生命周期、系统集成、本地能力编排 | 承载业务 UI 逻辑 |
| 桥 | `apps/desktop/src/preload` | `contextBridge` 暴露最小可信 API | 暴露任意 IPC 或 `require` |
| Agent 引擎 | `vendor/wireclaw` | Session、Graph、Tool、Provider、运行时 | 依赖 Electron 或 FlowHarness 的 UI |

依赖方向是单向的：**apps → wireclaw**。wireclaw 不感知 FlowHarness，这样它才能作为独立库被其他宿主复用。

## 为什么 wireclaw 以「包」而不是「源码目录」接入

wireclaw 有独立的 `package.json`、`exports` 映射、构建脚本与版本节奏。把它当作 workspace 包：

1. `import { Graph } from "wireclaw"` 与真实发布后的用法一致，避免切换成本；
2. renderer 与 main 各自解析到正确产物（browser / node），不会把 `node:fs` 之类打进渲染进程；
3. 类型来自 `dist/types`，与应用实际使用的产物同源；
4. FlowHarness 侧不需要为 wireclaw 的目录结构写任何路径别名。

代价是 wireclaw 必须先构建出 `dist/`。这由根目录的 `build:wireclaw` / `watch:wireclaw` 脚本承担。

## 产物形态

- **main / preload**：CommonJS。Electron 的 ESM 主进程在部分平台上仍不稳定，CJS 启动更确定。
- **renderer**：Vite 打包的 ESM 静态资源。
- **wireclaw**：以 ESM 发布，因此在 CJS 的 main bundle 中**不能**保持外部依赖（`require()` 一个 ESM 包会失败），构建时将其打包进 main；renderer 由 Vite 正常打包。源码里仍然只写包名 import。

## 当前边界（有意为之）

- 尚未引入 UI 框架：renderer 是原生 TS + CSS，用于验证环境链路；
- 尚未引入状态管理与路由；
- 尚未配置打包分发（electron-builder 等），聚焦开发环境；
- Graph 运行时能力尚未接入工作台界面——这是接下来与 wireclaw 联调的主线。
