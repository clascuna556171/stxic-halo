# Launches STXIC Halo directly onto the user's interactive desktop (WinSta0\Default)
param(
  [switch]$Release
)

$releaseFolder = Join-Path $PSScriptRoot '..\src-tauri\target\release'
# An existing executable may be locked by another app while a replacement is built.
$target = @('stxic-halo.exe', 'stxic-halo-activity.exe', 'stxic-halo-providers.exe', 'stxic-halo-overview.exe') |
  ForEach-Object { Get-Item -LiteralPath (Join-Path $releaseFolder $_) -ErrorAction SilentlyContinue } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $target) {
  throw "No release binary found. Run npm run desktop:build:exe first."
}

$fullTarget = (Resolve-Path -LiteralPath $target).Path

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Launcher {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct STARTUPINFO {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public int dwX;
    public int dwY;
    public int dwXSize;
    public int dwYSize;
    public int dwXCountChars;
    public int dwYCountChars;
    public int dwFillAttribute;
    public int dwFlags;
    public short wShowWindow;
    public short cbReserved2;
    public IntPtr lpReserved2;
    public IntPtr hStdInput;
    public IntPtr hStdOutput;
    public IntPtr hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION {
    public IntPtr hProcess;
    public IntPtr hThread;
    public int dwProcessId;
    public int dwThreadId;
  }
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CreateProcessW(
    string lpApplicationName,
    string lpCommandLine,
    IntPtr lpProcessAttributes,
    IntPtr lpThreadAttributes,
    bool bInheritHandles,
    uint dwCreationFlags,
    IntPtr lpEnvironment,
    string lpCurrentDirectory,
    ref STARTUPINFO lpStartupInfo,
    out PROCESS_INFORMATION lpProcessInformation
  );
}
'@

$si = New-Object Launcher+STARTUPINFO
$si.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($si)
$si.lpDesktop = "WinSta0\Default"
$pi = New-Object Launcher+PROCESS_INFORMATION

$ok = [Launcher]::CreateProcessW($null, $fullTarget, [IntPtr]::Zero, [IntPtr]::Zero, $false, 0, [IntPtr]::Zero, $null, [ref]$si, [ref]$pi)
if (-not $ok) {
  $shell = New-Object -ComObject Shell.Application
  $shell.ShellExecute($fullTarget)
  Start-Sleep -Seconds 2
  $proc = Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($fullTarget)) -ErrorAction SilentlyContinue | Sort-Object StartTime -Descending | Select-Object -First 1
  if ($proc) {
    Write-Output "STXIC Halo running on WinSta0\Default (via Shell.Application) with PID: $($proc.Id)"
  } else {
    $proc = Start-Process -FilePath $fullTarget -PassThru
    Write-Output "STXIC Halo running with PID: $($proc.Id)"
  }
} else {
  Write-Output "STXIC Halo running on WinSta0\Default with PID: $($pi.dwProcessId)"
}
