---
name: jupyter-bridge-notebook
description: Operate and structure Jupyter notebooks (.ipynb) in VS Code through the local Data Bridge. Use when working with notebook cells, markdown headings, kernel lifecycle, outputs, execution, debugging, variables, Data Viewer, or when reorganizing a notebook into well-scoped code and markdown cells instead of leaving large code blocks in a single cell.
---

# Jupyter Bridge Notebook

Use the local VS Code Data Bridge as the default control plane for notebook work. Read notebook identity and state before mutating or running anything. Structure notebooks into task-sized cells with appropriate markdown headings when the task calls for explanation, reporting, teaching, debugging, or staged analysis.

## Install and Availability

If bridge calls fail, if `/status` is unavailable, or if notebook bridge features appear missing:

1. Read [install.md](install.md).
2. Check whether the bridge extension is installed before attempting notebook work.
3. If it is missing, ask the user for approval to install it.
4. After approval, run the install script instead of manually reproducing the install steps.

Treat installation and migration assets in this skill folder as the source of truth for bridge setup.

## Target Notebook First

Before any write, run, or debug action:

1. Read `GET /status` or `GET /context`.
2. Confirm the active notebook `uri`, selection, and cell count.
3. If the user refers to a specific notebook and the active notebook does not match, stop and reconcile the target notebook first.
4. If there is no active notebook, recover focus before doing anything else.

Read [references/notebook-identity.md](references/notebook-identity.md) when:

- the user may have multiple notebooks open
- the notebook was closed, reloaded, or switched
- you need rules for choosing between notebook `uri`, title, and current selection

## State Before Action

Treat notebook and kernel state as part of the task. Read state before assuming a cell can be executed safely.

- Use `GET /status` for a quick check.
- Use `GET /context` when you need full notebook context.
- Use `GET /execution/state`, `GET /debug/state`, `GET /kernel/state`, and `GET /output` for targeted inspection.
- Treat `unknownBusyState: true` as "state not fully observable"; avoid risky bulk execution when the state is uncertain.

Read [references/state-model.md](references/state-model.md) when you need rules for:

- running vs idle vs unknown state
- uninitialized or unavailable notebook state
- likely user interruption or reload scenarios
- deciding whether to run, restart, debug, or recover first

## Notebook Structuring Rules

Notebook layout is a first-class skill, not an afterthought.

- Split by task boundary: imports, config, data loading, preprocessing, feature work, visualization, export, and conclusions should usually be separate cells.
- Split by debug boundary: network calls, database access, file IO, long-running computation, and plotting should be isolated into their own cells.
- Split by rerun cost: frequently rerun steps should not be bundled with heavy initialization or unrelated output.
- Add markdown headings when the user wants a report, tutorial, experiment log, presentation, or a more readable notebook.
- Reduce markdown when the user explicitly wants a minimal execution notebook.
- Avoid "one huge code cell". If one cell reads data, transforms it, analyzes it, plots it, and exports it, split it by default.
- Preserve linear execution context. When splitting cells, keep dependency order natural and avoid scattering shared state unnecessarily.

Choose a layout template from [references/structure-rules.md](references/structure-rules.md):

- data-analysis
- experiment/tuning
- debugging
- delivery/presentation

Default to the lightweight data-analysis template when the task type is unclear.

## Common Task Recipes

Use the bridge for notebook operations instead of directly editing `.ipynb` files whenever possible.

- Read notebook or cells: `GET /notebook`, `GET /cells`, `GET /cell`, `GET /context`
- Edit structure: `/cell/insert`, `/cell/append`, `/cell/update`, `/cell/move`, `/cell/delete`, `/cell/duplicate`
- Manage notebook selection: `/cell/select`, `/cell/reveal`
- Run cells: `/run/current`, `/run/cell`, `/run/above`, `/run/below`, `/run/all`, `/run/selectedAndAdvance`
- Manage outputs: `GET /output`, `/cell/replaceOutputs`, `/cell/clearOutputs`, `/output/clear`
- Debug cells: `/debug/cell`, `/debug/continue`, `/debug/stepOver`, `/debug/stop`
- Kernel and viewers: `/kernel/interrupt`, `/kernel/restart`, `/kernel/restartAndRunAll`, `/kernel/select`, `/viewer/variables/open`, `/viewer/data/open`, `/viewer/output/open`

Read [references/common-recipes.md](references/common-recipes.md) for task-oriented workflows.

## Recovery Rules

- If target cell lookup fails, retry with a stronger locator: prefer `index`, then `selection=current`, then a precise marker.
- If a marker matches multiple cells, do not guess.
- If notebook state is missing or stale, re-read `/status` or `/context`.
- If execution or debug state looks wrong after a reload, re-verify active notebook identity before acting.
- If `kernel/shutdown` is requested, note that it is currently unsupported and choose an available recovery path instead.

Read [references/debug-and-recovery.md](references/debug-and-recovery.md) for recovery and debug flows.
Read [references/limitations.md](references/limitations.md) before relying on edge behaviors.

## Reference Map

- Notebook targeting: [references/notebook-identity.md](references/notebook-identity.md)
- State model: [references/state-model.md](references/state-model.md)
- Common task recipes: [references/common-recipes.md](references/common-recipes.md)
- Notebook structuring: [references/structure-rules.md](references/structure-rules.md)
- Debug and recovery: [references/debug-and-recovery.md](references/debug-and-recovery.md)
- API quick lookup: [references/api-cheatsheet.md](references/api-cheatsheet.md)
- Known limitations: [references/limitations.md](references/limitations.md)

## Scripts

- Use [scripts/bridge_call.ps1](scripts/bridge_call.ps1) as the default wrapper for local bridge calls.
- Use [scripts/invoke-data-bridge.ps1](scripts/invoke-data-bridge.ps1) when you need a portable, skill-local bridge helper.
- Use [scripts/check_bridge_extension.ps1](scripts/check_bridge_extension.ps1) to detect whether the bridge extension is installed.
- Use [scripts/install_bridge_extension.ps1](scripts/install_bridge_extension.ps1) after user approval to install or reinstall the bridge extension from the bundled VSIX.
