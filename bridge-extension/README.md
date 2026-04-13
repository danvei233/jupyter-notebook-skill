# VSCode Data Bridge

Local VS Code extension that exposes notebook and data-analysis commands through:

- the Command Palette
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

## Install For Development

1. Open this folder as a VS Code extension project.
2. Press `F5` to start an Extension Development Host.
3. In the development host, open your notebook workspace.

## HTTP API

### `GET /status`

Returns bridge status and active notebook metadata.

### `GET /commands`

Returns the built-in quick command list.

### `POST /execute`

Example body:

```json
{
  "command": "jupyter.runcell",
  "args": []
}
```

PowerShell example:

```powershell
$baseUrl = if ($env:DATA_BRIDGE_BASE_URL) { $env:DATA_BRIDGE_BASE_URL } else { 'http://127.0.0.1:8765' }
Invoke-RestMethod -Method Post -Uri "$baseUrl/execute" -ContentType 'application/json' -Body '{"command":"jupyter.runcell","args":[]}'
```

If `dataBridge.token` is set, send:

```powershell
$baseUrl = if ($env:DATA_BRIDGE_BASE_URL) { $env:DATA_BRIDGE_BASE_URL } else { 'http://127.0.0.1:8765' }
Invoke-RestMethod -Method Post -Uri "$baseUrl/execute" -Headers @{ Authorization = 'Bearer YOUR_TOKEN' } -ContentType 'application/json' -Body '{"command":"jupyter.runcell","args":[]}'
```
