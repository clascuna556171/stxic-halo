<#
.SYNOPSIS
  Packages STXIC Halo into a Windows 10/11 x64 MSIX bundle for Microsoft Store submission.
.DESCRIPTION
  By default, builds an unsigned .msix in release-output/ ready for direct upload to Microsoft Partner Center
  (Partner Center signs Store MSIX packages automatically for free).
  Pass -TestSign only if you want a local self-signed .msix for sideloading or WACK testing on this PC.
#>
param(
  [string]$PackageName = "STXICLabs.STXICHalo",
  [string]$Publisher = "CN=F4622AED-BFCF-49FF-AD64-F0FB16AC91CA",
  [string]$DisplayName = "STXIC Halo",
  [string]$PublisherDisplayName = "STXIC Labs",
  [string]$Version = "",
  [switch]$SkipBuild,
  [switch]$TestSign,
  [string]$CertSubject = "CN=STXIC Labs"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TauriRoot = Join-Path $ProjectRoot "src-tauri"
$PackageJsonPath = Join-Path $ProjectRoot "package.json"
$TemplatePath = Join-Path $TauriRoot "msix\AppxManifest.template.xml"
$IconsDir = Join-Path $TauriRoot "icons"
$ReleaseDir = Join-Path $TauriRoot "target\release"
$StagingDir = Join-Path $ReleaseDir "msix-staging"
$OutputDir = Join-Path $ProjectRoot "release-output"

function Find-WindowsSdkTool([string]$ToolName) {
  $kitBin = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
  if (-not (Test-Path $kitBin)) {
    throw "Windows 10/11 SDK not found at '$kitBin'. Install the Windows SDK to get $ToolName."
  }
  $candidates = Get-ChildItem -Path $kitBin -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "x64\$ToolName" } |
    Where-Object { Test-Path $_ }
  $first = $candidates | Select-Object -First 1
  if (-not $first) {
    throw "Could not locate $ToolName under '$kitBin\*\x64'."
  }
  return $first
}

function Escape-Xml([string]$Value) {
  return [System.Security.SecurityElement]::Escape($Value)
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  $pkg = Get-Content -Raw $PackageJsonPath | ConvertFrom-Json
  $rawVer = [string]$pkg.version
  if ($rawVer -match '^\d+\.\d+\.\d+$') {
    $Version = "$rawVer.0"
  } elseif ($rawVer -match '^\d+\.\d+\.\d+\.\d+$') {
    $Version = $rawVer
  } else {
    throw "Unsupported package.json version '$rawVer' for MSIX 4-part version."
  }
}

$makeAppx = Find-WindowsSdkTool "makeappx.exe"
Write-Host "Using makeappx: $makeAppx"

if (-not $SkipBuild) {
  Write-Host "Building release binary (npm run desktop:build:exe)..."
  Push-Location $ProjectRoot
  try {
    npm run desktop:build:exe
    if ($LASTEXITCODE -ne 0) {
      throw "desktop:build:exe failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

$ExePath = Join-Path $ReleaseDir "stxic-halo.exe"
$LibDllPath = Join-Path $ReleaseDir "stxic_halo_lib.dll"
if (-not (Test-Path $ExePath)) {
  throw "Release executable not found at '$ExePath'. Run without -SkipBuild first."
}

if (Test-Path $StagingDir) {
  Remove-Item -Path $StagingDir -Recurse -Force
}
$AssetsDir = Join-Path $StagingDir "Assets"
New-Item -ItemType Directory -Path $AssetsDir -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Copy-Item -Path $ExePath -Destination (Join-Path $StagingDir "stxic-halo.exe") -Force
if (Test-Path $LibDllPath) {
  Copy-Item -Path $LibDllPath -Destination (Join-Path $StagingDir "stxic_halo_lib.dll") -Force
}

$RequiredIcons = @(
  "StoreLogo.png",
  "Square44x44Logo.png",
  "Square71x71Logo.png",
  "Square150x150Logo.png"
)
foreach ($icon in $RequiredIcons) {
  $src = Join-Path $IconsDir $icon
  if (-not (Test-Path $src)) {
    throw "Required Store icon missing: '$src'"
  }
  Copy-Item -Path $src -Destination (Join-Path $AssetsDir $icon) -Force
}

$manifestTemplate = Get-Content -Raw $TemplatePath
$manifestXml = $manifestTemplate `
  -replace '\{\{PACKAGE_NAME\}\}', (Escape-Xml $PackageName) `
  -replace '\{\{PUBLISHER\}\}', (Escape-Xml $Publisher) `
  -replace '\{\{VERSION\}\}', (Escape-Xml $Version) `
  -replace '\{\{DISPLAY_NAME\}\}', (Escape-Xml $DisplayName) `
  -replace '\{\{PUBLISHER_DISPLAY_NAME\}\}', (Escape-Xml $PublisherDisplayName)

$ManifestPath = Join-Path $StagingDir "AppxManifest.xml"
[System.IO.File]::WriteAllText($ManifestPath, $manifestXml, [System.Text.UTF8Encoding]::new($false))

$MsixPath = Join-Path $OutputDir "STXIC-Halo_${Version}_x64.msix"
if (Test-Path $MsixPath) {
  Remove-Item -Path $MsixPath -Force
}

Write-Host "Packing MSIX -> $MsixPath"
& $makeAppx pack /o /d $StagingDir /p $MsixPath
if ($LASTEXITCODE -ne 0) {
  throw "makeappx pack failed with exit code $LASTEXITCODE"
}

if ($TestSign) {
  $signTool = Find-WindowsSdkTool "signtool.exe"
  $cert = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $CertSubject -and $_.HasPrivateKey } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

  if (-not $cert) {
    Write-Host "Creating local self-signed code signing certificate for '$CertSubject' (local testing only)..."
    $cert = New-SelfSignedCertificate `
      -Type Custom `
      -Subject $CertSubject `
      -KeyUsage DigitalSignature `
      -FriendlyName "STXIC Halo Local Test Cert" `
      -CertStoreLocation "Cert:\CurrentUser\My" `
      -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
  }

  Write-Host "Signing local test MSIX with thumbprint $($cert.Thumbprint)..."
  & $signTool sign /fd SHA256 /sha1 $cert.Thumbprint $MsixPath
  if ($LASTEXITCODE -ne 0) {
    throw "signtool failed with exit code $LASTEXITCODE"
  }
  Write-Warning "This MSIX is self-signed for LOCAL sideloading/WACK testing only. Upload an UNSIGNED MSIX (or re-run without -TestSign) to Partner Center so Microsoft signs it for the Store."
}

$hash = (Get-FileHash -Algorithm SHA256 $MsixPath).Hash
$sizeMb = [Math]::Round((Get-Item $MsixPath).Length / 1MB, 2)
Write-Host ""
Write-Host "MSIX ready: $MsixPath ($sizeMb MB)"
Write-Host "SHA-256:    $hash"
Write-Host "Identity:   Name=$PackageName | Publisher=$Publisher | Version=$Version"
