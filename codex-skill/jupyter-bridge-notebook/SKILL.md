---
name: jupyter-bridge-notebook
description: Operate and structure Jupyter notebooks (.ipynb) in VS Code through the local Data Bridge. Use when working with notebook cells, markdown headings, kernel lifecycle, outputs, execution, debugging, variables, Data Viewer, or when reorganizing a notebook into well-scoped code and markdown cells instead of leaving large code blocks in a single cell.
---

# Jupyter Bridge Notebook

Use the local VS Code Data Bridge as the default control plane for notebook work.

Execution priority:

1. MCP tools backed by the local Data Bridge
2. the installed platform binary under `scripts/jupyterbridge-mcp(.exe)` when the MCP client still needs a local stdio server binary from the installed skill
3. the installed platform binary under `scripts/bridgectl(.exe)` as a fallback transport and low-level diagnostic client
4. non-bridge fallback only with explicit user approval

## Core Contract

- When the bridge is available, notebook mutation and execution must go through the bridge.
- Do not silently fall back to `.py` generators, `nbclient`, `nbconvert`, or direct `.ipynb` rewriting.
- Do not claim a cell ran or produced outputs unless bridge-backed execution or direct bridge output reads confirm it.
- PowerShell is forbidden for this skill. Use the installed `scripts/bridgectl(.exe)` binary.
- Do not explain or rely on raw HTTP route syntax during normal notebook work. Default to MCP tools and let the MCP client carry transport details.
- Only drop down to `bridgectl(.exe)` syntax when MCP is unavailable or when low-level diagnostics are required.
- If temporary JSON request bodies are needed for `bridgectl -body-file`, store them under `./tmp/bridgebody/` in the current working directory, not in the project root.
- For multi-line source, long markdown, or larger JSON payloads, default to `bridgectl -body-file` instead of inline `-body`.
- Treat the capability manifest as the truth source. If docs and behavior disagree, verify against the manifest-backed MCP tool set or the current bridge responses.

## Workflow Modes

Default mode: `streaming-analysis`.

### `streaming-analysis`

Use this unless the user explicitly asks for something looser.

- Use smart streaming, not mechanical over-checking.
- Write one small stage or one coherent phase.
- Run that phase.
- Inspect the smallest useful result.
- Adjust code or continue.
- Generate conclusions from observed results, not from assumptions.
- Do not default to writing the full notebook and then finishing with `/run/all`.

### `blank`

Use this only when the user explicitly wants no imposed notebook workflow.

- Keep bridge-first mutation/execution rules.
- Otherwise allow normal Codex judgment about structure and execution order.

Read [references/workflow-modes.md](references/workflow-modes.md) for the full mode rules.

## First Moves

Default to the lightest check that keeps the target notebook unambiguous.

For normal work:

1. `bridge_get_status_brief`
2. confirm active notebook `uri`, `identity.versionToken`, selection, and cell count
3. mutate or run with the smallest safe bridge call

Only escalate when risk is real:

- Low risk: stable notebook identity, known `index`, mutation only.
  Use cached bridge identity plus `bridge_post_cell_update`, `bridge_post_cell_insert`, or a small `bridge_post_cell_batch`.
- Medium risk: mutation plus targeted run on a known cell.
  Use `bridge_get_status_brief` once, then `bridge_post_workflow_update_and_run` or `bridge_post_workflow_insert_and_run`.
- High risk: marker lookup, notebook ambiguity, kernel lifecycle, `run all`, debugging, output drift, or multi-window uncertainty.
  Use full `bridge_get_status` + `bridge_get_compliance` + `bridge_get_context`.

Use `bridge_list_servers` and `bridge_set_active_server` when multiple windows or bridge servers may be involved. Use `GET /servers` only when falling back to CLI.

## Structure Rules

- Split notebooks by task boundary, debug boundary, rerun cost, and execution checkpoint.
- Avoid one huge code cell.
- Add markdown headings when the notebook is meant to explain, report, teach, or present.
- Keep markdown lighter when the user wants a minimal runnable notebook.
- Prefer stage-by-stage validation over full-notebook first-pass execution.

Read [references/structure-rules.md](references/structure-rules.md) when you need detailed layout rules or templates.

## Plotting Rule

When using `matplotlib` / `plt`, apply the default style contract unless the user overrides it:

- English: `Times New Roman`
- Chinese: `SimSun` / 宋体
- UTF-8-safe Chinese support enabled
- axes spines width `1.5`
- titles, axis titles, and tick labels bold
- Add one dedicated plotting-style setup cell before the first real chart cell
- Do not emit a chart cell until that style setup cell exists in the notebook
- Do not rely on matplotlib defaults after the setup cell is present; each chart must call the shared style helper

