# 开发环境

> 本文描述**当前**可运行的开发环境。目标架构见 [README.md](./README.md)；实现进度见 [../todo.md](../todo.md)（Phase 0 已完成：`packages/contracts` + React renderer + 主题系统）。

## 工具链

| 组件 | 版本 | 角色 |
| --- | --- | --- |
| Node.js | 24.13.0（要求 >= 22.12.0） | 运行时；Electron 45 内嵌 Node 24.22 |
| pnpm | 12.23.0 | workspace 与依赖管理 |
| TypeScript | 7.0.2 | 全仓类型检查与 wireclaw 声明产出 |
| Electron | 45.4.1 | 桌面壳（Chromium 156 / Node 24.22） |
| electron-vite | 6.0.0 | main / preload / renderer 三端构建与开发服务器 |
| Vite | 8.3.8 | renderer 打包 |
| React | 19.3.1 | renderer UI |
| @xyflow/react | 12.12.1 | 画布视图（受控 nodes/edges） |
| @vitejs/plugin-react | 6.3.0 | JSX 转换与 Fast Refresh（额外 peer 均为 optional） |
| Radix Primitives | tooltip 1.4 / dropdown 2.2 / context-menu 2.4 / dialog 1.3 / tabs 1.2 | 浮层与菜单的无障碍行为 |
| Lucide React | 1.78.0 | 图标 |
| Vitest | 5.1.1 | main 服务 + canvas core 单测（node 环境） |
| tsup | 9.0.0 | wireclaw 库构建 |

## 目录职责

```plaintext
run.bat                     # Windows 一键启动 GUI（dev，可选 --no-sandbox）
apps/desktop/
  electron.vite.config.ts   # 三端构建配置
  tsconfig.base.json        # 共享编译选项
  tsconfig.node.json        # main + preload（Node 侧）
  tsconfig.web.json         # renderer（DOM 侧）
  tsconfig.json             # 编辑器默认入口
  src/main/index.ts         # 主进程入口：窗口、服务装配、IPC
  src/main/platform/        # IPC 路由、fh-asset 协议
  src/main/services/        # AppConfig / Secrets / BlobStore / WorkspaceStore / FileHost
  src/preload/index.ts      # contextBridge 桥
  src/renderer/
    index.html
    src/main.tsx            # React 挂载 + 首帧主题
    src/App.tsx             # Shell v2 组合 + 视图切换
    src/styles/             # tokens.css（唯一视觉事实源）+ global.css
    src/ui/                 # 组件原语（Button / Menu / Dialog / Tabs / ...）
    src/shell/              # TitleBar / Ribbon / SessionSidebar / panels / StatusBar
    src/views/              # Designer / Hero / Diagnostics / Styleguide
    src/canvas/core/        # 几何 / 边 key / 命令
    src/canvas/view/        # React Flow 画布、节点/边 renderer
    src/run/                # 运行自检组件
    src/components/         # 共享展示组件
    src/theme/              # ThemeProvider
  scripts/prepare-userdata.mjs  # 启动前创建 Electron userData 目录
  scripts/smoke.mjs         # 无头启动验证
  vitest.config.mts         # main 服务 + canvas core 单测配置
  out/                      # 构建产物（git 忽略）
design/                     # 设计契约：tokens / canvas / components
packages/
  contracts/                # L0：IPC 通道/DTO/错误码（以 TS 源码形式被消费）
scripts/
  ensure-electron.mjs       # 触发 Electron 二进制下载（可配镜像）
```

## 构建链路

### wireclaw

`pnpm build:wireclaw` 执行 submodule 内既有的 `npm run build`：

```text
tsup （src/browser.ts → dist/browser；src/node.ts + src/client/index.ts → dist/node）
tsc -p tsconfig.build.json （仅声明 → dist/types）
```

`package.json` 的 `exports` 指向这些产物，所以 **dist 不存在时，`import { Graph } from "wireclaw"` 会在类型检查和运行期同时失败**。

联合开发的两种节奏：

```bash
pnpm build:wireclaw          # 改完一次性重建（会先 clean）
pnpm watch:wireclaw          # 另开终端，增量重建 JS + 类型
```

### desktop

`electron-vite build` 产出 `apps/desktop/out/`：

| 产物 | 格式 | 说明 |
| --- | --- | --- |
| `out/main/index.js` | CJS | `electron` 外部化；`wireclaw`（ESM-only）与 `@flowharness/contracts`（TS 源码）打包进 bundle |
| `out/preload/index.js` | CJS | `electron` 外部化；`@flowharness/contracts` 打包 |
| `out/renderer/` | ESM | Vite 打包 React + wireclaw 浏览器构建 |

主进程的 preload 路径通过 `out/preload/` 下实际存在的文件（`index.mjs` / `index.js` / `index.cjs`）解析，因此切换构建格式不会破坏启动。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `ELECTRON_RENDERER_URL` | 由 electron-vite dev 注入；有值时主进程加载开发服务器，否则加载 `out/renderer/index.html` |
| `FLOWHARNESS_SMOKE=1` | 隐藏窗口；渲染进程完成 config/workspace 往返后主进程自动退出，供 `pnpm smoke` 使用 |
| `ELECTRON_MIRROR` | `pnpm ensure:electron` 使用的下载镜像，默认 npmmirror |

