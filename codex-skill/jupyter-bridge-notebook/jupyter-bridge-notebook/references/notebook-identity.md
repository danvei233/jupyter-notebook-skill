# Notebook Identity

## Goal

Make sure the notebook being modified or executed is the intended one.

## Identity Rules

Prefer these identifiers in order:

1. Notebook `uri`
2. Active notebook editor presence
3. Current selection and visible range
4. User-provided filename or notebook title

## Required Check Before Mutation

Read `GET /status` or `GET /context` and confirm:

- `notebook.hasActiveNotebook == true`
- the notebook `uri` matches the user's intended notebook if one was named
- the current selection is compatible with the requested action

## Multi-Notebook Situations

If multiple notebooks may be open:

- never assume the active editor is correct without checking the `uri`
- if the user names a notebook and the active `uri` does not match, pause and reconcile
- if the user only says "this notebook", prefer the current active notebook after verification

## Reloads, Window Switches, and Closed Editors

If the user changed windows, reloaded VS Code, or closed an editor:

- re-read `GET /status`
- if there is no active notebook, do not attempt cell actions
- recover focus or ask the user to restore the notebook when identity cannot be re-established

## Cell Targeting Guidance

Use these locators in descending order of confidence:

1. `index`
2. `selection=current`
3. exact `cellId`
4. precise `marker`

Do not guess when a marker matches multiple cells.
