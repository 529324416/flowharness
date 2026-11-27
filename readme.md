# FlowHarness

FlowHarness 是一个基于 **TypeScript + Electron + Wireclaw** 的 Agent 工作台。

Wireclaw（`vendor/wireclaw`）是本项目的嵌入式 Agent 模块，以 git submodule 纳入，在本仓库中以**普通 npm 包**的方式引用。它仍在演进，因此 FlowHarness 同时承担宿主验证与产品化的职责。

## 当前状态

| 模块 | 状态 |
| --- | --- |
| 工程链路：pnpm workspace / Electron / Vite / TS | ✅ |
| main 数据层：Config / Secrets / Blob / Workspace / FileHost | ✅ |
| RuntimeHost / RunStore / 事件流 / 审批·输入 handler（main 侧） | ✅ |
| Shell v2：TitleBar / Ribbon / 工作台导航 Panel / StatusBar（Hero 组件未接入） | ✅ |
| 浮动 Panel：运行日志 / 属性检查 | ✅ |
| Canvas：React Flow、节点/连线、小地图、右键菜单 | ✅ |
| 中性配色 + 真透明窗口 + 商务扁平画布 | ✅ |
| UI 打磨：去饱和色板 / 125% 字号 / 节点双层 / Session+Canvas 面板化 | ✅ |
| M1 最小可运行 Designer：GraphDocument / 编辑 / 运行 / 自动保存 / 检查器 | ✅ |
| M2 节点库 / configSchema 表单 / 预设 | ✅ 已完成（内建节点端口静态；失效边会提示） |
| UI 打磨 2：面板材质加深 / 主题化 Select·Checkbox / 最近使用 | ✅ |
| UI 打磨 3：标题栏手势 / 删除工作流回退 / Session 树缩进 / Ribbon 宽度 | ✅ |
| M3 校验与运行可视化：问题面板 / 内嵌图递归校验 / 事件→画布 / 暂停·继续 | ✅ |
| M4 文档生命周期与编辑体验：多图 / 撤销复制 / 框选·右键平移 / JSON 导入导出 | ✅ |
| M5 Workbench Framework：定义 / 实例 / 三个工作台 / WorkbenchPlan / 节点内联与端口槽 | ✅ |
| M6.1 Provider 工厂 / Secrets / 设置页 / 审批输入 / 跨重启恢复 | ✅ |
| M6.2 checkpoint v2 / 工作区工具 / 运行前依赖目录 / Session 生命周期 | ✅ |
| M6.3 Session 历史序列化 / 回放视图 / 附件渲染 | ✅ |
| M7.0 工作台导航 / Session 树 / RunResult 设计 | ✅ 设计定稿（ADR-019 / ADR-020） |
| M7.1 工作台导航宿主 / 工作流导航 / 左栏切换 | ✅ |
| M7.2 Session 递归文件夹 / SessionRecord v2 / 草稿目录 | ✅ |
| M7.3 Session 树导航 / 历史浮动面板 / 工作流右键菜单 | ✅ |
| M7.4 RunResult / 运行结果面板 / 保存到草稿 Session | ✅（手动保存入口已由 M8.6 取代） |
| M7.4.1 双区导航（工作流 + 会话上下分区） | ✅ |
| M7.5 工作台运行模式 / RunView / 动画原语 | ✅（独立运行页已移除，ADR-027） |
| M7.6 M7 收口（验证 / 文档 / 里程碑顺延） | ✅ |
| M8.1 工作台模板 / 内置节点预设（4 条） | ✅ |
| M8.2 `.fhws` 导入导出 UI / 副本冲突策略 | ✅ |
| M8.3 工作台模板化新建 / 多工作台 | ✅ |
| M8.4 节点库：工作区预设库 / 管理 Modal / 插入菜单 / 从节点创建 | ✅ |
| M8.5 移除独立运行页（flow-runner）/ 旧实例迁移 | ✅ |
| M8.6 运行即自动建会话 / 逐步写入 / 移除结果页签 | ✅ |
| M9.0 / M9.1 Provider 与 API Key 库（决策 / 契约 / 数据层） | ✅ |
| M9.2 Provider 运行时 / 健康 / IPC | ✅（真实 key 探测通过） |
| M9.3 Provider 设置页 / AppConfig v2 | ✅ |
| M9.4 Model 节点下拉 / Provider 健康提示 | ✅ |
| M9.5 Provider 节点 / 连线 | ✅（`core.provider` + Model `provider` 输入） |
| M9.6 Provider 收口 / 真实调用 / 能力校验 | ✅（DeepSeek Live 完成） |
| 节点交互约束：Provider 内联 / 连接锁定 / Constant 阅读模式 / 图级浮动面板布局 / 模型目录按需刷新 | ✅ |
| 表单控件收口：FH 下拉 / 无聚焦描边 / 自绘勾选 / 上游锁定只读 / JSON 代码主题 | ✅ |
| 未选择模型：空选项去重 / 仅节点红叹号提示 / 不阻断运行 | ✅ |
| 模型节点数据端口化：本地回退 / 端口连接锁定 / 本地模型绑定 / Agent Bot 图标 | ✅ |
| 节点端口徽标：输出数据优先 / 与主体留距·行顶对齐 / 灰↔橙红 / 选中不变色 | ✅ |
| 节点折叠模式：Header 按钮 / 只保留已连接与有数据字段 / `ui.collapsed` 持久化 | ✅ |
| 运行态动画：流式边进度 / 节点冷却 / 警戒环 / benchmark HUD | ✅ |
| 工作流多选与批量复制·删除 | ✅ |
| Filter / Combine 节点（Merge 更名与旧图迁移） | ✅ |
| 用户节点预设库文件导入 / 导出 | ⬜ |
| 打包分发 | ⬜ |

