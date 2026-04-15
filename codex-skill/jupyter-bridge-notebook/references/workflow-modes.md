# Workflow Modes

## Default

Default mode is `streaming-analysis`.

Choose `blank` only when the user explicitly wants no workflow constraints.

## `streaming-analysis`

Use this mode for most notebook analysis, data science, debugging, and exploratory work.

### Intent

Make notebook work feel like real analysis:

- write a little
- run a little
- inspect real outputs
- adjust the notebook
- continue
- write conclusions from observed results

This is smart streaming, not mechanical over-checking.

### Required behavior

1. Build the notebook in stages, not in one giant pass.
2. Run setup/import cells before later stages depend on them.
3. Add one analytical block at a time, usually 2-4 related cells per stage.
4. Run only the new block or directly dependent cells.
5. Default to `bridge_get_status_brief`, `bridge_post_workflow_*`, and `bridge_get_output_summary` for normal stages.
6. Escalate to full `/status` + `/compliance` + `/context` only for high-risk steps.
7. Add or revise conclusions after outputs exist.
8. Skip README, skill reference, extension source, command catalog, and capability reads unless bridge behavior is unclear.
9. Do not pre-run the same notebook analysis in shell-side `python` / `py` if the notebook kernel is already available.

### Avoid

- dumping title, markdown narrative, all code, and final conclusions in one pass
- using `/run/all` as the first meaningful validation step
- pre-writing conclusions that depend on metrics, plots, or model results not yet observed
- rereading full context before every low-risk mutation

### When `/run/all` is acceptable

- the user explicitly asks for it
- the notebook has already been validated incrementally and you are doing a final integration pass

## `blank`

Use this only when the user explicitly wants Codex's native freeform approach.

### Behavior

- keep bridge-first mutation/execution rules
- keep notebook identity/state checks
- prefer light checks such as `bridge_get_status_brief` unless risk is high
- otherwise allow normal judgment about writing order, structure, and execution order

### Still avoid

- silent fallback away from bridge
- false claims about outputs or execution state

## When To Avoid Heavy Notebook Workflow

Prefer `blank` mode or file-only notebook generation when:

- the user only wants a static notebook template
- the task is mostly markdown editing or title cleanup
- the target is not the active notebook
- live kernel state and live outputs are irrelevant
