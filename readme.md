# FlowHarness

FlowHarness 是一个基于 **TypeScript + Electron + Wireclaw** 的 Agent 工作台。

Wireclaw（`vendor/wireclaw`）是本项目的嵌入式 Agent 模块，以 git submodule 纳入，在本仓库中以**普通 npm 包**的方式引用。它仍在演进，因此 FlowHarness 同时承担宿主验证与产品化的职责。

## 当前状态

| 模块 | 状态 |
| --- | --- |
| 工程链路：pnpm workspace / Electron / Vite / TS | ✅ |
| main 数据层：Config / Secrets / Blob / Workspace / FileHost | ✅ |
| RuntimeHost / RunStore / 事件流 / 审批·输入 handler（main 侧） | ✅ |
| Shell v2：TitleBar / Ribbon / Session Sidebar / StatusBar（Hero 组件未接入） | ✅ |
| 浮动 Panel：运行日志 / 属性检查 | ✅ |
| Canvas：React Flow、节点/连线、小地图、右键菜单 | ✅ |
| 中性配色 + 真透明窗口 + 商务扁平画布 | ✅ |
| UI 打磨：去饱和色板 / 125% 字号 / 节点双层 / Session+Canvas 面板化 | ✅ |
| M1 最小可运行 Designer：GraphDocument / 编辑 / 运行 / 自动保存 / 检查器 | ✅ |
| M2 节点库 / configSchema 表单 / 预设 | ✅ 已完成（内建节点端口静态；失效边会提示） |
| UI 打磨 2：面板材质加深 / 主题化 Select·Checkbox / 最近使用 | ✅ |
| M3 校验与运行可视化：问题面板 / 内嵌图递归校验 / 事件→画布 / 暂停·继续 | ✅ |
| M4 文档生命周期与编辑体验：多图 / 撤销复制 / 框选·右键平移 / JSON 导入导出 | ✅ |
| M5 Workbench Framework：定义 / 实例 / 第二工作台 / 节点内联编辑（M5.1） | 🚧 |
| Session / Provider 闭环、打包 | ⬜ |

**已知限制**

- 真透明窗口可透出桌面，但当前 Chromium/Electron 无法模糊桌面（ADR-009）；
- Session Sidebar 仍是 mock；设计器当前按工作区加载，真实 Session 绑定在 M6；
- 设计器运行中切换视图会丢失节点/边状态（run 仍在 main 继续）；
- 暂停/恢复目前是进程内恢复，跨重启 resume 在 M6；
- 运行前的 requirements 目录尚未接 Provider / Secrets，校验能定位内层依赖但宿主能力未闭环；
- 标题栏关闭与 Ctrl+W 会先 flush 当前文档；系统级关闭（Alt+F4）仍无退出握手；
- 撤销栈只覆盖画布结构编辑与 config，重启后不保留；
- WorkbenchPlan 与独立参数槽拖拽尚未实现；内联编辑目前覆盖 Constant / Model Call / Log；
- 亮色 token 与切换已接入（`ThemeProvider` + `config:update`），尚未做视觉走查；
- 表单覆盖标量 / 枚举 / 字符串数组；HarnessValue、内嵌图、hostTools 等复杂字段仍是 JSON 文本域；
- 300 节点性能基线、真实桌面可读性验收未完成；
- 透明窗口需要 GPU；`--disable-gpu` 下会退化为不透明。

## 仓库结构

```plaintext
flowharness/
  pnpm-workspace.yaml     # pnpm workspace：apps/* + packages/* + vendor/wireclaw
  run.bat                 # Windows 一键启动（可选 --no-sandbox / --sandbox）
  apps/
    desktop/              # Electron 桌面应用（main / preload / renderer + scripts）
  packages/
    contracts/            # L0：IPC 通道 / DTO / 错误码（以 TS 源码被 main 与 renderer 消费）
  vendor/
    wireclaw/             # git submodule，作为普通 npm 包被引用
  scripts/                # 仓库级辅助脚本（ensure-electron / capture-ui / capture-cdp）
  architecture/           # 架构与开发环境文档
  design/                 # 视觉与组件契约
  devlog/                 # 每会话一篇总结（YYYY-MM-DD-HH-MM.md）
  readme.md
  todo.md
```

开发日志约定：**每个会话只保留一篇**，只记实际贡献，不记过程、排错和实现细节。

## 前置要求

| 工具 | 版本要求 | 当前开发机 |
| --- | --- | --- |
| Node.js | >= 22.12.0 | v24.13.0 |
| pnpm | >= 10（`allowBuilds` 需要 pnpm 10+；当前脚本按 12 验证） | 12.23.0 |
| Git | 任意近版本 | 2.47.1 |

## 快速开始

```bash
# 1. 首次克隆时确保 submodule 一并检出
git clone --recurse-submodules <repo-url>
cd flowharness

# 2. 安装依赖
pnpm install

# 3. 构建 wireclaw（apps/desktop 按包名解析它，必须先有 dist）
pnpm build:wireclaw

# 4. 启动开发环境
pnpm dev
```

