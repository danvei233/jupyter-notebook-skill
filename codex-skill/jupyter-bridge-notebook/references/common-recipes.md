# Common Recipes

## Read Full Context

1. Call `GET /status`
2. Call `GET /compliance`
3. Call `GET /context`
4. Inspect notebook `uri`, `identity.versionToken`, selection, cells, execution state, and summaries
5. Choose the next mutation or execution step

## Temporary Request Bodies

1. Use inline `-body` only for short, single-line, low-risk JSON.
2. For multi-line source, markdown, longer code cells, or larger request payloads, default to `bridgectl -body-file`.
3. Write those temporary JSON files under `./tmp/bridgebody/`.
4. Do not scatter `bridge_body_*.json` files in the workspace root.
5. Reuse or clean temporary files when the step is complete.

## Update a Specific Cell

1. Confirm notebook identity with `GET /status`
2. Confirm bridge mode with `GET /compliance`
3. Read the target cell with `GET /cell`
4. Modify with `POST /cell/update`
5. Re-read the cell with `GET /cell`
6. Do not rewrite the `.ipynb` file directly if the bridge mutation succeeded

## Insert Markdown and Code Structure

1. Choose the notebook template from `structure-rules.md`
2. Insert markdown heading cells with `/cell/insert`
3. Insert or move code cells so each step is isolated
4. Re-check order with `GET /cells`
5. Keep long workflows split across multiple code cells; do not collapse the whole analysis into one generator script

## Build A Notebook Incrementally

1. Start with only the title, setup/imports, and the first real analysis stage
2. Run the setup cell immediately
3. Confirm environment, fonts, data access, and notebook state
4. Add the next small block of markdown and code cells
5. Run only the new stage or its direct prerequisite cells
6. Inspect `/execution/state` and `/output` before adding more
7. Add conclusions only after the supporting outputs already exist
8. Do not default to `/run/all` for a fresh notebook build

## Prepare Plotting Style

1. Add one dedicated plotting-style setup cell before the main visualization section
2. Configure `matplotlib` for `Times New Roman` English text and `SimSun` Chinese text
3. Enable UTF-8-safe Chinese rendering and set `plt.rcParams["axes.unicode_minus"] = False`
4. Apply line width `1.5` to all axes spines
5. Make the figure title, axis titles, and tick labels bold
6. Reuse the shared helper instead of redefining inconsistent styles in later chart cells

## Run a Specific Cell Safely

1. Confirm notebook identity with `GET /status`
2. Confirm bridge mode with `GET /compliance`
3. If needed, select the target cell with `/cell/select`
4. Run `/run/cell` or `/run/current`
5. Inspect `GET /execution/state`
6. Confirm outputs with `GET /output`
7. If `completionObserved=false` or `outputObserved=false`, diagnose the bridge path first instead of switching to `nbclient` or a Python writeback flow

## Final Full Pass

1. Prefer this only after the notebook has already been validated stage by stage
2. Use `/run/all` only when the user asked for it or when a final integration pass is specifically needed
3. If a full pass fails, return to the smallest failing stage instead of repeatedly rerunning the whole notebook

## Update And Run In One Step

1. Confirm notebook identity with `GET /status`
2. Confirm bridge mode with `GET /compliance`
3. Use `POST /workflow/updateAndRun`
4. Confirm `mutationApplied`, `executionAccepted`, `hasOutputs`

## Insert And Run In One Step

1. Confirm notebook identity with `GET /status`
2. Confirm bridge mode with `GET /compliance`
3. Use `POST /workflow/insertAndRun`
4. Confirm `mutationApplied`, `executionAccepted`, `hasOutputs`

## Clear and Re-run

1. Clear target outputs with `/cell/clearOutputs`
2. Run the target cell
3. Read `/execution/state`
4. Read `/output`

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
