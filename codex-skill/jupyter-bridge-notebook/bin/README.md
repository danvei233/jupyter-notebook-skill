Release bundles place prebuilt platform binaries under this directory.

Expected layout:

- `bin/windows-amd64/bridgectl.exe`
- `bin/windows-amd64/jupyterbridge-mcp.exe`
- `bin/linux-amd64/bridgectl`
- `bin/linux-amd64/jupyterbridge-mcp`

The installer copies the matching platform binaries into the installed skill `scripts/` directory.
