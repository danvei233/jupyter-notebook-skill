# VSCode Data Bridge

Local VS Code extension that exposes notebook and data-analysis commands through:

- the Command Palette
- a dedicated Data Bridge control center sidebar
- a local HTTP bridge on a configurable host and port

Defaults:

- host: `127.0.0.1`
- port: `8765`
- override via extension settings or environment variables:
  - `DATA_BRIDGE_HOST` / `VSCODE_DATA_BRIDGE_HOST`
  - `DATA_BRIDGE_PORT` / `VSCODE_DATA_BRIDGE_PORT`
  - `DATA_BRIDGE_TOKEN` / `VSCODE_DATA_BRIDGE_TOKEN`

## What It Can Trigger

- `jupyter.runcell`
- `jupyter.runcurrentcell`
- `jupyter.runallcells`
- `jupyter.restartkernel`
- `jupyter.interruptkernel`
- `jupyter.openVariableView`
- `jupyter.showDataViewer`
- `notebook.selectKernel`

It can also execute other `jupyter.*`, `notebook.*`, `interactive.*`, and `workbench.action.notebook.*` commands by default.

## Observability

The bridge also tracks notebook runtime signals from VS Code notebook events so agents can act on real editor state instead of assuming it:

- active notebook identity and switch events
- execution requests and pending execution targets
- output change notifications
- execution summary changes
- inferred busy/idle transitions for the active notebook

These signals are surfaced through `GET /status`, `GET /context`, `GET /execution/state`, and `GET /kernel/state`.

Bridge-first compliance is surfaced through `GET /compliance`, and common mutation-plus-execution flows are available as:

- `POST /workflow/updateAndRun`
- `POST /workflow/insertAndRun`

Lightweight routes are also available for faster clients:

- `GET /status/brief`
- `GET /output/summary`
- `POST /cell/batch`

The workflow endpoints accept lighter observation controls:

- `observe`: `none | completion | outputSummary`
- `includeOutput`: default `false`

Practical MCP-facing rules for this bridge:

- Action endpoints are compact by default. Fetch notebook, execution, or output state through dedicated read routes instead of expecting it on every mutation or run response.
- When editing an existing cell, read it first and carry its `readToken` into the mutation request so stale writes are rejected instead of silently overwriting newer cell content.
- `GET /commands` and `GET /capabilities` are diagnostics only. Normal MCP notebook work should rely on the registered tool surface, route descriptions, and tool annotations instead of probing the bridge first.
- The MCP server enriches tools with read-only and destructive hints so clients can distinguish pure reads from notebook-changing actions without reverse-engineering route names.

`POST /kernel/shutdown` is intentionally declared but currently unsupported.

## Control Center Sidebar

The extension contributes a `Data Bridge` sidebar with a `Control Center` view. It shows:

- the current focused notebook
- the bound bridge server and base URL
- the local bridge server list across the configured port span
- kernel busy/idle and bridge compliance state
- editable settings for auto-start, scroll follow, host, port, port span, token, and command safety
- Chinese UI labels when VS Code is running in Chinese
- lightweight auto-refresh only while the control center is visible

If you prefer the secondary sidebar on the right, move the `Data Bridge` view container there in VS Code after reload.

## Install For Development

1. Open this folder as a VS Code extension project.
2. Press `F5` to start an Extension Development Host.
3. In the development host, open your notebook workspace.

## HTTP API

The repository truth source for route status and MCP tool mapping is:

```text
..\internal\bridgecatalog\capabilities.json
```

### `GET /status`

Returns bridge status and active notebook metadata.

### `GET /status/brief`

Returns lightweight notebook identity, server, and busy/idle state.

### `GET /servers`

Returns the local bridge server list discovered across the configured host and port span.

### `GET /commands`

Returns the built-in quick command list.

Diagnostic only. Do not use this as a normal notebook-task preflight.

### `GET /capabilities`

Returns bridge capability metadata.

Diagnostic only. MCP clients should normally rely on the registered tool surface and descriptions instead of probing capabilities before routine notebook work.

### `GET /output/summary`

Returns lightweight output summary for a target cell.
It also distinguishes pending execution, completed-no-output, and completed-with-output.

### `GET /execution/state`

Returns execution observation state for the active notebook or a specific `operationId`.
Use `waitFor` plus `timeoutMs` when you need the bridge itself to await completion or stable output instead of relying on manual sleep loops.

### `POST /cell/batch`

Applies several cell mutations in one request.
Source-bearing append, insert, and update operations are verified after apply. Transactional mode rolls back on verification failure.

### `POST /execute`

Advanced passthrough only.

Do not use this as a normal notebook-workflow entry point when a higher-level MCP tool already exists. The recommended high-level client is the stdio MCP server `jupyterbridge-mcp.exe`; reserve `bridgectl.exe` and raw route syntax for diagnostics, installs, and direct HTTP troubleshooting.