**已知限制**

- 真透明窗口可透出桌面，但当前 Chromium/Electron 无法模糊桌面（ADR-009）；
- 左侧栏是工作台导航 Panel：Harness 设计器为上下双区（上半区工作流、下半区 Session 树，可拖动分隔条）；其他工作台按模式显示单一导航；会话历史为 Canvas 浮动面板；
- Session 历史以 wireclaw `SessionData` 持久化；run 结果以 wireclaw `RunResult` 持久化。点击运行时会在草稿目录自动创建一条会话并自动打开「会话历史」面板，运行中的 ModelCall / Agent 条目逐步写入该会话，结束时追加输出摘要；不再有结果页签或手动「保存到会话 / 写入对话」；手动聊天输入尚未接入；
- 工作台已持久化 `mode` / `runId` / `sessionId`，设计 ↔ 运行可恢复；`harness-designer` 运行阶段复用同一张设计画布（只读 + 运行上下文条），不再有独立运行页；
- 设计器运行中切换视图会丢失节点/边状态（run 仍在 main 继续）；
- 暂停 run 的 checkpoint 已可跨重启恢复；wireclaw checkpoint v2 校验 graphHash 与 nodeVersions，恢复入口只在 Diagnostics；
- 运行前 requirements 目录已从 ProviderRegistry 注入；模型目录在设置页「刷新模型」后持久化，重启仍可用于下拉；
- Provider 库是应用级数据，不随 `.fhws` 导出；换 key 只改 Provider Profile，节点仍引用 `providerId`；
- Provider 节点输出 `provider` 引用，可连到 Model 的 `provider` 输入；连接优先，config.providerId 作为未连接回退；
- 受限环境（AppData 不可写）下 Provider 库 / secrets 的修改只在当前会话内存生效，设置页会显示明确警告；正常权限启动即可持久化；
- 表单控件（输入框 / 下拉 / JSON 代码区）不显示聚焦描边，焦点只由光标表达；下拉、勾选与代码区统一走 FH 原语，不再出现原生控件；
- 未被上游连接固定的字段（当前为 Model 的 Provider）只读展示来源值；修改需要回到上游 Provider 节点；
- 节点折叠（ADR-042）：状态保存在 `ui.collapsed`，折叠后只显示已连接端口与「有数据且非默认值」的字段；未连接端口徽标、空字段与 kind 标签隐藏，运行时只读不提供折叠入口；折叠态需要连新线时先展开；
- 工作流多选（ADR-043）：高亮即选中——打开中的工作流始终属于选择，Ctrl/Cmd 点击追加、Shift 从最近点击 / 打开项连选；选中行复用同一高亮，不额外提供勾选样式；批量操作仅复制 / 删除，导出仍走单条右键；额外选择不跨工作台或重启保留；
- 运行态动画（ADR-044）：连线只在 `node:stream`（真正输出内容）期间动画，普通值节点的交付是瞬时的、没有边动画；运行节点为橙红描边 + 2px 斜纹警戒环，完成后 1.5s 冷却回默认色，失败保持 danger；benchmark HUD 的 token 数是 stream 片段计数（近似），只保留最近 240 字符，运行结束清空，画布上的 HUD 按 150ms 节流刷新；
- 运行 HUD / 警戒环 / 边扫光都遵守 `prefers-reduced-motion`：扫光停在整条白线、警戒环静止、冷却直接到终态；
- 节点类型（ADR-045）：`core.merge` 已更名为 `core.filter`（二选一透传），新增 `core.combine` 把两个文本输入按 `separator` 拼接；旧图加载时递归迁移为 `core.filter`，`core.merge` 仅作为旧图 / 旧 run 的兼容别名保留、不出现在节点库；
- JSON 代码主题只覆盖 JSON（`ui/CodeArea` + `json-highlight`），大文本未做虚拟化；
- 清空 Model 的模型只在节点标题显示红色叹号（带 tooltip），不弹横幅、不进问题列表、不阻断运行；直接运行会在该节点以运行期错误结束（ADR-039）；
- Model Call / Agent Run 的每个数据字段都有输入端口与本地编辑；未连接时读 config（含 `providerId` / `modelId`），连接后字段锁定为只读展示（ADR-040）；
- 本地模型绑定只在 Model Call 参与能力校验，Provider 健康检查仍由 Model / Provider 节点承担；
- 本地 attachments / toolset 通过 JSON 编辑（`[{ contentHash }]` / `{ include, exclude }`），误填在运行期报错；新增字段与端口行使节点明显变高；
- 端口徽标与节点主体保持 5px 间距、上边缘对齐数据行；未连接为灰色 20px 方块 + 居中图标，已连接为 20px 橙红空圆环 + 6px 实心点（连线终点落在实心点中心，连线不再画端点小圆），颜色不随选中变化；位置按布局坐标测量，拖动 / 缩放不跳变；输出数据行只做展示、不可编辑；Styleguide 静态样张不渲染端口徽标；
- 草稿目录通过 Session 树文件夹右键「设为草稿目录」配置，暂无独立工作区设置页；
- `.fhws` 导入总是创建新工作区副本（不合并 / 不覆盖），档案不含 `runs/` 与 `sessions/`；工作台模板为内置静态列表（3 条，原「节点清单」并入节点库、独立运行页已移除）；节点库随工作区文档导出，独立于 `.fhws` 的预设文件导入 / 导出尚未接入；
- 标题栏关闭与 Ctrl+W 会先 flush 当前文档；系统级关闭（Alt+F4）仍无退出握手；
- 撤销栈只覆盖画布结构编辑与 config，重启后不保留；
- Agent 节点已接 Provider / 审批 / 用户输入，并注册工作区 LocalToolProvider（readFile / writeFile）；MCP 等更多工具待后续；
- WorkbenchPlan 目前在 renderer 侧顺序调用 `run:start`，尚未下沉 RuntimeHost；`plan.bindings` 与 `layout.overrides` 未接线；
- 节点内联编辑覆盖全部内建节点 config：Constant / Provider / Model / Model Call / Agent / ToolSet / Value / Loop / ForEach / Subgraph / Event Trigger / Log；对象与内嵌图走紧凑 JSON TextArea，复杂字段仍可在检查器 JSON 中查看；Constant 默认是截断正文 + hover Tooltip，标题栏按钮进入 TextArea 编辑；Provider 节点直接在下拉中切换；模型目录为空时会按需在后台刷新并持久化；
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
| `pnpm test` | main 数据层 + canvas core/view + designer core/state + workbench + 节点库 + Provider 库 + UI 纯函数单测（49 files / 285 tests） |
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
