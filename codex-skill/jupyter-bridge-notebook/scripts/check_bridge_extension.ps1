param(
    [string]$CodeCmd = "",
    [string]$ExtensionId = "local.vscode-data-bridge"
)

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

$resolvedCodeCmd = Resolve-CodeCli -Preferred $CodeCmd
$installed = & $resolvedCodeCmd --list-extensions --show-versions | Select-String $ExtensionId

if ($installed) {
    [pscustomobject]@{
        installed = $true
        codeCli   = $resolvedCodeCmd
        extension = $installed.ToString().Trim()
    }
}
else {
    [pscustomobject]@{
        installed = $false
        codeCli   = $resolvedCodeCmd
        extension = $ExtensionId
    }
}
