@echo off
setlocal
title Undaunted Launcher

echo Starting the local Dauntless server stack...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-local.ps1" -ServerOnly
if errorlevel 1 goto :failed

cd /d "%~dp0UndauntedLauncher"

if not exist "node_modules\.bin\electron-forge.cmd" (
  echo Installing launcher dependencies. This is only needed once...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto :failed
)

set "UNDAUNTED_METAGAME=127.0.0.1:61000"
call npm start
if errorlevel 1 (
  goto :failed
)
endlocal
exit /b 0

:failed
echo.
echo The Undaunted Launcher could not start. See the message above.
pause
endlocal
exit /b 1
