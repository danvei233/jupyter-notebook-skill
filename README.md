# Jupyter Bridge Notebook

Bridge-first Jupyter notebook tooling for VS Code, paired with a Codex skill for fast `.ipynb` operations and notebook structuring.

This project bundles:

- a local VS Code extension: `local.vscode-data-bridge`
- a Codex skill: `jupyter-bridge-notebook`
- PowerShell helpers for calling the bridge
- a portable VSIX for installation and migration

## What It Does

- Read notebook state, context, cells, outputs, and execution metadata
- Insert, update, move, duplicate, delete, and select notebook cells
- Run current, targeted, ranged, or full-notebook execution flows
- Open Variables, Data Viewer, and Jupyter output panels
- Support notebook-oriented debugging commands
- Help Codex structure notebooks into well-scoped markdown and code cells instead of oversized single-cell scripts

## Project Layout

```text
jupyter-bridge-notebook-project/
├─ README.md
├─ .gitignore
├─ invoke-data-bridge.ps1
├─ bridge-extension/
│  ├─ extension.js
│  ├─ package.json
│  ├─ package-lock.json
│  ├─ README.md
│  ├─ vscode-data-bridge-0.0.1.vsix
│  └─ .vscode/
└─ codex-skill/
   └─ jupyter-bridge-notebook/
      ├─ SKILL.md
      ├─ install.md
      ├─ agents/openai.yaml
      ├─ scripts/
      ├─ references/
      └─ assets/vscode-data-bridge/
```

## Install The VS Code Extension

Install the bundled VSIX:

```powershell
& "C:\Users\丁薇\AppData\Local\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd" --install-extension ".\bridge-extension\vscode-data-bridge-0.0.1.vsix" --force
```

Then reload VS Code:

```text
Developer: Reload Window
```

## Use The Bridge

Check bridge status:

```powershell
.\invoke-data-bridge.ps1 -Method GET -Path /status
```

Read full notebook context:

```powershell
.\invoke-data-bridge.ps1 -Method GET -Path /context
```

Run the current notebook cell:

```powershell
.\invoke-data-bridge.ps1 -Method POST -Path /run/current
```

Run a specific cell:

```powershell
.\invoke-data-bridge.ps1 -Method POST -Path /run/cell -Body @{ index = 1 }
```

Clear outputs for one cell:

```powershell
.\invoke-data-bridge.ps1 -Method POST -Path /cell/clearOutputs -Body @{ index = 1 }
```

## Use The Codex Skill

The bundled skill lives under:

```text
.\codex-skill\jupyter-bridge-notebook
```

If you want Codex to auto-discover it, copy that folder into:

```text
%CODEX_HOME%\skills\
```

or keep it as a portable project asset and reference it directly.

The skill is designed to:

- verify the target notebook before mutation or execution
- inspect notebook and kernel state before acting
- prefer bridge operations over direct `.ipynb` file edits
- structure notebooks into task-oriented cells with sensible markdown headings

## GitHub Notes

- `node_modules` is intentionally excluded from this packaged folder
- the portable VSIX is included so the extension can be installed without rebuilding
- the skill also includes a copy of the extension assets for migration
"# jupyter-notebook-skill" 
