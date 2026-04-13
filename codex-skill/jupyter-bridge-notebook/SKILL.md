---
name: jupyter-bridge-notebook
description: Operate and structure Jupyter notebooks (.ipynb) in VS Code through the local Data Bridge. Use when working with notebook cells, markdown headings, kernel lifecycle, outputs, execution, debugging, variables, Data Viewer, or when reorganizing a notebook into well-scoped code and markdown cells instead of leaving large code blocks in a single cell.
---

# Jupyter Bridge Notebook

Use the local VS Code Data Bridge as the default control plane for notebook work.

## Core Contract

- When the bridge is available, notebook mutation and execution must go through the bridge.
- Do not silently fall back to `.py` generators, `nbclient`, `nbconvert`, or direct `.ipynb` rewriting.
- Do not claim a cell ran or produced outputs unless bridge-backed execution or direct bridge output reads confirm it.
- PowerShell is forbidden for this skill. Use `scripts/bridgectl.exe`.
- If temporary JSON request bodies are needed for `bridgectl -body-file`, store them under `./tmp/bridgebody/` in the current working directory, not in the project root.
- For multi-line source, long markdown, or larger JSON payloads, default to `bridgectl -body-file` instead of inline `-body`.

## Workflow Modes

Default mode: `streaming-analysis`.

### `streaming-analysis`

Use this unless the user explicitly asks for something looser.

- Write a small stage.
- Run that stage.
- Inspect outputs/state.
- Adjust code or continue.
- Generate conclusions from observed results, not from assumptions.
- Do not default to writing the full notebook and then finishing with `/run/all`.

### `blank`

Use this only when the user explicitly wants no imposed notebook workflow.

- Keep bridge-first mutation/execution rules.
- Otherwise allow normal Codex judgment about structure and execution order.

Read [references/workflow-modes.md](references/workflow-modes.md) for the full mode rules.

## First Moves

Before any write, run, or debug action:

1. `GET /status`
2. `GET /compliance`
3. `GET /context` or `GET /cell`

Confirm:

- active notebook `uri`
- `identity.versionToken`
- selection
- cell count

Use `GET /servers` when multiple windows or bridge servers may be involved.

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

Read [references/plotting-style.md](references/plotting-style.md) for the reusable setup cell.

## High-Value Paths

- Read state: `GET /status`, `GET /compliance`, `GET /context`, `GET /output`
- Discover windows/servers: `GET /servers`
- Edit cells: `/cell/insert`, `/cell/append`, `/cell/update`, `/cell/move`, `/cell/delete`
- Atomic workflows: `/workflow/updateAndRun`, `/workflow/insertAndRun`
- Run targeted cells: `/run/current`, `/run/cell`, `/run/above`, `/run/below`
- Debug: `/debug/cell`, `/debug/continue`, `/debug/stepOver`, `/debug/stop`
- Viewers: `/viewer/variables/open`, `/viewer/data/open`, `/viewer/output/open`
- UI: open the `Data Bridge` control center when interactive status/config is useful

Read [references/common-recipes.md](references/common-recipes.md) for task recipes.

## Recovery

- If locator lookup fails, strengthen the locator: `index` > `selection=current` > precise marker.
- If marker matches multiple cells, do not guess.
- If state is stale, re-read `/status` or `/context`.
- If bridge mutation or execution fails, diagnose bridge first. Do not switch paths silently.
- `kernel/shutdown` is currently unsupported.

Read:

- [references/notebook-identity.md](references/notebook-identity.md)
- [references/state-model.md](references/state-model.md)
- [references/debug-and-recovery.md](references/debug-and-recovery.md)
- [references/api-cheatsheet.md](references/api-cheatsheet.md)
- [references/limitations.md](references/limitations.md)

## Install

If bridge features are missing:

1. Read [install.md](install.md)
2. Check with `scripts/bridgectl.exe -check-extension -extension-id local.vscode-data-bridge`
3. After user approval, install with `scripts/bridgectl.exe -install-extension ..\\assets\\vscode-data-bridge\\vscode-data-bridge-0.0.1.vsix`
