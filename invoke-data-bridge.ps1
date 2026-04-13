param(
    [string]$Command = "",

    [object[]]$Args = @(),

    [string]$Path = "/execute",

    [string]$Method = "POST",

    [object]$Body = $null,

    [string]$BaseUrl = "http://127.0.0.1:8765",

    [string]$Token = ""
)

$headers = @{}
if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
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

$uri = if ($Path.StartsWith("http")) { $Path } else { "$BaseUrl$Path" }

if ($Method -eq "GET") {
    Invoke-RestMethod `
        -Method Get `
        -Uri $uri `
        -Headers $headers
}
else {
    $jsonBody = $Body | ConvertTo-Json -Depth 12
    Invoke-RestMethod `
        -Method $Method `
        -Uri $uri `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $jsonBody
}
