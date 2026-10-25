Write-Host '=== STXIC Halo -- Windows Prerequisites & Foundation Check ===' -ForegroundColor Cyan
$ErrorActionPreference = 'Continue'

foreach ($command in @('node', 'npm', 'rustc', 'cargo')) {
    $available = Get-Command $command -ErrorAction SilentlyContinue
    if ($available) {
        $ver = & $command --version 2>$null
        Write-Host ("[OK]      {0,-8} {1} ({2})" -f $command, $ver, $available.Source) -ForegroundColor Green
    } else {
        Write-Host ("[MISSING] {0,-8} Not found on PATH" -f $command) -ForegroundColor Yellow
    }
}

$wv2KeyLM = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$wv2KeyCU = 'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$wv2Ver = $null
if (Test-Path $wv2KeyLM) { $wv2Ver = (Get-ItemProperty $wv2KeyLM -ErrorAction SilentlyContinue).pv }
if (-not $wv2Ver -and (Test-Path $wv2KeyCU)) { $wv2Ver = (Get-ItemProperty $wv2KeyCU -ErrorAction SilentlyContinue).pv }
if ($wv2Ver) {
    Write-Host ("[OK]      WebView2 Runtime version: {0}" -f $wv2Ver) -ForegroundColor Green
} else {
    Write-Host "[MISSING] WebView2 Evergreen Runtime not detected in standard registry keys" -ForegroundColor Yellow
}

if ($env:LOCALAPPDATA) {
    $haloDir = Join-Path $env:LOCALAPPDATA 'STXICHalo'
    $events = Join-Path $haloDir 'events.jsonl'
    $settings = Join-Path $haloDir 'settings.json'
    Write-Host ("Local data dir : {0}" -f $haloDir)
    Write-Host ("Event log      : {0} (exists: {1})" -f $events, (Test-Path $events))
    Write-Host ("User settings  : {0} (exists: {1})" -f $settings, (Test-Path $settings))
}
