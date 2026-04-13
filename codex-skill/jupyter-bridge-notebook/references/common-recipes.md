# Common Recipes

## Read Full Context

1. Call `GET /context`
2. Inspect notebook `uri`, selection, cells, execution state, and summaries
3. Choose the next mutation or execution step

## Update a Specific Cell

1. Confirm notebook identity with `GET /status`
2. Read the target cell with `GET /cell`
3. Modify with `POST /cell/update`
4. Re-read the cell or notebook summary if needed

## Insert Markdown and Code Structure

1. Choose the notebook template from `structure-rules.md`
2. Insert markdown heading cells with `/cell/insert`
3. Insert or move code cells so each step is isolated
4. Re-check order with `GET /cells`

## Run a Specific Cell Safely

1. Confirm notebook identity and selection
2. If needed, select the target cell with `/cell/select`
3. Run `/run/cell` or `/run/current`
4. Inspect `/output` or `/execution/state`

## Clear and Re-run

1. Clear target outputs with `/cell/clearOutputs`
2. Run the target cell
3. Read `/output`

## Prepare a Notebook for Debugging

1. Split the flow into smaller cells
2. Keep reproduction, state checks, and verification separate
3. Start with `/debug/cell`
4. Use `/debug/continue`, `/debug/stepOver`, `/debug/stop` as needed

## Open Analysis Tools

- Variables: `POST /viewer/variables/open`
- Data Viewer: `POST /viewer/data/open`
- Output panel: `POST /viewer/output/open`
