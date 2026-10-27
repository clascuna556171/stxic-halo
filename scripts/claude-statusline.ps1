# Receives Claude Code's documented status-line JSON. Never reads credentials or sends requests.
$ErrorActionPreference = 'Stop'
try {
    $text = [Console]::In.ReadToEnd()
    if ($text.Length -gt 262144) { exit 0 }
    $data = $text | ConvertFrom-Json
    $root = Join-Path $env:LOCALAPPDATA 'STXICHalo\usage\claude-statusline'
    $session = [string]$data.session_id
    if ($session -notmatch '^[a-zA-Z0-9_-]{1,128}$') { exit 0 }
    $now = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $quotas = @()
    foreach ($window in @(@('five_hour', 'Five-hour', 300), @('seven_day', 'Weekly', 10080))) {
        $reading = $data.rate_limits.($window[0])
        if ($null -eq $reading -or $null -eq $reading.used_percentage) { continue }
        $used = [double]$reading.used_percentage
        if ([double]::IsNaN($used) -or $used -lt 0 -or $used -gt 100) { continue }
        $reset = $null
        if ($null -ne $reading.resets_at) { $reset = [long]$reading.resets_at; if ($reset -lt 0 -or $reset -gt 253402300799) { continue } }
        $quotas += @{ label = $window[1]; used_percent = $used; window_minutes = $window[2]; resets_at = $reset; observed_at = $now }
    }
    New-Item -ItemType Directory -Force -Path $root | Out-Null
    $target = Join-Path $root ($session + '.json')
    $temp = Join-Path $root ($session + '.' + [guid]::NewGuid().ToString('N') + '.tmp')
    $report = @{ schema_version = 1; provider = 'claude-code'; sessions = @(); quotas = $quotas; source = 'statusline' }
    [System.IO.File]::WriteAllText($temp, ($report | ConvertTo-Json -Depth 8 -Compress), (New-Object System.Text.UTF8Encoding($false)))
    function Replace-Snapshot {
        $backup = $target + '.' + [guid]::NewGuid().ToString('N') + '.bak'
        try { [System.IO.File]::Replace($temp, $target, $backup) } finally { if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force } }
    }
    if (Test-Path -LiteralPath $target) { Replace-Snapshot } else { try { [System.IO.File]::Move($temp, $target) } catch { if (Test-Path -LiteralPath $target) { Replace-Snapshot } else { throw } } }
    $model = [string]$data.model.display_name
    if ($model) { Write-Output $model } else { Write-Output 'Claude Code' }
} catch { Write-Output 'Claude Code' }
