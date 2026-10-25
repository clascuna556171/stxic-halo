<#
.SYNOPSIS
    Installer-friendly Claude Code lifecycle hook manager with atomic backup and rollback.

.DESCRIPTION
    Safely enables, disables, or rolls back STXIC Halo's lifecycle hooks in %USERPROFILE%\.claude\settings.json.
    - Preserves all existing user configuration, authentication tokens, and custom hooks.
    - Creates timestamped and rollback backups before modifying any configuration.
    - Uses atomic file writes to prevent configuration corruption.
    - Returns structured JSON for programmatic consumption by the Halo UI.

.PARAMETER Action
    The action to perform: 'Status', 'Enable', 'Disable', or 'Rollback'. Default is 'Status'.

.PARAMETER HookScriptPath
    Optional explicit path to claude-hook.ps1. Defaults to the script in this directory.

.PARAMETER SettingsPath
    Optional explicit path to Claude's settings.json. Defaults to %USERPROFILE%\.claude\settings.json.
#>
[CmdletBinding()]
param (
    [Parameter(Position = 0)]
    [ValidateSet('Status', 'Enable', 'Disable', 'Rollback')]
    [string]$Action = 'Status',

    [string]$HookScriptPath,
    [string]$SettingsPath
)

$ErrorActionPreference = 'Stop'

# Resolve default paths
if (-not $HookScriptPath) {
    $HookScriptPath = Join-Path $PSScriptRoot 'claude-hook.ps1'
}
$HookScriptPath = [System.IO.Path]::GetFullPath($HookScriptPath)

if (-not $SettingsPath) {
    $SettingsDir = Join-Path $env:USERPROFILE '.claude'
    $SettingsPath = Join-Path $SettingsDir 'settings.json'
} else {
    $SettingsDir = [System.IO.Path]::GetDirectoryName($SettingsPath)
}
$BackupPath = "$SettingsPath.halo-bak"

$HookEvents = @(
    'SessionStart',
    'PreToolUse',
    'PostToolUse',
    'PermissionRequest',
    'Stop',
    'SessionEnd'
)

function Get-ClaudeConfig {
    if (Test-Path $SettingsPath) {
        $raw = Get-Content -Path $SettingsPath -Raw -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($raw)) {
            return @{}
        }
        return ($raw | ConvertFrom-Json)
    }
    return $null
}

function Save-ClaudeConfigAtomic ($configObj) {
    if (-not (Test-Path $SettingsDir)) {
        New-Item -ItemType Directory -Path $SettingsDir -Force | Out-Null
    }
    $json = $configObj | ConvertTo-Json -Depth 10
    $tmpPath = "$SettingsPath.tmp-$([Guid]::NewGuid().ToString('N'))"
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($tmpPath, $json, $utf8NoBom)

    Move-Item -Path $tmpPath -Destination $SettingsPath -Force
}

function Get-HookCount ($config) {
    if (-not $config -or -not $config.hooks) { return 0 }
    $count = 0
    foreach ($evt in $HookEvents) {
        $entries = $config.hooks.$evt
        if ($entries) {
            foreach ($entry in $entries) {
                $subHooks = $entry.hooks
                if ($subHooks) {
                    foreach ($h in $subHooks) {
                        if ($h.command -and $h.command.ToString().Contains('claude-hook.ps1')) {
                            $count++
                        }
                    }
                }
            }
        }
    }
    return $count
}

function Get-StatusObj {
    $config = Get-ClaudeConfig
    $installedCount = Get-HookCount $config
    $isInstalled = ($installedCount -ge $HookEvents.Count)
    $hasBackup = Test-Path $BackupPath

    return [PSCustomObject]@{
        success       = $true
        action        = $Action
        installed     = $isInstalled
        hook_count    = $installedCount
        config_path   = $SettingsPath
        hook_path     = $HookScriptPath
        backup_exists = $hasBackup
        backup_path   = $BackupPath
        message       = if ($isInstalled) {
            "STXIC Halo hooks are active ($installedCount/$($HookEvents.Count) hooks installed)."
        } elseif ($installedCount -gt 0) {
            "STXIC Halo hooks are partially installed ($installedCount/$($HookEvents.Count) hooks)."
        } else {
            "STXIC Halo hooks are not installed."
        }
    }
}

