param(
    [string]$CodeCmd = "C:\Users\丁薇\AppData\Local\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd",
    [string]$ExtensionId = "local.vscode-data-bridge"
)

if (-not (Test-Path $CodeCmd)) {
    throw "VS Code Insiders CLI not found at $CodeCmd"
}

$installed = & $CodeCmd --list-extensions --show-versions | Select-String $ExtensionId

if ($installed) {
    [pscustomobject]@{
        installed = $true
        extension = $installed.ToString().Trim()
    }
}
else {
    [pscustomobject]@{
        installed = $false
        extension = $ExtensionId
    }
}
