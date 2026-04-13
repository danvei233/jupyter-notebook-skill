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

### Required behavior

1. Build the notebook in stages, not in one giant pass.
2. Run setup/import cells before later stages depend on them.
3. Add one analytical block at a time.
4. Run only the new block or directly dependent cells.
5. Inspect `/execution/state` and `/output` before moving on.
6. Add or revise conclusions after outputs exist.

### Avoid

- dumping title, markdown narrative, all code, and final conclusions in one pass
- using `/run/all` as the first meaningful validation step
- pre-writing conclusions that depend on metrics, plots, or model results not yet observed

### When `/run/all` is acceptable

- the user explicitly asks for it
- the notebook has already been validated incrementally and you are doing a final integration pass

## `blank`

Use this only when the user explicitly wants Codex's native freeform approach.

### Behavior

- keep bridge-first mutation/execution rules
- keep notebook identity/state checks
- otherwise allow normal judgment about writing order, structure, and execution order

### Still avoid

- silent fallback away from bridge
- false claims about outputs or execution state
