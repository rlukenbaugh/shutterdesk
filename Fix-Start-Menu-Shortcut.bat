@echo off
setlocal EnableDelayedExpansion
title Register ShutterDesk in Windows Start Menu

set "APP_NAME=ShutterDesk"
set "EXE_NAME=ShutterDesk.exe"
set "INSTALL_DIR=%LOCALAPPDATA%\Programs\%APP_NAME%"
set "START_MENU_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\%APP_NAME%.lnk"
set "DESKTOP_LNK=%USERPROFILE%\Desktop\%APP_NAME%.lnk"
set "FOUND_EXE="

echo ============================================================
echo   %APP_NAME% - Windows Start Menu Shortcut & Launch Helper
echo ============================================================
echo.

if exist "%INSTALL_DIR%\%EXE_NAME%" set "FOUND_EXE=%INSTALL_DIR%\%EXE_NAME%"
if not defined FOUND_EXE if exist "%ProgramFiles%\%APP_NAME%\%EXE_NAME%" set "FOUND_EXE=%ProgramFiles%\%APP_NAME%\%EXE_NAME%"
if not defined FOUND_EXE if exist "%~dp0%EXE_NAME%" set "FOUND_EXE=%~dp0%EXE_NAME%"
if not defined FOUND_EXE if exist "%~dp0native-csharp\%EXE_NAME%" set "FOUND_EXE=%~dp0native-csharp\%EXE_NAME%"
if not defined FOUND_EXE if exist "%~dp0dist\win-unpacked\%EXE_NAME%" set "FOUND_EXE=%~dp0dist\win-unpacked\%EXE_NAME%"

if not defined FOUND_EXE (
  echo Could not automatically locate %EXE_NAME%.
  echo Please paste the full path to %EXE_NAME% ^(or drag and drop it here^) and press Enter:
  set /p FOUND_EXE=Path: 
  set "FOUND_EXE=!FOUND_EXE:"=!"
)

if not exist "!FOUND_EXE!" (
  echo.
  echo [ERROR] File not found: "!FOUND_EXE!"
  echo Run BUILD-WINDOWS-EXE.bat or native-csharp\INSTALL-NATIVE-SHUTTERDESK.bat first.
  pause
  exit /b 1
)

if /I not "!FOUND_EXE!"=="%INSTALL_DIR%\%EXE_NAME%" (
  echo [1/3] Ensuring %APP_NAME% is installed in %INSTALL_DIR%...
  if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
  if /I "!FOUND_EXE!"=="%~dp0native-csharp\%EXE_NAME%" (
    copy /Y "!FOUND_EXE!" "%INSTALL_DIR%\%EXE_NAME%" >nul
    set "TARGET_EXE=%INSTALL_DIR%\%EXE_NAME%"
  ) else (
    set "TARGET_EXE=!FOUND_EXE!"
  )
) else (
  set "TARGET_EXE=!FOUND_EXE!"
)

echo [2/3] Creating Start Menu shortcut & Windows App Path registration...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut('%START_MENU_LNK%'); " ^
  "$s.TargetPath = '!TARGET_EXE!'; " ^
  "$s.WorkingDirectory = Split-Path '!TARGET_EXE!'; " ^
  "$s.Description = '%APP_NAME% Screen Capture & Recorder'; " ^
  "$s.Save(); " ^
  "$d = $ws.CreateShortcut('%DESKTOP_LNK%'); $d.TargetPath = '!TARGET_EXE!'; $d.WorkingDirectory = Split-Path '!TARGET_EXE!'; $d.Save();"

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\%EXE_NAME%" /ve /d "!TARGET_EXE!" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\%EXE_NAME%" /v "Path" /d "%INSTALL_DIR%" /f >nul 2>&1

echo.
echo [3/3] Done! %APP_NAME% is now registered in Windows Start Menu:
echo   Shortcut: %START_MENU_LNK%
echo   App Path: !TARGET_EXE!
echo.
echo Launching %APP_NAME% now...
start "" "!TARGET_EXE!"
echo Press Start and type "%APP_NAME%" anytime to open it.
pause
