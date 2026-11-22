@echo off
setlocal EnableDelayedExpansion
title Add ShutterDesk to the Windows Start menu

rem Finds an existing ShutterDesk.exe and (re)creates its Start menu shortcut.
rem Use this only if ShutterDesk is installed but does not appear when you search in Start.

set "APP_NAME=ShutterDesk"
set "EXE_NAME=ShutterDesk.exe"
set "REGISTER=%~dp0tools\Register-ShutterDesk.ps1"
set "FOUND_EXE="

echo ============================================================
echo   %APP_NAME% - Start menu shortcut repair
echo ============================================================
echo.

if not exist "%REGISTER%" (
  echo [ERROR] Missing %REGISTER%
  echo Unzip the whole ShutterDesk folder before running this file.
  pause
  exit /b 1
)

rem Installed locations first (the Electron installer uses the lower-case folder name, which
rem is the same folder on Windows), then build output inside this folder.
for %%P in (
  "%LOCALAPPDATA%\Programs\%APP_NAME%\%EXE_NAME%"
  "%ProgramFiles%\%APP_NAME%\%EXE_NAME%"
  "%~dp0dist\win-unpacked\%EXE_NAME%"
) do (
  if not defined FOUND_EXE if exist "%%~P" set "FOUND_EXE=%%~P"
)

if not defined FOUND_EXE (
  echo Could not find %EXE_NAME% automatically.
  echo Drag %EXE_NAME% into this window ^(or paste its full path^) and press Enter:
  set /p "FOUND_EXE=Path: "
  set "FOUND_EXE=!FOUND_EXE:"=!"
)

if not defined FOUND_EXE goto :notfound
if not exist "!FOUND_EXE!" goto :notfound

rem (A pipe to findstr would not see !variables!, so compare with the folder removed instead.)
set "WITHOUT_DIST=!FOUND_EXE:\dist\win-unpacked\=!"
if /I not "!WITHOUT_DIST!"=="!FOUND_EXE!" (
  echo [WARNING] This copy is the unpacked build output, not an installed app.
  echo           The shortcut will stop working if you delete or rebuild the dist folder.
  echo           Running dist\ShutterDesk-Setup-*.exe is the better fix.
  echo.
)

echo Creating the Start menu shortcut for:
echo   !FOUND_EXE!
powershell -NoProfile -ExecutionPolicy Bypass -File "%REGISTER%" -ExePath "!FOUND_EXE!"
if errorlevel 1 (
  echo [ERROR] The shortcut could not be created. See the message above.
  pause
  exit /b 1
)

echo.
echo Done. Press the Windows key and type "%APP_NAME%" to open it.
start "" "!FOUND_EXE!"
pause
exit /b 0

:notfound
echo.
echo [ERROR] %EXE_NAME% was not found.
echo Install ShutterDesk first: run dist\ShutterDesk-Setup-*.exe, or
echo native-csharp\INSTALL-NATIVE-SHUTTERDESK.bat for the version that needs no downloads.
pause
exit /b 1
