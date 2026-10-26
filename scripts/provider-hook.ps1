# STXIC Halo provider bridge. Installed only by an explicit Connect action.
# Receives JSON on stdin. Never emits decisions, prompts, arguments, or transcripts.
param(
    [Parameter(Mandatory=$true)][ValidateSet('antigravity','github-copilot')][string]$Source,
    [Parameter(Mandatory=$true)][ValidateSet('SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','PreInvocation','PostInvocation','Stop','Error')][string]$Event
)
$ErrorActionPreference = 'Stop'
try {
    # Bound input before parsing, including providers that send large tool results.
    $buffer = New-Object char[] 1048577
    $length = 0
    while ($length -lt $buffer.Length) {
        $count = [Console]::In.Read($buffer, $length, $buffer.Length - $length)
        if ($count -eq 0) { break }
        $length += $count
    }
    if ($length -eq 0 -or $length -gt 1048576) { exit 0 }
    $payload = (-join $buffer[0..($length - 1)]) | ConvertFrom-Json
    if ($Source -eq 'antigravity') {
        $session = [string]$payload.conversationId
        $cwdStr = if ($payload.workspacePaths.Count -gt 0) { [string]$payload.workspacePaths[0] } else { '' }
        $toolStr = [string]$payload.toolCall.name
    } else {
        $session = [string]$payload.sessionId
        if (-not $session) { $session = [string]$payload.session_id }
        $cwdStr = [string]$payload.cwd
        $toolStr = [string]$payload.toolName
        if (-not $toolStr) { $toolStr = [string]$payload.tool_name }
    }
    if ([string]::IsNullOrWhiteSpace($session) -or $session.Length -gt 128) { exit 0 }
    $record = [ordered]@{
        schema_version = 1; source = $Source; session_id = $session
        timestamp = [DateTime]::UtcNow.ToString('o'); event = $Event
        cwd = $cwdStr.Substring(0, [Math]::Min(512, $cwdStr.Length))
        tool_name = $toolStr.Substring(0, [Math]::Min(48, $toolStr.Length))
    }
    $root = Join-Path $env:LOCALAPPDATA 'STXICHalo'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $logPath = Join-Path $root 'events.jsonl'
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($record | ConvertTo-Json -Compress) + "`n")
    # Shared cross-provider writer lock; do not block a coding tool indefinitely.
    $mutex = [Threading.Mutex]::new($false, 'Local\STXICHaloProviderEvents')
    $locked = $false
    try {
        try { $locked = $mutex.WaitOne(200) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { exit 0 }
        if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -ge 2097152) {
            Move-Item -LiteralPath $logPath -Destination ($logPath + '.bak') -Force
        }
        for ($attempt = 0; $attempt -lt 3; $attempt++) {
            try {
                $stream = [IO.File]::Open($logPath, [IO.FileMode]::Append, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)
                try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
                break
            } catch { Start-Sleep -Milliseconds 20 }
        }
    } finally { if ($locked) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
} catch { }
exit 0
