@echo off
setlocal
title Building ShutterDesk Windows Installer (.exe)

echo ============================================================
echo   ShutterDesk v1.0.0 - Windows .exe Installer Builder
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is required to compile the Electron NSIS installer.
  echo Download Node.js LTS from https://nodejs.org/ and re-run this script.
  echo.
  echo TIP: Want a zero-dependency .exe installed to your Start Menu right now?
  echo Run: native-csharp\INSTALL-NATIVE-SHUTTERDESK.bat
  pause
  exit /b 1
)

echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Compiling Windows NSIS installer (ShutterDesk-Setup-1.0.0.exe)...
call npm run dist:win
if errorlevel 1 (
  echo [ERROR] electron-builder failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Build complete!
echo Installer location: %~dp0dist\ShutterDesk-Setup-1.0.0.exe
echo After running the installer, press Start and type "ShutterDesk" to launch it.
explorer "%~dp0dist"
pause
