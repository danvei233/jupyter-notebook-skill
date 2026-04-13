# Install

This skill depends on the VS Code extension `local.vscode-data-bridge`.

## When To Use This File

Read this file when:

- bridge calls fail
- `GET /status` is unavailable
- notebook bridge commands are missing
- the skill is being migrated to another machine

## Standard Install Flow

1. Detect whether the extension is installed:
   - run `scripts/check_bridge_extension.ps1`
2. If it is already installed:
   - keep using the existing bridge
3. If it is missing:
   - ask the user for approval to install the extension
4. After approval:
   - run `scripts/install_bridge_extension.ps1`
5. After install:
   - ask the user to run `Developer: Reload Window`
   - then verify with `GET /status`

## Bundled Migration Assets

The skill includes a portable copy of the bridge extension under `assets/vscode-data-bridge/`:

- `vscode-data-bridge-0.0.1.vsix`
- `extension.js`
- `package.json`
- `README.md`

Use these bundled files as the preferred migration source instead of relying on an external path.

The install scripts auto-detect `code-insiders` or `code` from PATH and can also use `VSCODE_CLI` or `CODE_CLI`.

## Consent Rule

Do not install the extension silently. Ask the user first. Once the user agrees, run the install script automatically.