Windows 下也可以直接双击根目录的 [`run.bat`](run.bat)：它会检查 Node/pnpm、按需安装依赖并构建 wireclaw，然后启动同一套 dev 环境。启动器先按标准沙箱启动；**标准启动以任何非 0 码失败**都会自动以 `--no-sandbox` 重试（受限终端/CI 无法初始化 Chromium 沙箱，典型退出码 `-2147483645` / `0x80000003`）。也可以显式指定：

```bat
run.bat --no-sandbox   :: 直接使用兼容模式
run.bat --sandbox      :: 强制标准沙箱（失败不重试）
```

> Electron 预编译二进制在首次启动时懒下载。如果 GitHub 不可达，先执行 `pnpm ensure:electron`（默认走 npmmirror 镜像），再 `pnpm dev`。

默认窗口是真透明。若需要不透明无边框 fallback：

```powershell
$env:FLOWHARNESS_WINDOW_MODE="frameless"
pnpm dev
```

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm bootstrap` | `pnpm install` + 构建 wireclaw，一次性准备环境 |
| `pnpm ensure:electron` | 触发 Electron 二进制下载（默认使用镜像） |
| `pnpm build:wireclaw` | 构建 wireclaw 的 `dist/`（browser / node / types） |
| `pnpm watch:wireclaw` | wireclaw 源码变更时增量重建 JS 与类型声明 |
| `pnpm dev` | 构建 wireclaw 后启动 Electron 开发模式 |
| `pnpm dev:no-sandbox` | 同上，但给 Electron 传 `--no-sandbox` |
| `pnpm build` | 构建 wireclaw + 产出桌面应用的 `out/` |
| `pnpm typecheck` | contracts + main/preload + renderer 三段类型检查 |
| `pnpm test` | main 数据层 + canvas core + designer core/state + workbench 单测（28 files / 138 tests） |
| `pnpm smoke` | 无头启动已构建的 Electron 应用，验证 wireclaw 与数据/运行链路 |
| `pnpm capture:ui` | Windows：CDP 截取 renderer（默认 opaque frameless，产物 `devlog/assets/ui-current.png`）；`FH_CAPTURE_SCENARIO` 选场景，`-NativeWindow` 改抓原生窗口 |
| `pnpm test:wireclaw` | 运行 wireclaw 自带的测试 |

真透明截图需要 GPU + 系统屏幕抓取；CDP 截图不包含桌面。

## Wireclaw 的引用方式

wireclaw 是一个**正常的库依赖**，通过 workspace 协议链接：

```json
// apps/desktop/package.json
{
  "dependencies": {
    "wireclaw": "workspace:*"
  }
}
```

业务代码只写包名：

```ts
import { Graph } from "wireclaw";
```

**不要**写成 `./vendor/wireclaw/src/harness` 之类的源码相对路径：

- 包名解析走 wireclaw 的 `exports` 映射，renderer 得到浏览器构建，main 进程得到对应产物；
- 源码路径会绕过 `exports`，把 Node-only 模块带进渲染进程，并让类型与产物脱节；
- 一旦 wireclaw 发布或改为外部依赖，包名引用无需改动。

由于 `exports` 指向 `dist/`，**修改 wireclaw 源码后必须重建**：

```bash
pnpm build:wireclaw     # 一次性重建
pnpm watch:wireclaw     # 或在另一个终端持续重建
```

## 验证

```bash
pnpm typecheck   # 类型检查：contracts + main/preload + renderer，确认 "wireclaw" 的类型解析正常
pnpm test        # main 数据层 + canvas core + designer core/state 单测
pnpm build       # 构建：确认 Electron 三个 bundle 都能产出
pnpm smoke       # 启动验证：窗口隐藏运行，输出 [smoke] OK 即通过
```

`pnpm smoke` 成功时输出 `[smoke] OK — Electron launched; wireclaw, data layer and run event stream are live.`

## 文档

**架构**

- [`architecture/README.md`](architecture/README.md) — 文档地图、关键决策、术语、实现状态
- [`architecture/overview.md`](architecture/overview.md) — 分层、依赖规则、进程模型
- [`architecture/modules.md`](architecture/modules.md) — 模块职责与契约
- [`architecture/data-model.md`](architecture/data-model.md) — 工作区数据、文档、导入导出
- [`architecture/runtime.md`](architecture/runtime.md) — 执行、事件、IPC、安全
- [`architecture/ui.md`](architecture/ui.md) — React、画布、工作台框架、设计基础
- [`architecture/decisions.md`](architecture/decisions.md) — 架构决策记录（ADR）

**设计**

- [`design/README.md`](design/README.md) — 视觉原则与已定决策
- [`design/tokens.md`](design/tokens.md) — token 命名与取值
- [`design/canvas.md`](design/canvas.md) — 画布视觉与交互语言
- [`design/components.md`](design/components.md) — 组件清单与外壳布局

**工程**

- [`architecture/dev-environment.md`](architecture/dev-environment.md) — 开发环境、构建链路、常见问题
- [`todo.md`](todo.md) — 当前进度与后续计划
- [`devlog/`](devlog/) — 每会话一篇贡献总结
