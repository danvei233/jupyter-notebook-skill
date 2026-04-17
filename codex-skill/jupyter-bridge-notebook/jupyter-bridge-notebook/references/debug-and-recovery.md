# Debug and Recovery

## Debug Flow

Use debugging when a notebook step is hard to reason about or repeatedly failing.

1. Reduce the failing flow into smaller cells
2. Keep the minimum reproduction in one cell
3. Put environment or state inspection in separate cells
4. Start debugging with `POST /debug/cell`
5. Continue with:
   - `POST /debug/continue`
   - `POST /debug/stepOver`
   - `POST /debug/stop`

## Recovery Flow

When notebook behavior becomes unclear:

1. Re-read `GET /status`
2. Re-read `GET /execution/state`
3. Inspect outputs with `GET /output`
4. If state still looks wrong, choose one:
   - interrupt with `POST /kernel/interrupt`
   - restart with `POST /kernel/restart`
   - restart and run all with `POST /kernel/restartAndRunAll`
   - restart and run to a selected cell with `POST /kernel/restartAndRunToCell`

## After a Reload or User Switch

- do not trust old selection or cell assumptions
- confirm the notebook `uri`
- confirm the target cell again before mutating or running

## Unsupported Behavior

`POST /kernel/shutdown` is currently not a supported recovery tool. Use restart or close-editor workflows instead.
