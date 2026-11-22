; Inno Setup Script for ShutterDesk
; Compile with Inno Setup (https://jrsoftware.org/isinfo.php) to create ShutterDesk-Setup-1.0.0.exe

#define MyAppName "ShutterDesk"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "ShutterDesk Studio"
#define MyAppExeName "ShutterDesk.exe"

[Setup]
AppId={{com.shutterdesk.capture}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=..\dist
OutputBaseFilename=ShutterDesk-Setup-1.0.0
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"
; Startup launch disabled

[Files]
Source: "%LOCALAPPDATA%\Programs\{#MyAppName}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon



[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
