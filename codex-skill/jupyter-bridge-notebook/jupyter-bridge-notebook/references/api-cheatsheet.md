# MCP Cheatsheet

Use MCP tools as the normal notebook path. Treat raw routes and CLI syntax as diagnostics-only.

## Normal Fast Path

- `bridge_get_status_brief`
- `bridge_get_cell`
- `bridge_post_cell_batch`
- `bridge_post_cell_update`
- `bridge_post_workflow_update_and_run`
- `bridge_post_workflow_insert_and_run`
- `bridge_post_run_cell`
- `bridge_get_execution_state`
- `bridge_get_output_summary`

## High-Risk State Reads

- `bridge_get_status`
- `bridge_get_compliance`
- `bridge_get_context`
- `bridge_get_output`

Use these only when notebook identity is unclear, a marker lookup is risky, execution drift is suspected, or the task is explicitly diagnostic.

## Server Binding

- `bridge_list_servers`
- `bridge_get_active_server`
- `bridge_set_active_server`
- `bridge_clear_active_server`

## Cell CRUD

- `bridge_post_cell_read`
- `bridge_post_cell_insert`
- `bridge_post_cell_append`
- `bridge_post_cell_update`
- `bridge_post_cell_delete`
- `bridge_post_cell_move`
- `bridge_post_cell_duplicate`
- `bridge_post_cell_select`
- `bridge_post_cell_reveal`
- `bridge_post_cell_replace_outputs`
- `bridge_post_cell_clear_outputs`

## Execution

- `bridge_post_run_current`
- `bridge_post_run_cell`
- `bridge_post_run_above`
- `bridge_post_run_below`
- `bridge_post_run_all`
- `bridge_post_run_selected_and_advance`
- `bridge_post_run_precedents`
- `bridge_post_run_dependents`

## Workflow

- `bridge_post_workflow_update_and_run`
- `bridge_post_workflow_insert_and_run`

## Debug

- `bridge_post_debug_cell`
- `bridge_post_debug_continue`
- `bridge_post_debug_step_over`
- `bridge_post_debug_stop`

## Kernel and Notebook

- `bridge_post_kernel_interrupt`
- `bridge_post_kernel_restart`
- `bridge_post_kernel_restart_and_run_all`
- `bridge_post_kernel_restart_and_run_to_cell`
- `bridge_post_kernel_select`
- `bridge_post_notebook_save`
- `bridge_post_notebook_revert`
- `bridge_post_notebook_close_editor`
- `bridge_post_notebook_focus`

## Viewers

- `bridge_post_viewer_variables_open`
- `bridge_post_viewer_data_open`
- `bridge_post_viewer_output_open`
- `bridge_post_interpreter_select`

## Diagnostics Only

- `bridge_get_capabilities`
- `bridge_get_commands`
- raw route docs
- CLI fallback syntax

## Notes

- `bridge_post_kernel_shutdown` is declared but currently unsupported.
- `bridge_get_cell` returns a `readToken`; pass it back on update-style mutations to guard against stale edits.
- `bridge_post_cell_batch` defaults to `mode: "transactional"`, compact per-operation results, stale-read protection for existing-cell mutations, and write verification for source-bearing append/insert/update operations.
- Each batch operation should normally provide `op`. Supported values are `append`, `insert`, `update`, `delete`, `move`, `duplicate`, `select`, `reveal`, `replaceOutputs`, and `clearOutputs`. For pure new-cell payloads with only source/kind metadata and no locator, `append` is inferred automatically.
- Treat `bridge_post_cell_batch` as a stage-sized scaffolding tool, usually 2-4 related cells, not a full-notebook dump.
- `bridge_post_workflow_update_and_run` and `bridge_post_workflow_insert_and_run` default to compact mutation/execution responses and execution tickets. Request observation or output only when needed.
- `bridge_get_execution_state` accepts `operationId` and can wait with `waitFor=completion|output|stable` plus `timeoutMs` instead of hand-written sleeps. `idle` is accepted as a legacy alias of `stable`.
- `bridge_get_output_summary` reports whether execution is still pending, completed with no output, or completed with output.
