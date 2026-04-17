# Jupyter Bridge Notebook

[English README](./README.md)

面向 VS Code 的 bridge-first Jupyter Notebook 工具链，配套提供 Codex skill，帮助你更快地操作、组织和执行 `.ipynb`。

这个仓库包含的主要内容：

- 本地 VS Code 扩展：`local.vscode-data-bridge`
- Codex skill：`jupyter-bridge-notebook`
- Go CLI：`bridgectl`
- Go stdio MCP 服务：`jupyterbridge-mcp`
- 一套 GitHub Release 工作流，用来发布 Windows / Linux 二进制和 skill bundle

## 项目能力

- 读取 notebook 状态、上下文、cells、输出和执行元数据
- 观察活动 notebook 切换、执行完成、输出变化以及推断的 busy / idle 状态
- 插入、更新、移动、复制、删除和选择 notebook cells
- 执行当前 cell、指定 cell、区间执行或整本执行
- 打开 Data Bridge 控制中心侧边栏查看状态和配置
- 打开变量视图、Data Viewer 和 Jupyter 输出面板
- 支持 notebook 调试相关命令
- 帮助 Codex 把 notebook 组织成合理的 markdown / code cells，而不是塞成一个超大单元

## 设计约束

这个项目默认走 bridge-first 的 notebook 控制模式。

- 只要 bridge 可用，notebook 修改就应该走 bridge 的 cell CRUD。
- 只要 bridge 可用，notebook 执行就应该走 bridge-backed 的 notebook run。
- Python 侧直接改 `.ipynb`、`nbclient` 执行、临时生成器脚本，都只是 fallback，不是默认路径。
- fallback 只应在 bridge 不可用，或者用户明确要求只生成离线文件时使用。
- 高风险验证路径：`/status -> /compliance -> /context -> /output`
- 正常快路径：`/status/brief -> /workflow/* -> /output/summary`
- 修改现有 cell 的标准路径：`GET /cell -> 带 readToken -> POST /cell/update` 或 `POST /workflow/updateAndRun`
- 动作接口默认返回紧凑结果；状态和输出要通过专门的状态/输出工具获取。
- `GET /commands` 和 `GET /capabilities` 是诊断接口，不属于正常 MCP notebook 工作流。
- `POST /cell/batch` 只适合一次处理一个阶段，通常 2-4 个相关 cells，不适合整本一次性灌入。
- 当 notebook kernel 已可用时，不要在 shell 里预跑同一段分析代码；shell 侧实验只保留给显式诊断。
- 不要把 `POST /run/all` 当成新 notebook 的第一轮有效验证。

## 能力真相源

bridge 路由与 MCP 工具映射的单一真相源在：

```text
.\internal\bridgecatalog\capabilities.json
```

其中每条记录至少包含：

- `method`
- `path`
- `status`：`supported | unsupported | planned`
- 简短说明
- 对应的 MCP tool 名称

README、skill cheatsheet 和 MCP tool registry 都应与这份清单保持一致。

## 项目结构

```text
jupyter-bridge-notebook-project/
├─ README.md
├─ README.zh-CN.md
├─ .gitignore
├─ .github/
│  └─ workflows/
│     └─ release.yml
├─ go.mod
├─ diagnostics.md
├─ release-manifest.json
├─ cmd/
│  ├─ bridgectl/
│  │  ├─ main.go
│  │  ├─ install.go
│  │  └─ install_test.go
│  ├─ jupyterbridge-mcp/
│  │  └─ main.go
│  └─ releasecheck/
│     └─ main.go
├─ internal/
│  ├─ bridgecatalog/
│  ├─ bridgeclient/
│  └─ mcpbridge/
├─ bridge-extension/
│  ├─ extension.js
│  ├─ package.json
│  ├─ package-lock.json
│  └─ README.md
├─ codex-skill/
│  └─ jupyter-bridge-notebook/
│     ├─ SKILL.md
│     ├─ install.md
│     ├─ agents/
│     ├─ bin/
│     ├─ scripts/
│     ├─ references/
│     └─ assets/vscode-data-bridge/
├─ mcp-examples/
│  ├─ codex-config.toml
│  └─ claude-desktop-config.json
└─ tmp/
   ├─ bridge/
   └─ bridgebody/
```