switch ($Action) {
    'Status' {
        $status = Get-StatusObj
        $status | ConvertTo-Json -Compress
        exit 0
    }

    'Enable' {
        if (-not (Test-Path $HookScriptPath)) {
            $err = [PSCustomObject]@{
                success = $false
                error   = "Hook script not found at '$HookScriptPath'."
            }
            $err | ConvertTo-Json -Compress
            exit 1
        }

        # Backup existing configuration if present
        if (Test-Path $SettingsPath) {
            Copy-Item -Path $SettingsPath -Destination $BackupPath -Force
            # Also write timestamped backup for auditability
            $timestampBackupDir = Join-Path $SettingsDir 'backups'
            New-Item -ItemType Directory -Path $timestampBackupDir -Force | Out-Null
            $timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
            Copy-Item -Path $SettingsPath -Destination (Join-Path $timestampBackupDir "settings-$timestamp.json") -Force
        }

        $config = Get-ClaudeConfig
        if (-not $config) {
            $config = [PSCustomObject]@{}
        }
        if (-not $config.hooks) {
            $config | Add-Member -NotePropertyName 'hooks' -NotePropertyValue ([PSCustomObject]@{}) -Force
        }

        $escapedScriptPath = $HookScriptPath.Replace('"', '\"')
        $commandStr = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$escapedScriptPath`""

        foreach ($evt in $HookEvents) {
            $existing = $config.hooks.$evt
            $hasOurHook = $false
            if ($existing) {
                foreach ($entry in $existing) {
                    foreach ($h in $entry.hooks) {
                        if ($h.command -and $h.command.ToString().Contains('claude-hook.ps1')) {
                            $hasOurHook = $true
                            # Update command path in case repo moved
                            $h.command = $commandStr
                        }
                    }
                }
            }

            if (-not $hasOurHook) {
                $newHookEntry = [PSCustomObject]@{
                    hooks = @(
                        [PSCustomObject]@{
                            type    = 'command'
                            command = $commandStr
                        }
                    )
                }
                if ($existing) {
                    $config.hooks.$evt = @($existing) + @($newHookEntry)
                } else {
                    $config.hooks | Add-Member -NotePropertyName $evt -NotePropertyValue @($newHookEntry) -Force
                }
            }
        }

        Save-ClaudeConfigAtomic $config
        $status = Get-StatusObj
        $status.message = "Successfully enabled all STXIC Halo hooks."
        $status | ConvertTo-Json -Compress
        exit 0
    }

    'Disable' {
        if (-not (Test-Path $SettingsPath)) {
            $status = Get-StatusObj
            $status.message = "Settings file does not exist; nothing to disable."
            $status | ConvertTo-Json -Compress
            exit 0
        }

        # Backup before disabling
        Copy-Item -Path $SettingsPath -Destination $BackupPath -Force

        $config = Get-ClaudeConfig
        if ($config -and $config.hooks) {
            foreach ($evt in $HookEvents) {
                $existing = $config.hooks.$evt
                if ($existing) {
                    $filtered = @()
                    foreach ($entry in $existing) {
                        $remainingSubHooks = @()
                        if ($entry.hooks) {
                            foreach ($h in $entry.hooks) {
                                if (-not ($h.command -and $h.command.ToString().Contains('claude-hook.ps1'))) {
                                    $remainingSubHooks += $h
                                }
                            }
                        }
                        if ($remainingSubHooks.Count -gt 0) {
                            $entry.hooks = $remainingSubHooks
                            $filtered += $entry
                        }
                    }
                    if ($filtered.Count -gt 0) {
                        $config.hooks.$evt = $filtered
                    } else {
                        $config.hooks.psobject.properties.Remove($evt)
                    }
                }
            }
            # Remove hooks property entirely if empty
            if ($config.hooks.psobject.properties.Count -eq 0) {
                $config.psobject.properties.Remove('hooks')
            }
        }

        Save-ClaudeConfigAtomic $config
        $status = Get-StatusObj
        $status.message = "Successfully disabled STXIC Halo hooks."
        $status | ConvertTo-Json -Compress
        exit 0
    }

    'Rollback' {
        if (-not (Test-Path $BackupPath)) {
            $err = [PSCustomObject]@{
                success = $false
                error   = "No rollback backup found at '$BackupPath'."
            }
            $err | ConvertTo-Json -Compress
            exit 1
        }

        Copy-Item -Path $BackupPath -Destination $SettingsPath -Force
        $status = Get-StatusObj
        $status.message = "Successfully rolled back settings from backup."
        $status | ConvertTo-Json -Compress
        exit 0
    }
}
