# Diagnostics

Use this file only when MCP is unavailable or when the task is explicitly about bridge transport, install, or low-level troubleshooting.

## Diagnostics-Only Tools

- `bridge_get_capabilities`
- `bridge_get_commands`
- extension source
- project or extension diagnostics appendices

Do not use them as the first step in normal notebook work.

## CLI Fallback Shape

Only use this when the MCP client cannot call the bridge tools directly.

```text
bridgectl(.exe) -method GET -path /status/brief
bridgectl(.exe) -method GET -path /context
bridgectl(.exe) -method POST -path /workflow/updateAndRun -body-file ./tmp/bridgebody/workflow.json
bridgectl(.exe) -method POST -path /cell/batch -body-file ./tmp/bridgebody/stage.json
```

Rules:

- Always include `-method`.
- Always include `-path`.
- Prefer `-body-file` for multi-line source, markdown, or larger JSON.
- Store request bodies under `./tmp/bridgebody/`.
- Keep this syntax out of the normal MCP-first notebook path.
