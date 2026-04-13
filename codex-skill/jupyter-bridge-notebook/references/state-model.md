# State Model

## Notebook and Kernel States

Treat notebook work as stateful. Before acting, classify the state into one of these buckets:

- `ready`: active notebook exists and the bridge reports usable notebook context
- `running-or-pending`: recent execution was requested or results are still changing
- `idle`: notebook is available and no recent execution action implies activity
- `unknown`: bridge cannot observe busy/idle reliably
- `uninitialized`: notebook or kernel context is not ready enough to run safely
- `user-interrupted-likely`: the previous action was interrupted, stopped, or the user reported interruption
- `no-active-notebook`: there is no active notebook editor

## How to Infer State

Read:

- `GET /status` for a quick check
- `GET /execution/state` for recent execution intent
- `GET /debug/state` when debugging is involved
- `GET /kernel/state` for kernel-related status

Pay attention to:

- `hasActiveNotebook`
- `selection`
- `lastExecution`
- `lastDebug`
- `lastKernelAction`
- `unknownBusyState`

## Default Actions by State

- `ready`: proceed
- `running-or-pending`: avoid extra bulk execution; prefer observation first
- `idle`: safe to run a targeted action
- `unknown`: prefer minimal targeted actions over `run all`
- `uninitialized`: re-check target notebook, kernel selection, and notebook focus
- `user-interrupted-likely`: inspect and choose restart, rerun, or debug
- `no-active-notebook`: recover focus before acting

## User Interruption

Treat these as strong signals:

- the user says they interrupted execution
- debug stop was requested
- interrupt/restart happened recently

When likely interrupted:

1. inspect state
2. inspect outputs
3. decide between rerun, debug, or restart
