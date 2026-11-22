; Inno Setup script for the native edition of ShutterDesk.
;
; Produces dist\ShutterDesk-Native-Setup-1.1.0.exe, a normal Windows installer (per user, no
; administrator rights) with a Start menu shortcut and an entry in Settings > Apps.
;
; Build it in this order (the GitHub workflow does exactly this):
;   1. Compile native-csharp\ShutterDeskNative.cs to native-csharp\build\ShutterDesk.exe
;      (see the "Build native exe" step in .github\workflows\build-windows-exe.yml)
;   2. iscc installer\ShutterDesk.iss
;
; The old script copied the exe from "%LOCALAPPDATA%\Programs\ShutterDesk", but Inno Setup does
; not expand %VARIABLES%, so it never compiled.

#define MyAppName "ShutterDesk"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "ShutterDesk Studio"
#define MyAppExeName "ShutterDesk.exe"

[Setup]
; A fixed GUID identifies the app across upgrades. Do not change it.
AppId={{6F5B2A3E-8C1D-4E7A-9B0F-2D4C6E8A1B3F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=ShutterDesk-Native-Setup-{#MyAppVersion}
SetupIconFile=..\assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "..\native-csharp\build\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; {autoprograms} is the current user's Start menu "Programs" folder for a per-user install.
; This is the shortcut Windows Start search finds.
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; AppUserModelID: "com.shutterdesk.capture"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; Lets Win+R "ShutterDesk" start the app.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\{#MyAppExeName}"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\{#MyAppExeName}"; ValueType: string; ValueName: "Path"; ValueData: "{app}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Start {#MyAppName}"; Flags: nowait postinstall skipifsilent
