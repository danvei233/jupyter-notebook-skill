param(
    [switch]$Yes,
    [string]$CodeCmd = "C:\Users\丁薇\AppData\Local\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd",
    [string]$VsixPath = ""
)

$skillRoot = Split-Path -Parent $PSScriptRoot

if (-not $VsixPath) {
    $VsixPath = Join-Path $skillRoot "assets\vscode-data-bridge\vscode-data-bridge-0.0.1.vsix"
}

if (-not (Test-Path $CodeCmd)) {
    throw "VS Code Insiders CLI not found at $CodeCmd"
}

if (-not (Test-Path $VsixPath)) {
    throw "Bundled VSIX not found at $VsixPath"
}

if (-not $Yes) {
    throw "Installation requires explicit approval. Re-run with -Yes after the user agrees."
}

& $CodeCmd --install-extension $VsixPath --force