## 安装 Skill 和 Bridge

推荐方式是一条命令完成安装，但前提是先向用户说明会做什么并取得许可。

从源码仓库安装：

```text
go run ./cmd/bridgectl -install-skill . -configure-mcp auto
```

从解压后的 release bundle 安装：

```text
bin/<os-arch>/bridgectl(.exe) -install-skill . -configure-mcp auto
```

这个安装器会自动完成：

- 把 `jupyter-bridge-notebook` 复制到用户的 Codex skill 目录
- 把当前平台二进制 materialize 到安装后 skill 的 `scripts/` 目录
- 构建或复用 VSIX
- 安装 `local.vscode-data-bridge`
- 自动更新已识别的 Codex / Claude Desktop MCP 配置

如果只想安装扩展：

```text
go run ./cmd/bridgectl -install-extension ./bridge-extension/vscode-data-bridge-0.0.1.vsix
```

## 正常使用 Bridge

正常 notebook 工作应默认走 MCP-first。

常用 MCP 工具：

- `bridge_get_status_brief`
- `bridge_get_cell`
- `bridge_post_cell_batch`
- `bridge_post_workflow_update_and_run`
- `bridge_post_workflow_insert_and_run`
- `bridge_post_run_cell`
- `bridge_get_execution_state`
- `bridge_get_output_summary`

CLI 会为当前工作目录自动匹配合适的 bridge，继续保留给诊断、安装和低层排障使用。

CLI 还会维护一个短生命周期缓存：

```text
.\tmp\bridge\cache.json
```

这样可以避免每次都扫描整个 bridge 端口范围；缓存过期很快，失败后会自动失效。

## MCP 服务

`jupyterbridge-mcp(.exe)` 通过 MCP stdio transport 暴露本地 Data Bridge。

核心设计：

- MCP v1，tools-only
- 自动按当前工作目录选择最匹配的 bridge
- 支持进程内 active server override
- 和 `bridgectl(.exe)` 共享缓存、token、HTTP 逻辑
- 主要通过 tool description 和 MCP annotations 指导 agent 使用；当前 Go SDK 没有单独的 `input_examples` 字段

源码模式下可以这样运行：

```text
go run ./cmd/jupyterbridge-mcp
```

```text
go run ./cmd/jupyterbridge-mcp -cwd .
```

```text
go run ./cmd/jupyterbridge-mcp -base-url http://127.0.0.1:8765
```

常用 MCP tools：

- `bridge_list_servers`
  只在多窗口或多 bridge 目标可能冲突时使用
- `bridge_get_active_server`
  用于确认当前自动选择或 override 后的 server
- `bridge_set_active_server`
  只在自动匹配不准时使用
- `bridge_clear_active_server`
  临时 pin 结束后恢复自动匹配
- `bridge_get_status_brief`
  正常 notebook 工作的默认预检查
- `bridge_get_cell`
  读取已有 cell，并把 `readToken` 带到后续 mutation
- `bridge_get_output_summary`
  执行后的默认轻量确认
- `bridge_get_execution_state`
  用于读取 busy/idle、完成情况和输出观察状态，支持 `operationId` 与 `waitFor=completion|output|stable` 加 `timeoutMs`。`idle` 是 `stable` 的兼容别名。
- `bridge_post_cell_batch`
  用于阶段式结构搭建或多 cell 结构编辑。默认应保持小批量、事务式，并依赖写后校验。每个 operation 通常应显式写 `op`；纯新建 cell 且没有 locator 时，可自动推成 `append`。
- `bridge_post_cell_update`
  用于单个已有 cell 的安全更新，带 stale-read 保护
- `bridge_post_workflow_update_and_run`
  用于“更新已有 cell 并执行”。如果想一条调用里阻塞等待，可传 `block=true` 和 `timeoutMs`