Read [references/plotting-style.md](references/plotting-style.md) for the reusable setup cell.

## High-Value Paths

- MCP-first light state: `bridge_get_status_brief`, `bridge_get_output_summary`
- MCP-first full state: `bridge_get_status`, `bridge_get_compliance`, `bridge_get_context`, `bridge_get_output`
- MCP-first server binding: `bridge_list_servers`, `bridge_get_active_server`, `bridge_set_active_server`, `bridge_clear_active_server`
- CLI fallback: diagnostics appendix only
- Edit cells: `bridge_post_cell_insert`, `bridge_post_cell_append`, `bridge_post_cell_update`, `bridge_post_cell_move`, `bridge_post_cell_delete`, `bridge_post_cell_batch`
- Atomic workflows: `bridge_post_workflow_update_and_run`, `bridge_post_workflow_insert_and_run`
- Run targeted cells: `bridge_post_run_current`, `bridge_post_run_cell`, `bridge_post_run_above`, `bridge_post_run_below`
- Debug: `bridge_post_debug_cell`, `bridge_post_debug_continue`, `bridge_post_debug_step_over`, `bridge_post_debug_stop`
- Viewers: `bridge_post_viewer_variables_open`, `bridge_post_viewer_data_open`, `bridge_post_viewer_output_open`
- UI: open the `Data Bridge` control center when interactive status/config is useful

## Fast Defaults

- Do not open README, skill references, extension source, commands, or capabilities during a normal notebook task unless bridge behavior is unclear.
- Do not call `bridge_get_capabilities` or `bridge_get_commands` during normal notebook work. Treat them as bridge diagnostics only.
- When the notebook kernel is available, do not shell-run the same sklearn or analysis code that the notebook is about to run. Only use shell-side Python as an explicit diagnostic path when bridge-backed execution is unclear or the user asks for it.
- Prefer `bridge_post_cell_batch` for stage scaffolding and `bridge_post_workflow_*` for mutation + targeted execution.
- Prefer `bridge_get_output_summary` over full output reads unless the next step truly depends on full payload details.
- When a single blocking call is simpler than a separate await/read cycle, prefer `block=true` with `timeoutMs` on `bridge_post_run_*` or `bridge_post_workflow_*` instead of external sleep loops.
- Before mutating an existing cell, read that cell once and carry its `readToken` into the mutation call.
- If a mutation fails with a stale-read error, re-read the cell and regenerate from the fresh source instead of retrying blindly.
- Treat `bridge_post_cell_batch` as a stage tool, not a whole-notebook dump. Default to 2-4 closely related cells per batch unless the user explicitly asks for a larger structural operation.
- Do not use `bridge_post_run_all` as the first meaningful validation pass for a fresh notebook build.

Read [references/common-recipes.md](references/common-recipes.md) for task recipes.
Read [references/diagnostics.md](references/diagnostics.md) only for low-level fallback syntax.

## Recovery

- If locator lookup fails, strengthen the locator: `index` > `selection=current` > precise marker.
- If marker matches multiple cells, do not guess.
- If state is stale, re-read `/status/brief` first, then `/status` or `/context` if needed.
- If MCP is available, prefer re-reading `bridge_get_status_brief` first, then `bridge_get_status` or `bridge_get_context` if needed.
- If bridge mutation or execution fails, diagnose bridge first. Do not switch paths silently.
- `kernel/shutdown` is currently unsupported.

## Do Not Overuse Heavy Mode

Prefer `blank` mode or file-only notebook generation when:

- the user only wants a static `.ipynb` template
- the task is mainly markdown restructuring or title cleanup
- the target is not the active notebook
- live kernel state and live outputs are irrelevant

Do not mix control-center polling into normal notebook execution work unless the user explicitly wants server or UI status.

Read:

- [references/notebook-identity.md](references/notebook-identity.md)
- [references/state-model.md](references/state-model.md)
- [references/debug-and-recovery.md](references/debug-and-recovery.md)
- [references/api-cheatsheet.md](references/api-cheatsheet.md)
- [references/limitations.md](references/limitations.md)

## Install

If bridge features are missing:

1. Read [install.md](install.md)
2. Explain that the one-click installer will:
   - copy the skill into the user's Codex skill directory
   - materialize the current platform binaries into the installed skill `scripts/` folder
   - install the VS Code extension
   - update Codex / Claude MCP config when those clients are detected
3. After user approval, run the installer:
   - from a source checkout: `go run ./cmd/bridgectl -install-skill . -configure-mcp auto`
   - from an extracted release bundle: `bin/<os-arch>/bridgectl(.exe) -install-skill . -configure-mcp auto`
