# Install

This skill depends on the VS Code extension `local.vscode-data-bridge`.

## When To Use This File

Read this file when:

- bridge calls fail
- `bridge_get_status_brief` is unavailable
- notebook bridge commands are missing
- the skill is being migrated to another machine

## Standard Install Flow

1. Detect whether the extension is installed:
   - run `scripts/bridgectl.exe -check-extension -extension-id local.vscode-data-bridge`
2. If it is already installed:
   - keep using the existing bridge
3. If it is missing:
   - ask the user for approval to install the extension
4. After approval:
   - run `scripts/bridgectl.exe -install-extension ..\\assets\\vscode-data-bridge\\vscode-data-bridge-0.0.1.vsix`
5. After install:
   - ask the user to run `Developer: Reload Window`
   - then verify with `bridge_get_status_brief`
   - then verify with `bridge_get_compliance`

## MCP-First Verification

When the client supports MCP, verify the bridge in this order:

1. `bridge_get_status_brief`
2. `bridge_get_compliance`
3. `bridge_get_active_server`

Use `scripts/bridgectl.exe` only when MCP is not yet configured or when low-level troubleshooting is needed.

## Bundled Migration Assets

The skill includes a portable copy of the bridge extension under `assets/vscode-data-bridge/`:

- `vscode-data-bridge-0.0.1.vsix`
- `extension.js`
- `package.json`
- `README.md`

The skill includes `scripts/bridgectl.exe` as the preferred local bridge client and extension installer.
The skill also includes `scripts/jupyterbridge-mcp.exe` as the preferred bundled stdio MCP server for clients that need a local MCP executable.

Use these bundled files as the preferred migration source instead of relying on an external path.

`bridgectl.exe` auto-detects `code-insiders` or `code` from PATH and can also use `VSCODE_CLI` or `CODE_CLI`.

## Consent Rule

Do not install the extension silently. Ask the user first. Once the user agrees, run the bundled `bridgectl.exe` install command automatically.
