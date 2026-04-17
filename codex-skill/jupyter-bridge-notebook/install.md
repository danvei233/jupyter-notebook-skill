# Install

This skill is meant to be installed through the `bridgectl` installer rather than by hand-copying files one by one.

## When To Read This File

Read this file when:

- the skill is not installed yet
- bridge tools are missing
- the MCP server binary is missing
- the VS Code extension is missing
- Codex or Claude Desktop still has no `jupyter-bridge` MCP entry

## What The One-Click Installer Does

After user approval, the installer should do all of this automatically:

1. copy the skill into the user's Codex skill directory
2. place the current platform binaries into the installed skill `scripts/` folder:
   - `scripts/bridgectl(.exe)`
   - `scripts/jupyterbridge-mcp(.exe)`
3. ensure the bundled VS Code extension VSIX exists, building it locally if the source checkout does not already include one
4. install `local.vscode-data-bridge` through the VS Code CLI
5. detect supported MCP clients and update their config files:
   - Codex: `config.toml`
   - Claude Desktop: `claude_desktop_config.json`

Do not silently run this flow. Explain it first and get user approval.

## Standard Install Commands

From a source checkout of the repository:

```text
go run ./cmd/bridgectl -install-skill . -configure-mcp auto
```

From an extracted release bundle:

```text
bin/<os-arch>/bridgectl(.exe) -install-skill . -configure-mcp auto
```

Optional flags:

- `-skill-dest <path>`
  Use a non-default install location instead of `$CODEX_HOME/skills/jupyter-bridge-notebook`.
- `-configure-mcp auto|codex|claude-desktop|all|none`
  Control which client configs are updated.
- `-skip-extension`
  Skip VS Code extension install.
- `-skip-config`
  Skip MCP config updates.

## Default Install Targets

By default the installer writes:

- Codex skill:
  - `$CODEX_HOME/skills/jupyter-bridge-notebook`
  - or `~/.codex/skills/jupyter-bridge-notebook` if `CODEX_HOME` is unset
- Codex MCP config:
  - `$CODEX_HOME/config.toml`
  - or `~/.codex/config.toml`
- Claude Desktop MCP config:
  - Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`

## Verification Order

After install and reload, verify in this order:

1. `bridge_get_status_brief`
2. `bridge_get_compliance`
3. `bridge_get_active_server`

Use low-level CLI checks only when MCP still is not visible.

## Source Repo vs Release Bundle

The source repository is kept clean and does not need to track platform binaries.

- In the source repo, the installer can build the current platform binaries locally from `cmd/`.
- In a release bundle, prebuilt platform binaries are provided under `bin/<os-arch>/`.

The installed skill always ends up with platform-specific binaries materialized into its `scripts/` directory so that normal skill usage can refer to stable local paths.
