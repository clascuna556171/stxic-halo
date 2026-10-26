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
    # Only wait while a running Halo UI is polling the permission mailbox.
    # Tool input is temporary and never added to the lifecycle log above.
    if ($eventName -eq 'PermissionRequest') {
        $mailbox = Join-Path $root 'permissions'
        $heartbeat = Get-Item -LiteralPath (Join-Path $mailbox 'heartbeat') -ErrorAction SilentlyContinue
        if ($heartbeat -and ([DateTime]::UtcNow - $heartbeat.LastWriteTimeUtc).TotalSeconds -lt 3) {
            $inputJson = ConvertTo-Json -InputObject $payload.tool_input -Compress -Depth 100 -WarningAction Stop
            # Never show an incomplete action for approval; oversized input stays in Claude.
            if ([Text.Encoding]::UTF8.GetByteCount($inputJson) -le 16384 -and $session.Length -le 128 -and $cwdStr.Length -le 4096) {
                $id = [Guid]::NewGuid().ToString('N')
                $requestPath = Join-Path $mailbox "$id.request.json"
                $responsePath = Join-Path $mailbox "$id.decision.json"
                $temporaryPath = Join-Path $mailbox "$id.tmp"
                $expires = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + 45000
                try {
                    $request = @{ id = $id; session_id = $session; cwd = $cwdStr; tool_name = $toolStr; tool_input = $inputJson; expires_at = $expires }
                    [IO.File]::WriteAllText($temporaryPath, ($request | ConvertTo-Json -Compress -Depth 4), [Text.UTF8Encoding]::new($false))
                    [IO.File]::Move($temporaryPath, $requestPath)
                    while ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt $expires) {
                        if (Test-Path -LiteralPath $responsePath) {
                            try {
                                $response = [IO.File]::ReadAllText($responsePath) | ConvertFrom-Json
                                if ($response.behavior -in @('allow', 'deny')) {
                                    $decision = @{ behavior = $response.behavior }
                                    if ($response.behavior -eq 'deny') { $decision.message = 'Denied by the user in STXIC Halo.' }
                                    @{ hookSpecificOutput = @{ hookEventName = 'PermissionRequest'; decision = $decision } } | ConvertTo-Json -Compress -Depth 4
                                    break
                                }
                            } catch { } # Response writer may still be completing its atomic claim.
                        }
                        $heartbeat = Get-Item -LiteralPath (Join-Path $mailbox 'heartbeat') -ErrorAction SilentlyContinue
                        if (-not $heartbeat -or ([DateTime]::UtcNow - $heartbeat.LastWriteTimeUtc).TotalSeconds -ge 3) { break }
                        Start-Sleep -Milliseconds 100
                    }
                } finally {
                    Remove-Item -LiteralPath $requestPath, $responsePath, $temporaryPath -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
} catch {
    # Do not interrupt agent operation for a telemetry failure.
    exit 0
}
exit 0
