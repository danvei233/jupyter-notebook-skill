param(
    [switch]$Yes,
    [string]$CodeCmd = "",
    [string]$VsixPath = ""
)

$skillRoot = Split-Path -Parent $PSScriptRoot

function Resolve-CodeCli {
    param([string]$Preferred)

    $candidates = @()
    if ($Preferred) { $candidates += $Preferred }
    if ($env:VSCODE_CLI) { $candidates += $env:VSCODE_CLI }
    if ($env:CODE_CLI) { $candidates += $env:CODE_CLI }

    foreach ($name in @("code-insiders", "code")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { $candidates += $cmd.Source }
    }

    $resolved = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $resolved) {
        throw "Unable to locate a VS Code CLI. Set VSCODE_CLI or CODE_CLI, or pass -CodeCmd."
    }
    return $resolved
}

if (-not $VsixPath) {
    $VsixPath = Get-ChildItem (Join-Path $skillRoot "assets\vscode-data-bridge") -Filter *.vsix | Select-Object -First 1 -ExpandProperty FullName
}

$resolvedCodeCmd = Resolve-CodeCli -Preferred $CodeCmd

if (-not (Test-Path $VsixPath)) {
    throw "Bundled VSIX not found at $VsixPath"
}

if (-not $Yes) {
    throw "Installation requires explicit approval. Re-run with -Yes after the user agrees."
}

& $resolvedCodeCmd --install-extension $VsixPath --force
