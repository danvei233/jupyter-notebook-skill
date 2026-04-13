# Limitations

## Current Bridge Boundaries

- The bridge operates on the current active notebook editor.
- Notebook identity must be re-checked after window reloads, notebook switches, or editor closure.
- Kernel busy/idle state is partially observable; `unknownBusyState` should be treated cautiously.
- `POST /kernel/shutdown` is currently unsupported.
- Some VS Code actions are accepted asynchronously, so a successful execution request does not guarantee final output is already available.

## Practical Implications

- Prefer targeted execution over `run all` when state is uncertain.
- Re-read `/status`, `/context`, or `/output` after important operations.
- Do not assume old cell selections remain valid across reloads or focus changes.
