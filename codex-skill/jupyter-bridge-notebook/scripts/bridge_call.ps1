param(
    [string]$Path = "/status",
    [string]$Method = "GET",
    [string]$Command = "",
    [object[]]$Args = @(),
    [object]$Body = $null,
    [string]$BaseUrl = "",
    [string]$Token = ""
)

$candidatePaths = @()

if ($env:JUPYTER_BRIDGE_HELPER) {
    $candidatePaths += $env:JUPYTER_BRIDGE_HELPER
}

$candidatePaths += @(
    (Join-Path $PSScriptRoot "invoke-data-bridge.ps1"),
    (Join-Path (Split-Path -Parent $PSScriptRoot) "invoke-data-bridge.ps1"),
    (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "invoke-data-bridge.ps1")
)

$bridge = $candidatePaths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $bridge) {
    throw "Bridge helper not found. Set JUPYTER_BRIDGE_HELPER or place invoke-data-bridge.ps1 near this skill."
}

if ($Body -eq $null -and $Command) {
    $Body = @{
        command = $Command
        args = $Args
    }
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $bridge `
    -Path $Path `
    -Method $Method `
    -Command $Command `
    -Args $Args `
    -Body $Body `
    -BaseUrl $BaseUrl `
    -Token $Token
