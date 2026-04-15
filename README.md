# Jupyter Bridge Notebook

Bridge-first Jupyter notebook tooling for VS Code, paired with a Codex skill for fast `.ipynb` operations and notebook structuring.

This project bundles:

- a local VS Code extension: `local.vscode-data-bridge`
- a Codex skill: `jupyter-bridge-notebook`
- a Go CLI: `bridgectl.exe`
- a Go stdio MCP server: `jupyterbridge-mcp.exe`
- a portable VSIX for installation and migration

## What It Does

- Read notebook state, context, cells, outputs, and execution metadata
- Observe active notebook switches, execution completion, output changes, and inferred busy/idle state
- Insert, update, move, duplicate, delete, and select notebook cells
- Run current, targeted, ranged, or full-notebook execution flows
- Open a Data Bridge control center sidebar for status and settings
- Open Variables, Data Viewer, and Jupyter output panels
- Support notebook-oriented debugging commands
- Help Codex structure notebooks into well-scoped markdown and code cells instead of oversized single-cell scripts

## Operating Contract

This project is designed for bridge-first notebook control inside VS Code.

- If the bridge is available, notebook edits should go through bridge cell CRUD endpoints.
- If the bridge is available, notebook execution should go through bridge-backed notebook run endpoints.
- Python-side `.ipynb` rewriting, `nbclient` execution, and temporary generator scripts are fallback modes, not the default workflow.
- Fallback modes should only be used when the bridge is unavailable or the user explicitly asks for file-only generation.
- High-risk verification path: `/status` -> `/compliance` -> `/context` -> `/output`.
- Normal fast path: `/status/brief` -> `/workflow/*` -> `/output/summary`.
- Existing-cell mutation path: `GET /cell` -> carry `readToken` -> `POST /cell/update` or `POST /workflow/updateAndRun`.
- Action endpoints now default to compact responses. Read state and outputs through dedicated state/output tools instead of expecting them on every mutation or run call.
- `GET /commands` and `GET /capabilities` are diagnostic routes, not part of the normal MCP notebook workflow.

## Capability Truth Source

The single source of truth for bridge routes and MCP tool mapping is:

```text
.\internal\bridgecatalog\capabilities.json
```

Each entry records:

- `method`
- `path`
- `status`: `supported | unsupported | planned`
- a short description
- the MCP tool name that should map to the route

Project docs, the skill cheatsheet, and the MCP tool registry should be kept aligned with this file.

## Project Layout

```text
jupyter-bridge-notebook-project/
├─ README.md
├─ .gitignore
├─ go.mod
├─ bridgectl.exe
├─ jupyterbridge-mcp.exe
├─ releasecheck.exe
├─ release-manifest.json
├─ cmd/
│  └─ bridgectl/
│     └─ main.go
│  └─ jupyterbridge-mcp/
│     └─ main.go
│  └─ releasecheck/
│     └─ main.go
├─ internal/
│  ├─ bridgecatalog/
│  │  ├─ capabilities.json
│  │  └─ manifest.go
│  ├─ bridgeclient/
│  │  └─ client.go
│  └─ mcpbridge/
│     └─ server.go
├─ bridge-extension/
│  ├─ extension.js
│  ├─ package.json
│  ├─ package-lock.json
│  ├─ README.md
│  ├─ vscode-data-bridge-0.0.1.vsix
│  └─ .vscode/
└─ codex-skill/
   └─ jupyter-bridge-notebook/
      ├─ SKILL.md
      ├─ install.md
      ├─ agents/openai.yaml
      ├─ scripts/
      ├─ references/
      └─ assets/vscode-data-bridge/
```

## Install The VS Code Extension

Install the bundled VSIX:

```cmd
bridgectl.exe -install-extension .\bridge-extension\vscode-data-bridge-0.0.1.vsix
```

Then reload VS Code:

```text
Developer: Reload Window
```

## Use The Bridge

Check bridge status with the Go CLI:

```cmd
.\bridgectl.exe -method GET -path /status
```

Check brief bridge status for fast notebook work:

```cmd
.\bridgectl.exe -method GET -path /status/brief
```

Check bridge compliance with the Go CLI:

```cmd
.\bridgectl.exe -method GET -path /compliance
```

List discovered local bridge servers:

```cmd
.\bridgectl.exe -method GET -path /servers
```

The CLI auto-discovers the best matching bridge for the current working directory and is the only supported local client. PowerShell helpers are intentionally removed.

The CLI also keeps a short-lived cache in:

```text
.\tmp\bridge\cache.json
```

This avoids scanning the full bridge port range on every call. The cache expires quickly and is discarded on failures.

## Use The MCP Server

