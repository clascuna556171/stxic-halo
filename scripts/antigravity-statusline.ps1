# Receives Antigravity CLI's documented status-line JSON. Never reads credentials or sends requests.
$ErrorActionPreference = 'Stop'
try {
    $text = [Console]::In.ReadToEnd()
    if ($text.Length -gt 262144) { exit 0 }
    $data = $text | ConvertFrom-Json
    $root = Join-Path $env:LOCALAPPDATA 'STXICHalo\usage\antigravity-statusline'
    $session = if ($data.session_id) { [string]$data.session_id } elseif ($data.conversation_id) { [string]$data.conversation_id } else { '' }
    if ($session -notmatch '^[a-zA-Z0-9_-]{1,128}$') { exit 0 }
    $nowDto = [DateTimeOffset]::UtcNow
    $now = $nowDto.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $quotas = @()
    if ($null -ne $data.quota) {
        foreach ($prop in $data.quota.PSObject.Properties) {
            if ($quotas.Count -ge 8) { break }
            $bucket = [string]$prop.Name
            $reading = $prop.Value
            if ($null -eq $reading -or $reading.disabled -eq $true) { continue }
            if ($null -eq $reading.remaining_fraction) { continue }
            $rem = [double]$reading.remaining_fraction
            if ([double]::IsNaN($rem) -or $rem -lt 0 -or $rem -gt 1) { continue }
            $used = [Math]::Round((1.0 - $rem) * 100.0, 2)
            if ($used -lt 0) { $used = 0.0 }
            if ($used -gt 100) { $used = 100.0 }
            $reset = $null
            if ($reading.reset_time) {
                try {
                    $parsed = [DateTimeOffset]::Parse([string]$reading.reset_time).ToUnixTimeSeconds()
                    if ($parsed -ge 0 -and $parsed -le 253402300799) { $reset = [long]$parsed }
                } catch {}
            }
            if ($null -eq $reset -and $null -ne $reading.reset_in_seconds) {
                $ris = [double]$reading.reset_in_seconds
                if (-not [double]::IsNaN($ris) -and $ris -ge 0) {
                    $calc = $nowDto.ToUnixTimeSeconds() + [long][Math]::Round($ris)
                    if ($calc -ge 0 -and $calc -le 253402300799) { $reset = $calc }
                }
            }
            $label = $bucket.Substring(0, [Math]::Min($bucket.Length, 80))
            $winMins = $null
            if ($bucket -match '(?i)(^|[-_])(5h|5-hour|five[-_]?hour)($|[-_])') {
                $label = '5-hour'
                $winMins = 300
            } elseif ($bucket -match '(?i)(week|weekly|7d|seven[-_]?day)') {
                $label = '1-week'
                $winMins = 10080
            }
            $quotas += @{ label = $label; used_percent = $used; window_minutes = $winMins; resets_at = $reset; observed_at = $now }
        }
    }
    $sessions = @()
    $totalTokens = $null
    if ($null -ne $data.context_window) {
        $inTok = if ($null -ne $data.context_window.total_input_tokens) { [double]$data.context_window.total_input_tokens } else { $null }
        $outTok = if ($null -ne $data.context_window.total_output_tokens) { [double]$data.context_window.total_output_tokens } else { $null }
        if (($null -ne $inTok -and -not [double]::IsNaN($inTok) -and $inTok -ge 0) -or ($null -ne $outTok -and -not [double]::IsNaN($outTok) -and $outTok -ge 0)) {
            $sum = [long][Math]::Round($(if ($null -ne $inTok -and $inTok -ge 0) { $inTok } else { 0 }) + $(if ($null -ne $outTok -and $outTok -ge 0) { $outTok } else { 0 }))
            if ($sum -ge 0 -and $sum -le 9007199254740991) { $totalTokens = $sum }
        }
    }
    $costUsd = $null
    if ($null -ne $data.cost -and $null -ne $data.cost.total_usd) {
        $c = [double]$data.cost.total_usd
        if (-not [double]::IsNaN($c) -and -not [double]::IsInfinity($c) -and $c -ge 0) { $costUsd = $c }
    }
    if ($null -ne $totalTokens -or $null -ne $costUsd) {
        $sessions += @{ session_id = $session; total_tokens = $totalTokens; cost_usd = $costUsd; observed_at = $now }
    }
    if ($sessions.Count -eq 0 -and $quotas.Count -eq 0) { exit 0 }
    New-Item -ItemType Directory -Force -Path $root | Out-Null
    $target = Join-Path $root ($session + '.json')
    $temp = Join-Path $root ($session + '.' + [guid]::NewGuid().ToString('N') + '.tmp')
    $report = @{ schema_version = 1; provider = 'antigravity'; sessions = $sessions; quotas = $quotas; source = 'statusline' }
    [System.IO.File]::WriteAllText($temp, ($report | ConvertTo-Json -Depth 8 -Compress), (New-Object System.Text.UTF8Encoding($false)))
    function Replace-Snapshot {
        $backup = $target + '.' + [guid]::NewGuid().ToString('N') + '.bak'
        try { [System.IO.File]::Replace($temp, $target, $backup) } finally { if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force } }
    }
    if (Test-Path -LiteralPath $target) { Replace-Snapshot } else { try { [System.IO.File]::Move($temp, $target) } catch { if (Test-Path -LiteralPath $target) { Replace-Snapshot } else { throw } } }
} catch {}
