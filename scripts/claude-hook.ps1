# STXIC Halo minimal lifecycle event bridge. Run only after explicit opt-in.
# Input: one JSON object on stdin from Claude Code hooks.
# Output: sanitized event metadata to LOCALAPPDATA\STXICHalo\events.jsonl.
# Does not log prompts, tool input, model output, tokens, or credentials.
$ErrorActionPreference = 'Stop'
try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw -or $raw.Length -gt 1048576) { exit 0 }
    $payload = $raw | ConvertFrom-Json -ErrorAction Stop
    $eventName = [string]$payload.hook_event_name
    $allowed = @('SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Error')
    if ($eventName -notin $allowed) { exit 0 }
    $session = [string]$payload.session_id
    if ([string]::IsNullOrWhiteSpace($session)) { exit 0 }

    $root = Join-Path $env:LOCALAPPDATA 'STXICHalo'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $logPath = Join-Path $root 'events.jsonl'
    $bakPath = Join-Path $root 'events.jsonl.bak'

    # Rotate log at 2 MiB to prevent unbounded disk growth
    if (Test-Path $logPath) {
        $fileInfo = Get-Item $logPath -ErrorAction SilentlyContinue
        if ($fileInfo -and $fileInfo.Length -ge 2097152) {
            Move-Item -Path $logPath -Destination $bakPath -Force -ErrorAction SilentlyContinue
        }
    }

    $cwdStr = [string]$payload.cwd
    $toolStr = [string]$payload.tool_name
    $record = [ordered]@{
        schema_version = 1
        source         = 'claude-code'
        session_id     = $session.Substring(0, [Math]::Min(128, $session.Length))
        timestamp      = [DateTime]::UtcNow.ToString('o')
        event          = $eventName
        cwd            = $cwdStr.Substring(0, [Math]::Min(512, $cwdStr.Length))
        tool_name      = $toolStr.Substring(0, [Math]::Min(48, $toolStr.Length))
    }
    $line = ($record | ConvertTo-Json -Compress -Depth 2) + [Environment]::NewLine
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($line)

    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            $stream = [System.IO.File]::Open(
                $logPath,
                [System.IO.FileMode]::Append,
                [System.IO.FileAccess]::Write,
                [System.IO.FileShare]::ReadWrite
            )
            try {
                $stream.Write($bytes, 0, $bytes.Length)
                $stream.Flush()
                break
            } finally {
                $stream.Dispose()
            }
        } catch {
            Start-Sleep -Milliseconds 15
        }
    }
} catch {
    # Do not interrupt agent operation for a telemetry failure.
    exit 0
}
exit 0
