@echo off
setlocal
title Installing ShutterDesk v1.0.0 (Zero Dependencies)

set "APP_NAME=ShutterDesk"
set "EXE_NAME=ShutterDesk.exe"
set "INSTALL_DIR=%LOCALAPPDATA%\Programs\%APP_NAME%"
set "START_MENU_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\%APP_NAME%.lnk"
set "DESKTOP_LNK=%USERPROFILE%\Desktop\%APP_NAME%.lnk"

set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" (
  set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
)

if not exist "%CSC%" (
  echo [ERROR] Built-in Windows .NET Framework C# compiler not found.
  pause
  exit /b 1
)

echo [1/4] Compiling %EXE_NAME% using built-in Windows .NET compiler...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

"%CSC%" /target:winexe /optimize+ /out:"%INSTALL_DIR%\%EXE_NAME%" ^
  /reference:System.Windows.Forms.dll ^
  /reference:System.Drawing.dll ^
  "%~dp0ShutterDeskNative.cs"

if errorlevel 1 (
  echo [ERROR] Compilation failed.
  pause
  exit /b 1
)

echo [2/4] Registering Start Menu and Desktop shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut('%START_MENU_LNK%'); $s.TargetPath = '%INSTALL_DIR%\%EXE_NAME%'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Description = '%APP_NAME% Screen Capture'; $s.Save(); " ^
  "$d = $ws.CreateShortcut('%DESKTOP_LNK%'); $d.TargetPath = '%INSTALL_DIR%\%EXE_NAME%'; $d.WorkingDirectory = '%INSTALL_DIR%'; $d.Save();"

echo [3/4] Registering Windows Start Search App Path & Uninstaller...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\%EXE_NAME%" /ve /d "%INSTALL_DIR%\%EXE_NAME%" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\%EXE_NAME%" /v "Path" /d "%INSTALL_DIR%" /f >nul 2>&1


(
  echo @echo off
  echo taskkill /F /IM "%EXE_NAME%" ^>nul 2^>^&1
  echo del /F /Q "%START_MENU_LNK%" ^>nul 2^>^&1
  echo del /F /Q "%DESKTOP_LNK%" ^>nul 2^>^&1
  echo reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\%EXE_NAME%" /f ^>nul 2^>^&1
  echo reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "%APP_NAME%" /f ^>nul 2^>^&1
  echo rmdir /S /Q "%INSTALL_DIR%"
  echo echo %APP_NAME% uninstalled.
  echo pause
) > "%INSTALL_DIR%\Uninstall-ShutterDesk.bat"

echo.
echo [4/4] Installation complete!
echo   Installed App:      %INSTALL_DIR%\%EXE_NAME%
echo   Start Menu Entry:   %START_MENU_LNK%
echo.
echo You can now press Windows Start and type "%APP_NAME%" anytime.
echo Launching %APP_NAME%...
start "" "%INSTALL_DIR%\%EXE_NAME%"
pause