`jupyterbridge-mcp.exe` wraps the same local Data Bridge over MCP stdio transport.

Core design:

- tools-only MCP v1
- auto-select the best bridge for the current working directory
- optional in-process active server override
- same cache, token, and HTTP behavior as `bridgectl.exe`

Build or run examples:

```cmd
.\jupyterbridge-mcp.exe
```

```cmd
.\jupyterbridge-mcp.exe -cwd .
```

```cmd
.\jupyterbridge-mcp.exe -base-url http://127.0.0.1:8765
```

Important MCP tools:

- `bridge_list_servers`
- `bridge_get_active_server`
- `bridge_set_active_server`
- `bridge_clear_active_server`
- `bridge_get_status_brief`
- `bridge_get_context`
- `bridge_post_cell_update`
- `bridge_post_workflow_update_and_run`
- `bridge_post_run_cell`

Practical MCP usage rules:

- Use MCP tool calls as the default Codex path; keep CLI for diagnostics and install flows.
- Treat action tools as atomic and compact by default.
- Read cell state first, then mutate with the returned `readToken` when editing an existing cell.
- Fetch notebook, execution, or output state through dedicated read tools instead of expecting action tools to carry full state payloads.

`bridge_post_kernel_shutdown` is intentionally exposed but currently returns `unsupported`.

Example Codex/Claude-style MCP registration:

```json
{
  "mcpServers": {
    "jupyter-bridge": {
      "command": "D:\\sky\\jupyter-bridge-notebook-project\\jupyterbridge-mcp.exe",
      "args": [
        "-cwd",
        "D:\\sky"
      ]
    }
  }
}
```

Ready-made examples are also bundled under:

```text
.\mcp-examples\
```

## Release Safety Check

Before publishing or moving this project, validate that no required artifact is missing:

```cmd
.\releasecheck.exe .
```

or:

```cmd
go run .\cmd\releasecheck .
```

The required file list is stored in:

```text
.\release-manifest.json
```

## Control Center Sidebar

After installing the extension and reloading VS Code, open the `Data Bridge` view container to inspect and edit:

- current focused notebook and selection
- current bridge server and base URL
- all discovered local bridge servers
- scroll-follow behavior for bridge mutations and runs
- Chinese labels when VS Code uses Chinese
- visible-only auto refresh with configurable interval
- safety settings such as `allowArbitraryCommands`
- host, base port, port span, auto-start, and token

The container can be moved to the right secondary sidebar inside VS Code if that layout fits your workflow better.

If you need a non-default bridge host, set `DATA_BRIDGE_BASE_URL` or configure the extension host and port.

Read full notebook context:

```cmd
.\bridgectl.exe -method GET -path /context
```

Read only a cell output summary:

```cmd
.\bridgectl.exe -method GET -path "/output/summary?index=1"
```

Run the current notebook cell:

```cmd
.\bridgectl.exe -method POST -path /run/current
```

Run a specific cell:

```cmd
.\bridgectl.exe -method POST -path /run/cell -body "{\"index\":1}"
```

Update and run a specific cell through one bridge workflow:

```cmd
.\bridgectl.exe -method POST -path /workflow/updateAndRun -body "{\"index\":1,\"source\":\"print('hello from bridge')\",\"clearOutputs\":true}"
```

Insert a small stage in one request:

```cmd
.\bridgectl.exe -method POST -path /cell/batch -body-file .\tmp\bridgebody\stage.json
```

Clear outputs for one cell:

```cmd
.\bridgectl.exe -method POST -path /cell/clearOutputs -body "{\"index\":1}"
```

If you need `-body-file`, prefer storing temporary payloads under:

```text
.\tmp\bridgebody\
```

instead of dropping `bridge_body_*.json` into the workspace root.

The default notebook mode is smart `streaming-analysis`:

- write a stage
- run that stage
- inspect the smallest useful result
- continue or revise

Use `blank` mode only when the user explicitly wants no notebook workflow constraints.

## Use The Codex Skill

The bundled skill lives under:

```text
.\codex-skill\jupyter-bridge-notebook
```

If you want Codex to auto-discover it, copy that folder into:

```text
%CODEX_HOME%\skills\
```

or keep it as a portable project asset and reference it directly.

The skill is designed to:

- verify the target notebook before mutation or execution
- inspect notebook and kernel state before acting
- prefer MCP tools first, then `bridgectl.exe`, over direct `.ipynb` file edits
- structure notebooks into task-oriented cells with sensible markdown headings
- use `bridgectl.exe` instead of PowerShell helpers

## GitHub Notes

- `node_modules` is intentionally excluded from this packaged folder
- the portable VSIX is included so the extension can be installed without rebuilding
- the skill also includes a copy of the extension assets for migration
