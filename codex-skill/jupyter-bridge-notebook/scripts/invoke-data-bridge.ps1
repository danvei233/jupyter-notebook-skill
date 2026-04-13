param(
    [string]$Command = "",
    [object[]]$Args = @(),
    [string]$Path = "/execute",
    [string]$Method = "POST",
    [object]$Body = $null,
    [string]$BaseUrl = "",
    [string]$Token = ""
)

$headers = @{}
if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
}

$resolvedBaseUrl = if ($BaseUrl) {
    $BaseUrl
}
elseif ($env:DATA_BRIDGE_BASE_URL) {
    $env:DATA_BRIDGE_BASE_URL
}
elseif ($env:VSCODE_DATA_BRIDGE_BASE_URL) {
    $env:VSCODE_DATA_BRIDGE_BASE_URL
}
else {
    "http://127.0.0.1:8765"
}

if ($Body -eq $null) {
    if ($Command) {
        $Body = @{
            command = $Command
            args    = $Args
        }
    }
    else {
        $Body = @{}
    }
}

$uri = if ($Path.StartsWith("http")) { $Path } else { "$resolvedBaseUrl$Path" }

if ($Method -eq "GET") {
    Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
}
else {
    $jsonBody = $Body | ConvertTo-Json -Depth 12
    Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body $jsonBody
}