- `bridge_post_workflow_insert_and_run`
  用于“插入新 cell 并执行”。如果想一条调用里阻塞等待，可传 `block=true` 和 `timeoutMs`
- `bridge_post_run_cell`
  用于明确定位后的单 cell 执行。也支持 `block=true` 和 `timeoutMs`

正常 MCP 使用规则：

- 默认优先 MCP tool，CLI 只用于诊断与安装
- 动作类工具默认走原子、紧凑返回
- 修改已有 cell 时先读，再带 `readToken`
- notebook / execution / output 状态单独通过读工具获取，不要指望动作工具夹带大状态
- `bridge_get_capabilities` 与 `bridge_get_commands` 只用于诊断，不是正常 notebook 工作前置
- 尊重 MCP annotations：只读工具标记为 read-only；只有会丢状态或清输出的动作才应带 destructive hint
- notebook 构建保持“按阶段”推进，不要一把 `bridge_post_cell_batch` 灌整本，也不要用 `bridge_post_run_all` 做第一轮验证

`bridge_post_kernel_shutdown` 目前仍然是 `unsupported`，这是有意保留的限制。

配置示例在：

```text
.\mcp-examples\
```

## Release 自检

发布或迁移前建议先做一次缺件检查：

```text
go run ./cmd/releasecheck .
```

需要的文件清单在：

```text
.\release-manifest.json
```

## GitHub Release

GitHub Actions 至少会发布这些资产：

- `bridgectl-windows-amd64.zip`
- `bridgectl-linux-amd64.tar.gz`
- `jupyterbridge-mcp-windows-amd64.zip`
- `jupyterbridge-mcp-linux-amd64.tar.gz`
- `vscode-data-bridge-0.0.1.vsix`
- `jupyter-bridge-notebook-skill-bundle.zip`

workflow 在：

```text
.\.github\workflows\release.yml
```

源码仓库保持干净，二进制和 VSIX 都作为 release 产物发布，而不是源码仓库常驻文件。

## 控制中心侧边栏

安装扩展并 reload VS Code 后，可以打开 `Data Bridge` 视图容器，查看和修改：

- 当前焦点 notebook 与选区
- 当前 bridge server 与 base URL
- 本地所有发现到的 bridge server
- bridge 修改/运行时的滚动跟随
- 中文界面标签
- 仅在视图可见时自动刷新的策略
- 安全设置，例如 `allowArbitraryCommands`
- host、base port、port span、auto-start、token

也可以把这个视图容器移动到 VS Code 右侧 secondary sidebar。

如果需要非默认 bridge host，可设置 `DATA_BRIDGE_BASE_URL` 或调整扩展配置。

如果要看 CLI 或 raw route 语法，请去看 [diagnostics.md](./diagnostics.md)。

如果在诊断模式下需要 `-body-file`，临时 JSON 请求体应放到：

```text
.\tmp\bridgebody\
```

不要再把 `bridge_body_*.json` 扔到项目根目录。

默认 notebook 模式是智能 `streaming-analysis`：

- 写一个阶段
- 跑这一阶段
- 看最小必要结果
- 继续或修正

只有用户明确要求时，才使用 `blank` 模式。

## Codex Skill

skill 位于：

```text
.\codex-skill\jupyter-bridge-notebook
```

如果想让 Codex 自动发现它，可以把它复制到：

```text
%CODEX_HOME%\skills\
```

这个 skill 的目标是：

- 修改或执行前先确认目标 notebook
- 先看 notebook / kernel 状态再行动
- 优先 MCP tools，其次 `bridgectl(.exe)`，而不是直接改 `.ipynb`
- 把 notebook 组织成任务导向的 code / markdown cells
- 禁用 PowerShell helper，统一走 `bridgectl(.exe)`

## GitHub 说明

- `node_modules`、`tmp` 请求体、打包二进制和生成的 VSIX 都不纳入源码跟踪
- release workflow 会构建 Windows / Linux 产物和打包好的 skill bundle
- skill 源目录本身保持轻量，安装器会在安装时把当前平台二进制 materialize 到 skill 目录里