## 验证

```bash
pnpm typecheck   # contracts（tsc）+ desktop（node + web 两个 project）
pnpm test        # vitest：main 服务 + canvas core（48 项：config / secrets / blob / workspace / filehost / run-store / runtime / broker / window-state / geometry / commands）
pnpm build       # wireclaw + desktop 全量构建
pnpm smoke       # 无头启动 Electron，校验 wireclaw + config/workspace IPC
pnpm capture:ui  # Windows：CDP 截取 renderer（加 -NativeWindow 可抓原生窗口）
```

Windows 快捷启动：双击 `run.bat`。默认先按标准沙箱启动，失败时自动以 `--no-sandbox` 重试（受限终端/CI 无法初始化 Chromium 沙箱）；也可 `run.bat --no-sandbox` 直接兼容模式，或 `run.bat --sandbox` 强制标准模式。脚本会检查 Node/pnpm、按需 `pnpm install` 与 `build:wireclaw`。

窗口模式：默认 `transparent`（真透明 + 中性黑）。可用 `FLOWHARNESS_WINDOW_MODE=frameless` 回到不透明无边框作为 fallback；`standard|overlay|mica|acrylic` 仍保留为对比模式。透明窗口需要 GPU，`--disable-gpu` 会退化为不透明；桌面 blur 在当前 Chromium/Electron 不可用（ADR-009）。

`pnpm smoke` 的行为：

1. `prepare-userdata.mjs` 确保 `%APPDATA%\FlowHarness` 存在；
2. 以 `--no-sandbox --disable-gpu` 启动已构建的 Electron 应用，窗口隐藏；
3. 主进程打印 `[main] wireclaw ready: Graph=function ...`；
4. 渲染进程上报 boot 信息，随后完成 `config:get` + `workspace:list` 往返并上报 `phase: "data"`；
5. `FLOWHARNESS_SMOKE=1` 时自动启动一个无 Provider 的最小 Graph（Constant → Output），消费 run 事件流后上报 `phase: "run"`；
6. 主进程收到 data + run 两份上报后退出，smoke 校验 wireclaw、data、`status: completed` 三类标记。

## 常见问题

**`Cannot find module 'wireclaw'` / 类型缺失**
wireclaw 的 `dist/` 还没构建：`pnpm build:wireclaw`。

**pnpm 报 `ERR_PNPM_IGNORED_BUILDS` 或拒绝执行安装脚本**
pnpm 12 使用 `pnpm-workspace.yaml` 里的 `allowBuilds`（映射形式）：

```yaml
allowBuilds:
  electron: true
  esbuild: true
```

**Electron 二进制下载失败 / 卡住**
Electron 45 在首次 `require("electron")` 时懒下载。执行：

```bash
pnpm ensure:electron
# 或自定义镜像
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; pnpm ensure:electron
```

**Electron 启动即崩溃（`-1073741819` / `3221225477` / `-2147483645`）**
本仓库遇到过三类原因，均已规避：

1. **包名带作用域**：`"name": "@scope/app"` 会让 Electron 把 userData 解析成含 `/` 的路径并在启动时崩溃。桌面包因此命名为 `flowharness-desktop`，显示名由 `productName` 提供。不要改回带 `@` 的名字。
2. **userData 目录无法创建**：受限终端/安全软件会拒绝 Chromium 创建 `%APPDATA%\FlowHarness`，进程在 `ready` 前就崩溃。`scripts/prepare-userdata.mjs` 在启动前用 Node 建好该目录。
3. **Chromium OS 沙箱无法初始化**：在受限会话/CI 中表现为 `STATUS_BREAKPOINT`（`0x80000003`）。此时用 `pnpm dev:no-sandbox`（smoke 已自动加 `--no-sandbox`）。普通桌面终端不需要。

**Electron 进程写盘被拒（`EPERM`）**
在某些受限会话里，Electron 主进程的 `fs` 写入（AppData、临时目录、甚至工作区）都会返回 `EPERM`，而普通 Node 进程可以写。表现为：

```text
[config] cannot persist app config; running in memory EPERM: ...
[workspace] cannot create workspace root; listing will be empty EPERM: ...
```

当前策略：**可写则持久化，不可写则内存降级并告警**，应用照常启动；`pnpm smoke` 只验证读路径（config/workspace 列表），不验证创建/导出。正常桌面终端不受影响，此时配置与工作区会正常落盘。

同一限制下 `app.requestSingleInstanceLock()` 也无法创建 Chromium 单例锁，因此单实例锁**暂未启用**（见 [modules.md](./modules.md) Platform 一节）。

**改了 wireclaw 源码但界面没变化**
renderer 的依赖已被 Vite 预打包，需要重启 `pnpm dev`；同时确认 `pnpm build:wireclaw`（或 `watch:wireclaw`）已经跑过。

**Windows 上 `git status` 出现 fsmonitor 报错**
与本项目无关，是 Git fsmonitor 守护进程连接问题；可 `git config core.fsmonitor false` 关闭。
