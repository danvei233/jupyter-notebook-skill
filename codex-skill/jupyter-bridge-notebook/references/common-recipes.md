# Common Recipes

## Default Preference

1. Prefer MCP tools backed by the local Data Bridge.
2. Use the installed `scripts/bridgectl(.exe)` only when MCP is unavailable or when low-level troubleshooting is needed.
3. Do not silently fall back to non-bridge notebook editing or execution.
4. Do not spend normal notebook turns teaching or restating HTTP route syntax unless the task is explicitly about bridge diagnostics.

## Read Full Context

Only do this for high-risk steps, not as the default notebook preflight.

1. Call `bridge_get_status`
2. Call `bridge_get_compliance`
3. Call `bridge_get_context`
4. Inspect notebook `uri`, `identity.versionToken`, selection, cells, execution state, and summaries
5. Choose the next mutation or execution step
6. If MCP is unavailable, use the diagnostics appendix and the equivalent CLI fallback reads

## Diagnostics Only

Use these only when the task is explicitly about bridge implementation, tool exposure, or transport debugging:

1. `bridge_get_capabilities`
2. `bridge_get_commands`
3. extension README or extension source

Do not use them as notebook-task preflight.

## Read Light State

1. Call `bridge_get_status_brief`
2. Confirm notebook `uri`, selection, `versionToken`, busy/idle, and server
3. Continue with the smallest safe mutation or workflow call
4. Escalate to full context only if identity, kernel, or locator risk is unclear
5. If MCP is unavailable, use the diagnostics appendix and the equivalent CLI fallback read
6. Do not follow this with `bridge_get_compliance` or `bridge_get_context` unless something is actually ambiguous

## Open or Switch Notebook In Current Window

1. If the user names a specific notebook and interactive work is required, open it with `bridge_post_notebook_open`
2. Prefer `path` for a local workspace file; use `createIfMissing=true` only when creating a new notebook is part of the task
3. After opening, re-read `bridge_get_status_brief` and confirm the active notebook `uri` now matches the intended file
4. If switching notebooks would disrupt the user's current window context, do not do it silently
5. If the notebook appears to belong to a different VS Code window and the user has not explicitly allowed disruption, stop and ask them to open it in the Codex window instead
6. Only if the user clearly permits it, use `bridge_post_notebook_close_editor` / `bridge_post_notebook_open` to replace the current notebook in the Codex window

## Select a Bridge Server

1. Call `bridge_list_servers` when multiple VS Code windows or notebooks may be open
2. If auto-selection is ambiguous, call `bridge_set_active_server`
3. Keep the override only as long as needed
4. Call `bridge_clear_active_server` to return to automatic matching
5. Use `GET /servers` only in CLI fallback mode

## Temporary Request Bodies

1. Use inline `-body` only for short, single-line, low-risk JSON.
2. For multi-line source, markdown, longer code cells, or larger request payloads, default to `bridgectl -body-file`.
3. Write those temporary JSON files under `./tmp/bridgebody/`.
4. Do not scatter `bridge_body_*.json` files in the workspace root.
5. Reuse or clean temporary files when the step is complete.

For raw CLI examples, use the diagnostics appendix instead of teaching them in the normal notebook path.

## Update a Specific Cell

1. If notebook identity is already stable, skip the full conservative chain
2. Read the target cell with `bridge_get_cell` and keep its `readToken`
3. Modify with `bridge_post_cell_update`, passing that `readToken`
4. If the bridge reports a stale-read error, re-read the cell before regenerating the update
5. Re-read only if you need confirmation for follow-up generation
6. Do not rewrite the `.ipynb` file directly if the bridge mutation succeeded
7. If MCP is unavailable, fall back to `GET /cell` and `POST /cell/update`

## Insert Markdown and Code Structure

1. Choose the notebook template from `structure-rules.md`
2. Prefer `bridge_post_cell_batch` when adding a small stage with multiple markdown/code cells
3. Insert or move code cells so each step is isolated
4. Re-check order with `bridge_get_cells` only when ordering is ambiguous
5. Keep long workflows split across multiple code cells; do not collapse the whole analysis into one generator script
6. Let `cell.batch` stay transactional by default; only switch to `bestEffort` when partial success is intentionally acceptable
7. Default batch size is one stage, usually 2-4 related cells; do not dump an entire teaching notebook in one batch
8. In batch payloads, each operation should normally include `op`; for pure new-cell payloads without a locator, `append` can be inferred, but do not rely on that when `insert` or `update` is what you really mean

## Build A Notebook Incrementally

