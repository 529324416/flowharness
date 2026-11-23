# FlowHarness

FlowHarness 是一个基于 **TypeScript + Electron + Wireclaw** 的 Agent 工作台。

Wireclaw（`vendor/wireclaw`）是本项目的嵌入式 Agent 模块，以 git submodule 的形式纳入本仓库联合开发；由于它的开发尚未完成，更多需求需要在 FlowHarness 的真实宿主环境中验证，因此两者在同一工作区内协同演进。

## 仓库结构

```plaintext
flowharness/
  pnpm-workspace.yaml     # pnpm workspace：apps/* + vendor/wireclaw
  apps/
    desktop/              # Electron 桌面应用（main / preload / renderer）
  vendor/
    wireclaw/             # git submodule，作为普通 npm 包被引用
  scripts/                # 仓库级辅助脚本
  architecture/           # 架构与开发环境文档
  devlog/                 # 开发日志（yyyy-mm-dd-hh-mm.md）
  readme.md
  todo.md
```

## 前置要求

| 工具 | 版本要求 | 当前开发机 |
| --- | --- | --- |
| Node.js | >= 22.12.0 | v24.13.0 |
| pnpm | >= 12（配置使用 `allowBuilds`） | 12.23.0 |
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

`pnpm dev` 会先构建 wireclaw，再启动 `electron-vite dev`，Electron 窗口加载 Vite 开发服务器。

> Electron 的预编译二进制在首次启动时懒下载。如果 GitHub 不可达，先执行 `pnpm ensure:electron`（默认走 npmmirror 镜像），再 `pnpm dev`。

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm bootstrap` | `pnpm install` + 构建 wireclaw，一次性准备环境 |
| `pnpm ensure:electron` | 触发 Electron 二进制下载（默认使用镜像） |
| `pnpm build:wireclaw` | 构建 wireclaw 的 `dist/`（browser / node / types） |
| `pnpm watch:wireclaw` | wireclaw 源码变更时增量重建 JS 与类型声明 |
| `pnpm dev` | 构建 wireclaw 后启动 Electron 开发模式 |
| `pnpm dev:no-sandbox` | 同上，但给 Electron 传 `--no-sandbox`（受限终端 / CI 使用） |
| `pnpm build` | 构建 wireclaw + 产出桌面应用的 `out/` |
| `pnpm typecheck` | 分别对 main/preload 与 renderer 做类型检查 |
| `pnpm smoke` | 无头启动已构建的 Electron 应用，验证 main 与 renderer 都成功加载 wireclaw |
| `pnpm test:wireclaw` | 运行 wireclaw 自带的测试 |

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

## 验证开发环境

```bash
pnpm typecheck   # 类型检查：确认 "wireclaw" 的类型解析正常
pnpm build       # 构建：确认 Electron 三个 bundle 都能产出
pnpm smoke       # 启动验证：窗口隐藏运行，输出 [smoke] OK 即通过
```

`pnpm smoke` 成功时的输出：

```text
[prepare-userdata] C:\Users\<you>\AppData\Roaming\FlowHarness
[main] wireclaw ready: Graph=function graphId=flowharness-main-boot nodes=0
[main] renderer-ready {"renderer":{"wireclawGraphLoaded":true,"wireclawGraphId":"flowharness-renderer-boot"},"versions":{...}}
[smoke] OK — Electron launched; main and renderer both loaded wireclaw.
```

## 文档

- [`architecture/overview.md`](architecture/overview.md) — 仓库分层与模块边界
- [`architecture/dev-environment.md`](architecture/dev-environment.md) — 开发环境、构建链路、常见问题
- [`todo.md`](todo.md) — 当前进度与后续计划
- `devlog/` — 按时间记录的开发日志
