# API Cheatsheet

## Read

- `GET /status/brief`
- `GET /status`
- `GET /servers`
- `GET /compliance`
- `GET /notebook`
- `GET /notebook/dirty`
- `GET /cells`
- `GET /cell`
- `GET /context`
- `GET /kernel`
- `GET /kernel/state`
- `GET /output`
- `GET /output/summary`
- `GET /execution/state`
- `GET /debug/state`

## Cell CRUD

- `POST /cell/read`
- `POST /cell/batch`
- `POST /cell/insert`
- `POST /cell/append`
- `POST /cell/update`
- `POST /cell/delete`
- `POST /cell/move`
- `POST /cell/duplicate`
- `POST /cell/select`
- `POST /cell/reveal`
- `POST /cell/replaceOutputs`
- `POST /cell/clearOutputs`
- `POST /workflow/updateAndRun`
- `POST /workflow/insertAndRun`

## Run

- `POST /run/current`
- `POST /run/cell`
- `POST /run/above`
- `POST /run/below`
- `POST /run/all`
- `POST /run/selectedAndAdvance`
- `POST /run/precedents`
- `POST /run/dependents`

## Debug

- `POST /debug/cell`
- `POST /debug/continue`
- `POST /debug/stepOver`
- `POST /debug/stop`

## Kernel and Notebook

- `POST /kernel/interrupt`
- `POST /kernel/restart`
- `POST /kernel/restartAndRunAll`
- `POST /kernel/restartAndRunToCell`
- `POST /kernel/shutdown`
- `POST /kernel/select`
- `POST /notebook/save`
- `POST /notebook/revert`
- `POST /notebook/closeEditor`
- `POST /notebook/focus`

## Advanced

- `POST /execute`
- `POST /executeCellByIndex`

## Viewers

- `POST /viewer/variables/open`
- `POST /viewer/data/open`
- `POST /viewer/output/open`
- `POST /interpreter/select`

## Diagnostics Only

- `GET /commands`
- `GET /capabilities`

## MCP-First Aliases

- `bridge_get_status_brief`
- `bridge_get_status`
- `bridge_get_compliance`
- `bridge_get_context`
- `bridge_get_output_summary`
- `bridge_list_servers`
- `bridge_set_active_server`
- `bridge_clear_active_server`
- `bridge_post_cell_batch`
- `bridge_post_workflow_update_and_run`
- `bridge_post_workflow_insert_and_run`

## Notes

- `POST /kernel/shutdown` is declared but currently unsupported.
- Prefer MCP tools when available; use `bridgectl.exe` as CLI fallback.
- `GET /cells`, `GET /cell`, and `GET /context` now default to lightweight views; source, metadata, and outputs are opt-in.
- `GET /cell` returns a `readToken`; pass it back on update-style mutations to guard against stale edits.
- `POST /cell/batch` defaults to `mode: "transactional"` and compact per-operation results.
- `POST /workflow/updateAndRun` and `POST /workflow/insertAndRun` default to compact mutation/execution responses; use `observe` and `includeOutput` only when needed.