1. Start with only the title, setup/imports, and the first real analysis stage
2. Run the setup cell immediately
3. Confirm environment, fonts, data access, and notebook state
4. Add the next small block of markdown and code cells, usually 2-4 related cells at a time
5. Run only the new stage or its direct prerequisite cells
6. Inspect `bridge_get_output_summary` first; deep-read `bridge_get_output` only if needed
7. Add conclusions only after the supporting outputs already exist
8. Do not default to `bridge_post_run_all` for a fresh notebook build
9. Do not burn time reading README, extension source, or command catalogs during a normal build unless the bridge behaves unexpectedly
10. If the notebook kernel is already available, do not pre-run the same analysis in shell-side `python` / `py`; keep shell experiments for explicit diagnostics only

## Prepare Plotting Style

1. Add one dedicated plotting-style setup cell before the main visualization section
2. Configure `matplotlib` for `Times New Roman` English text and `SimSun` Chinese text
3. Enable UTF-8-safe Chinese rendering and set `plt.rcParams["axes.unicode_minus"] = False`
4. Apply line width `1.5` to all axes spines
5. Make the figure title, axis titles, and tick labels bold
6. Reuse the shared helper instead of redefining inconsistent styles in later chart cells
7. Do not create the first real chart until the plotting-style setup cell exists and has been run
8. After plotting, call the shared style helper on every chart axis

## Run a Specific Cell Safely

1. Confirm notebook identity with `bridge_get_status_brief`
2. If needed, select the target cell with `bridge_post_cell_select`
3. Run `bridge_post_run_cell` or `bridge_post_run_current`
4. Inspect `bridge_get_execution_state`
5. Confirm outputs with `bridge_get_output_summary`
6. If `completionObserved=false` or `outputObserved=false`, diagnose the bridge path first instead of switching to `nbclient` or a Python writeback flow
7. Prefer `bridge_get_execution_state` with `waitFor=completion|output|stable` plus `timeoutMs` for long-running work; `idle` is only a legacy alias of `stable`
8. Do not hand-roll fixed-interval sleep loops when `waitFor` can express the real stopping condition
9. If one blocking call is simpler than a separate await/read cycle, pass `block=true` with `timeoutMs` directly to `bridge_post_run_cell` or `bridge_post_run_current`

## Final Full Pass

1. Prefer this only after the notebook has already been validated stage by stage
2. Use `bridge_post_run_all` only when the user asked for it or when a final integration pass is specifically needed
3. If a full pass fails, return to the smallest failing stage instead of repeatedly rerunning the whole notebook

## Update And Run In One Step

1. Confirm notebook identity with `bridge_get_status_brief`
2. Read the target cell first and keep its `readToken`
3. Use `bridge_post_workflow_update_and_run` with that `readToken`
4. Default to `observe: "outputSummary"` only when the next step depends on the result
5. Leave `includeOutput` false unless you truly need the full output payload
6. If you want the workflow call itself to wait, pass `block=true` with `timeoutMs`; otherwise keep it non-blocking and inspect execution/output separately
6. Confirm `mutationApplied`, `executionAccepted`, and, when requested, `hasOutputs`

## Insert And Run In One Step

1. Confirm notebook identity with `bridge_get_status_brief`
2. Use `bridge_post_workflow_insert_and_run`
3. Default to light observation and only request full outputs when the result must be read immediately
4. Confirm `mutationApplied`, `executionAccepted`, and, when requested, `hasOutputs`

## Clear and Re-run

1. Clear target outputs with `bridge_post_cell_clear_outputs`
2. Run the target cell
3. Read `bridge_get_execution_state`
4. Read `bridge_get_output_summary`

## High-Risk Full Checks

Use the full conservative chain when:

1. locator resolution depends on `marker`
2. multiple windows or multiple bridge servers may be involved
3. kernel lifecycle commands are involved
4. debugging is involved
5. notebook identity may have drifted

Then use:

1. `bridge_get_status`
2. `bridge_get_compliance`
3. `bridge_get_context`
4. only then mutate or run

## Prepare a Notebook for Debugging

1. Split the flow into smaller cells
2. Keep reproduction, state checks, and verification separate
3. Start with `bridge_post_debug_cell`
4. Use `bridge_post_debug_continue`, `bridge_post_debug_step_over`, `bridge_post_debug_stop` as needed

## Open Analysis Tools

- Variables: `bridge_post_viewer_variables_open`
- Data Viewer: `bridge_post_viewer_data_open`
- Output panel: `bridge_post_viewer_output_open`

## Forbidden Silent Fallbacks

- Do not generate a temporary Python script just to synthesize notebook structure when bridge cell CRUD is available.
- Do not execute a notebook via `nbclient` and write the outputs back as if that were equivalent to VS Code notebook execution.
- Do not pre-run the same notebook analysis in shell-side `python` / `py` when the notebook kernel is available.
- Do not poll the `.ipynb` file as proof of success if the requested behavior was interactive notebook execution.
- Do not build an entire notebook in one shot and then rely on `bridge_post_run_all` as the first real validation step.
- Do not use `bridge_post_cell_batch` to inject a full notebook worth of code and markdown in one pass when stage-by-stage batches would work.
- If you must leave bridge mode, say so explicitly and get user approval first.
