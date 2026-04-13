# VSCode Data Bridge

Local VS Code extension that exposes notebook and data-analysis commands through:

- the Command Palette
- a local HTTP bridge on `127.0.0.1:8765` by default

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
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8765/execute -ContentType 'application/json' -Body '{"command":"jupyter.runcell","args":[]}'
```

If `dataBridge.token` is set, send:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8765/execute -Headers @{ Authorization = 'Bearer YOUR_TOKEN' } -ContentType 'application/json' -Body '{"command":"jupyter.runcell","args":[]}'
```
