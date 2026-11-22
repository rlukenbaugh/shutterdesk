<#
.SYNOPSIS
  Adds ShutterDesk to (or removes it from) the Windows Start menu, Start search and
  Settings > Apps, for the current user only. No administrator rights are needed.

.DESCRIPTION
  Used by native-csharp\INSTALL-NATIVE-SHUTTERDESK.bat and Fix-Start-Menu-Shortcut.bat.
  It creates:
    * Start menu shortcut  <Programs>\ShutterDesk.lnk  (what Start search finds)
    * Desktop shortcut     (unless -NoDesktop)
    * App Paths entry      so Win+R "ShutterDesk" works
    * Uninstall entry      so ShutterDesk shows in Settings > Apps > Installed apps
                           (only with -RegisterUninstall, i.e. for the native install)
  Folder locations come from Windows itself, so a Desktop or Start menu that OneDrive or
  a company policy has moved is handled. The script fails (exit code 1) if the Start menu
  shortcut is not there afterwards.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File Register-ShutterDesk.ps1 -ExePath "C:\...\ShutterDesk.exe"
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File Register-ShutterDesk.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [string]$ExePath,
  [switch]$NoDesktop,
  [switch]$RegisterUninstall,
  [string]$Version = '1.1.0',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$AppName = 'ShutterDesk'
$AppId = 'com.shutterdesk.capture'
$StartMenuLnk = Join-Path ([Environment]::GetFolderPath('Programs')) "$AppName.lnk"
$DesktopLnk = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) "$AppName.lnk"
$AppPathsKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\$AppName.exe"
$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppName"

function Remove-IfPresent([string]$Path) {
  if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }
}

if ($Uninstall) {
  $installDir = $null
  if (Test-Path $UninstallKey) { $installDir = (Get-ItemProperty $UninstallKey).InstallLocation }
  Get-Process -Name $AppName -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 300
  Remove-IfPresent $StartMenuLnk
  Remove-IfPresent $DesktopLnk
  Remove-IfPresent $AppPathsKey
  Remove-IfPresent $UninstallKey
  Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $AppName -ErrorAction SilentlyContinue
  if ($installDir -and (Test-Path -LiteralPath $installDir)) {
    # Only delete a folder that is clearly ShutterDesk's own.
    if ((Split-Path -Leaf $installDir) -eq $AppName) { Remove-IfPresent $installDir }
  }
  Write-Host "$AppName has been removed. Your captures in Pictures\$AppName were kept."
  exit 0
}

if (-not $ExePath) { throw 'Pass -ExePath with the full path to ShutterDesk.exe.' }
$ExePath = (Resolve-Path -LiteralPath $ExePath).Path
$InstallDir = Split-Path -Parent $ExePath

function New-Shortcut([string]$Path) {
  $folder = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($Path)
  $lnk.TargetPath = $ExePath
  $lnk.WorkingDirectory = $InstallDir
  $lnk.IconLocation = "$ExePath,0"
  $lnk.Description = 'ShutterDesk screen capture'
  $lnk.Save()
}

New-Shortcut $StartMenuLnk
if (-not $NoDesktop) { New-Shortcut $DesktopLnk }

New-Item -Path $AppPathsKey -Force | Out-Null
Set-ItemProperty -Path $AppPathsKey -Name '(default)' -Value $ExePath
Set-ItemProperty -Path $AppPathsKey -Name 'Path' -Value $InstallDir

if ($RegisterUninstall) {
  $script = Join-Path $InstallDir 'Register-ShutterDesk.ps1'
  if ((Resolve-Path -LiteralPath $PSCommandPath).Path -ne $script) { Copy-Item -LiteralPath $PSCommandPath -Destination $script -Force }
  $uninstallCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Uninstall"
  New-Item -Path $UninstallKey -Force | Out-Null
  $values = @{
    DisplayName     = $AppName
    DisplayVersion  = $Version
    Publisher       = 'ShutterDesk Studio'
    DisplayIcon     = "$ExePath,0"
    InstallLocation = $InstallDir
    UninstallString = $uninstallCmd
  }
  foreach ($k in $values.Keys) { Set-ItemProperty -Path $UninstallKey -Name $k -Value $values[$k] }
  Set-ItemProperty -Path $UninstallKey -Name 'NoModify' -Value 1 -Type DWord
  Set-ItemProperty -Path $UninstallKey -Name 'NoRepair' -Value 1 -Type DWord
  $sizeKb = [int]((Get-ChildItem -LiteralPath $InstallDir -Recurse -File | Measure-Object Length -Sum).Sum / 1KB)
  Set-ItemProperty -Path $UninstallKey -Name 'EstimatedSize' -Value $sizeKb -Type DWord
}

if (-not (Test-Path -LiteralPath $StartMenuLnk)) {
  Write-Error "The Start menu shortcut was not created: $StartMenuLnk"
  exit 1
}
Write-Host "Start menu shortcut: $StartMenuLnk"
Write-Host "Program:             $ExePath"
exit 0
