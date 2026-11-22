@echo off
setlocal
title Installing ShutterDesk (native edition, no downloads needed)

rem Builds ShutterDesk.exe with the C# compiler that is part of Windows, installs it for the
rem current user in %LOCALAPPDATA%\Programs\ShutterDesk, and adds it to the Start menu and to
rem Settings ^> Apps. No administrator rights are needed.
rem
rem   INSTALL-NATIVE-SHUTTERDESK.bat           normal install, opens ShutterDesk at the end
rem   INSTALL-NATIVE-SHUTTERDESK.bat /quiet    no pauses and does not start the app (for scripts)

set "QUIET="
if /I "%~1"=="/quiet" set "QUIET=1"

set "APP_NAME=ShutterDesk"
set "APP_VERSION=1.1.0"
set "EXE_NAME=ShutterDesk.exe"
set "INSTALL_DIR=%LOCALAPPDATA%\Programs\%APP_NAME%"
set "BUILD_DIR=%TEMP%\ShutterDesk-build-%RANDOM%"
set "SRC=%~dp0ShutterDeskNative.cs"
set "ICON=%~dp0..\assets\icon.ico"
set "REGISTER=%~dp0..\tools\Register-ShutterDesk.ps1"

set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo [ERROR] The C# compiler that comes with Windows ^(.NET Framework 4^) was not found.
  echo Turn on ".NET Framework 4.8 Advanced Services" in "Turn Windows features on or off".
  goto :fail
)
if not exist "%REGISTER%" (
  echo [ERROR] Missing %REGISTER%
  echo Unzip the whole ShutterDesk folder before running this file.
  goto :fail
)

set "ICON_ARG="
if exist "%ICON%" set "ICON_ARG=/win32icon:"%ICON%""

echo [1/4] Compiling %EXE_NAME%...
mkdir "%BUILD_DIR%" >nul 2>&1
"%CSC%" /nologo /target:winexe /optimize+ /out:"%BUILD_DIR%\%EXE_NAME%" %ICON_ARG% ^
  /reference:System.Windows.Forms.dll ^
  /reference:System.Drawing.dll ^
  "%SRC%"
if errorlevel 1 (
  echo [ERROR] Compilation failed. Nothing was installed.
  goto :fail
)

echo [2/4] Installing to %INSTALL_DIR%...
rem An older copy that is still running would block the file copy.
taskkill /IM "%EXE_NAME%" /F >nul 2>&1
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
copy /Y "%BUILD_DIR%\%EXE_NAME%" "%INSTALL_DIR%\%EXE_NAME%" >nul
if errorlevel 1 (
  echo [ERROR] Could not copy %EXE_NAME% to %INSTALL_DIR%.
  goto :fail
)
rmdir /S /Q "%BUILD_DIR%" >nul 2>&1
rem The old installer wrote this file; uninstalling now goes through Settings ^> Apps.
if exist "%INSTALL_DIR%\Uninstall-ShutterDesk.bat" del /F /Q "%INSTALL_DIR%\Uninstall-ShutterDesk.bat" >nul 2>&1

echo [3/4] Adding ShutterDesk to the Start menu, Start search and Settings ^> Apps...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REGISTER%" -ExePath "%INSTALL_DIR%\%EXE_NAME%" -RegisterUninstall -Version %APP_VERSION%
if errorlevel 1 (
  echo [ERROR] Registering the Start menu shortcut failed. See the message above.
  goto :fail
)

echo.
echo [4/4] Installation complete.
echo   Press the Windows key and type "%APP_NAME%" to open it any time.
echo   To uninstall: Settings ^> Apps ^> Installed apps ^> %APP_NAME% ^> Uninstall.
if defined QUIET exit /b 0
echo Starting %APP_NAME%...
start "" "%INSTALL_DIR%\%EXE_NAME%"
pause
exit /b 0

:fail
if exist "%BUILD_DIR%" rmdir /S /Q "%BUILD_DIR%" >nul 2>&1
if not defined QUIET pause
exit /b 1
