# Diagnostics

Use this file only for low-level troubleshooting, install validation, or transport debugging. Normal notebook work should use the MCP tool surface and not teach raw bridge routes.

## CLI Shape

```cmd
.\bridgectl.exe -method GET -path /status/brief
.\bridgectl.exe -method GET -path /context
.\bridgectl.exe -method GET -path "/output/summary?index=1"
.\bridgectl.exe -method POST -path /run/current
.\bridgectl.exe -method POST -path /run/cell -body "{\"index\":1}"
.\bridgectl.exe -method POST -path /workflow/updateAndRun -body-file .\tmp\bridgebody\workflow.json
.\bridgectl.exe -method POST -path /cell/batch -body-file .\tmp\bridgebody\stage.json
```

Rules:

- Always include `-method`.
- Always include `-path`.
- Use `-body-file` for multi-line source, markdown, or larger payloads.
- Write temporary payloads under `./tmp/bridgebody/`.
- Do not use this syntax in normal MCP-first notebook instructions.

## Diagnostics-Only Routes

- `GET /commands`
- `GET /capabilities`
- `GET /status`
- `GET /context`

These are troubleshooting tools, not normal notebook-task preflight.
