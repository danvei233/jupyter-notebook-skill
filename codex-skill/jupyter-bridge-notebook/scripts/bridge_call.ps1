param(
    [string]$Path = "/status",
    [string]$Method = "GET",
    [string]$Command = "",
    [object[]]$Args = @(),
    [object]$Body = $null,
    [string]$BaseUrl = "http://127.0.0.1:8765",
    [string]$Token = ""
)

$bridge = "D:\sky\invoke-data-bridge.ps1"

if (-not (Test-Path $bridge)) {
    throw "Bridge helper not found at $bridge"
}

if ($Body -eq $null -and $Command) {
    $Body = @{
        command = $Command
        args = $Args
    }
}

powershell -NoProfile -ExecutionPolicy Bypass -File $bridge `
    -Path $Path `
    -Method $Method `
    -Command $Command `
    -Args $Args `
    -Body $Body `
    -BaseUrl $BaseUrl `
    -Token $Token
