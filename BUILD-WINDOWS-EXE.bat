@echo off
setlocal
title Building the ShutterDesk Windows installer
cd /d "%~dp0"

echo ============================================================
echo   ShutterDesk - Windows installer builder
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is needed to build the full installer.
  echo Download Node.js LTS from https://nodejs.org/ and run this file again.
  echo.
  echo TIP: For the smaller version that needs no downloads, run
  echo      native-csharp\INSTALL-NATIVE-SHUTTERDESK.bat
  pause
  exit /b 1
)

echo [1/3] Installing build tools...
if exist package-lock.json (
  call npm ci
) else (
  call npm install
)
if errorlevel 1 (
  echo [ERROR] Installing the build tools failed. Check your internet connection.
  pause
  exit /b 1
)

echo.
echo [2/3] Building the installer...
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
call npm run dist:win
if errorlevel 1 (
  echo [ERROR] electron-builder failed.
  echo If the message above says "Cannot create symbolic link", turn on Developer Mode
  echo ^(Settings ^> System ^> For developers^) or run this file as administrator once.
  echo You can also build in the cloud: push to GitHub and download the installer from
  echo the "Build Windows Installer (.exe)" workflow run.
  pause
  exit /b 1
)

echo.
echo [3/3] Done.
for %%F in ("dist\ShutterDesk-Setup-*.exe") do echo Installer: %%~fF
echo Run the installer, then press the Windows key and type "ShutterDesk".
explorer "%~dp0dist"
pause
