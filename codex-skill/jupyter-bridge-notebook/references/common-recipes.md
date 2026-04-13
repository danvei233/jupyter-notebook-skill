# Common Recipes

## Read Full Context

1. Call `GET /status`
2. Call `GET /compliance`
3. Call `GET /context`
4. Inspect notebook `uri`, `identity.versionToken`, selection, cells, execution state, and summaries
5. Choose the next mutation or execution step

## Read Light State

1. Call `GET /status/brief`
2. Confirm notebook `uri`, selection, `versionToken`, busy/idle, and server
3. Continue with the smallest safe mutation or workflow call
4. Escalate to full `/context` only if identity, kernel, or locator risk is unclear

## Temporary Request Bodies

1. Use inline `-body` only for short, single-line, low-risk JSON.
2. For multi-line source, markdown, longer code cells, or larger request payloads, default to `bridgectl -body-file`.
3. Write those temporary JSON files under `./tmp/bridgebody/`.
4. Do not scatter `bridge_body_*.json` files in the workspace root.
5. Reuse or clean temporary files when the step is complete.

## Correct CLI Shape

Always use this command shape:

1. `bridgectl.exe -method GET -path /status/brief`
2. `bridgectl.exe -method POST -path /cell/update -body-file ./tmp/bridgebody/update.json`
3. `bridgectl.exe -method POST -path /workflow/updateAndRun -body-file ./tmp/bridgebody/workflow.json`

Rules:

1. Always include `-method`
2. Always include `-path`
3. Use routes like `/status/brief`, `/cell/update`, `/workflow/updateAndRun`
4. Do not invent positional command forms
5. For multi-line JSON, prefer `-body-file`

## Update a Specific Cell

1. If notebook identity is already stable, skip the full conservative chain
2. Read the target cell with `GET /cell` only if you need current source
3. Modify with `POST /cell/update`
4. Re-read only if you need confirmation for follow-up generation
5. Do not rewrite the `.ipynb` file directly if the bridge mutation succeeded

## Insert Markdown and Code Structure

1. Choose the notebook template from `structure-rules.md`
2. Prefer `/cell/batch` when adding a small stage with multiple markdown/code cells
3. Insert or move code cells so each step is isolated
4. Re-check order with `GET /cells` only when ordering is ambiguous
5. Keep long workflows split across multiple code cells; do not collapse the whole analysis into one generator script

## Build A Notebook Incrementally

1. Start with only the title, setup/imports, and the first real analysis stage
2. Run the setup cell immediately
3. Confirm environment, fonts, data access, and notebook state
4. Add the next small block of markdown and code cells, usually 2-4 related cells at a time
5. Run only the new stage or its direct prerequisite cells
6. Inspect `/output/summary` first; deep-read `/output` only if needed
7. Add conclusions only after the supporting outputs already exist
8. Do not default to `/run/all` for a fresh notebook build

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

1. Confirm notebook identity with `GET /status/brief`
2. If needed, select the target cell with `/cell/select`
3. Run `/run/cell` or `/run/current`
4. Inspect `GET /execution/state`
5. Confirm outputs with `GET /output/summary`
6. If `completionObserved=false` or `outputObserved=false`, diagnose the bridge path first instead of switching to `nbclient` or a Python writeback flow

## Final Full Pass

1. Prefer this only after the notebook has already been validated stage by stage
2. Use `/run/all` only when the user asked for it or when a final integration pass is specifically needed
3. If a full pass fails, return to the smallest failing stage instead of repeatedly rerunning the whole notebook

## Update And Run In One Step

1. Confirm notebook identity with `GET /status/brief`
2. Use `POST /workflow/updateAndRun`
3. Default to `observe: "outputSummary"` only when the next step depends on the result
4. Leave `includeOutput` false unless you truly need the full output payload
5. Confirm `mutationApplied`, `executionAccepted`, and, when requested, `hasOutputs`

## Insert And Run In One Step

1. Confirm notebook identity with `GET /status/brief`
2. Use `POST /workflow/insertAndRun`
3. Default to light observation and only request full outputs when the result must be read immediately
4. Confirm `mutationApplied`, `executionAccepted`, and, when requested, `hasOutputs`

## Clear and Re-run

1. Clear target outputs with `/cell/clearOutputs`
2. Run the target cell
3. Read `/execution/state`
4. Read `/output/summary`

## High-Risk Full Checks

Use the full conservative chain when:

1. locator resolution depends on `marker`
2. multiple windows or multiple bridge servers may be involved
3. kernel lifecycle commands are involved
4. debugging is involved
5. notebook identity may have drifted

Then use:

1. `GET /status`
2. `GET /compliance`
3. `GET /context`
4. only then mutate or run

## Prepare a Notebook for Debugging

1. Split the flow into smaller cells
2. Keep reproduction, state checks, and verification separate
3. Start with `/debug/cell`
4. Use `/debug/continue`, `/debug/stepOver`, `/debug/stop` as needed

## Open Analysis Tools

- Variables: `POST /viewer/variables/open`
- Data Viewer: `POST /viewer/data/open`
- Output panel: `POST /viewer/output/open`

## Forbidden Silent Fallbacks

- Do not generate a temporary Python script just to synthesize notebook structure when bridge cell CRUD is available.
- Do not execute a notebook via `nbclient` and write the outputs back as if that were equivalent to VS Code notebook execution.
- Do not poll the `.ipynb` file as proof of success if the requested behavior was interactive notebook execution.
- Do not build an entire notebook in one shot and then rely on `/run/all` as the first real validation step.
- If you must leave bridge mode, say so explicitly and get user approval first.
