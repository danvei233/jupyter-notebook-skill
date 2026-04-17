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
- `POST /cell/batch` is for one stage at a time, usually 2-4 related cells, not a whole-notebook dump.
- When the notebook kernel is available, do not pre-run the same analysis in shell-side Python as part of the normal path; reserve shell-side experiments for explicit diagnostics.
- Do not use `POST /run/all` as the first meaningful validation step for a fresh notebook build.

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
├─ diagnostics.md
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

Normal notebook work should be MCP-first.

Use these MCP tools as the standard path:

- `bridge_get_status_brief`
- `bridge_get_cell`
- `bridge_post_cell_batch`
- `bridge_post_workflow_update_and_run`
- `bridge_post_workflow_insert_and_run`
- `bridge_post_run_cell`
- `bridge_get_execution_state`
- `bridge_get_output_summary`

The CLI auto-discovers the best matching bridge for the current working directory and remains available for diagnostics, installs, and low-level troubleshooting. PowerShell helpers are intentionally removed.

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
- tool descriptions and MCP annotations are the primary guidance surface for agents; the current Go SDK version used here does not expose a dedicated `input_examples` field on `mcp.Tool`

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
  Use only when multiple VS Code windows or bridge targets may be involved.
- `bridge_get_active_server`
  Use to confirm the current automatic or overridden bridge target.
- `bridge_set_active_server`
  Use only when automatic server matching is ambiguous or wrong.
- `bridge_clear_active_server`
  Use after a temporary server pin to return to automatic matching.
- `bridge_get_status_brief`
  Default preflight for normal notebook work.
- `bridge_get_cell`
  Read an existing cell and carry its `readToken` into a follow-up mutation.
- `bridge_get_output_summary`
  Default lightweight confirmation after execution.
- `bridge_get_execution_state`
  Read execution observation when you need busy/idle and completion details. It also accepts `operationId`, and callers can wait using `waitFor=completion|output|stable` plus `timeoutMs` instead of hand-written sleeps. `idle` is accepted as a legacy alias of `stable`.
- `bridge_post_cell_batch`
  Use for stage scaffolding or multi-cell structural edits. Keep batches small, usually 2-4 related cells, and rely on transactional write verification by default. Each operation should normally set `op`; for pure new-cell payloads with only source/kind metadata and no locator, `append` is inferred automatically.
- `bridge_post_cell_update`
  Use for one existing-cell edit with stale-read protection.
- `bridge_post_workflow_update_and_run`
  Use when a known existing cell should be updated and executed in one compact step. Read the cell first, pass its `readToken`, and then inspect `bridge_get_execution_state` or `bridge_get_output_summary` as needed. If a single blocking call is simpler, pass `block=true` with `timeoutMs`.
- `bridge_post_workflow_insert_and_run`
  Use when a new cell should be inserted and immediately executed. The default response stays compact and returns an execution ticket; await or read output only when needed. If a single blocking call is simpler, pass `block=true` with `timeoutMs`.
- `bridge_post_run_cell`
  Use for targeted execution once notebook identity and cell targeting are already clear. Pass `block=true` with `timeoutMs` when you want the tool to wait rather than chaining a separate execution-state call.

Practical MCP usage rules:

- Use MCP tool calls as the default Codex path; keep CLI for diagnostics and install flows.
- Treat action tools as atomic and compact by default.
- Read cell state first, then mutate with the returned `readToken` when editing an existing cell.
- Fetch notebook, execution, or output state through dedicated read tools instead of expecting action tools to carry full state payloads.
- Treat `bridge_get_capabilities` and `bridge_get_commands` as diagnostics, not as a normal MCP notebook preflight.
- Respect MCP annotations: read tools are marked read-only, and state-changing tools are marked as non-read-only with destructive hints only where the action can discard state or outputs.
- Keep notebook construction stage-based. Do not dump an entire teaching notebook in one `bridge_post_cell_batch`, and do not use `bridge_post_run_all` as the first validation pass.

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

If you need CLI or raw route examples for diagnostics, use [diagnostics.md](./diagnostics.md).

If you need `-body-file` in diagnostics mode, prefer storing temporary payloads under:

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
