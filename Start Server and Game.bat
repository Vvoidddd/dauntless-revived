@echo off
setlocal
title Dauntless Revived - Local Server and Game
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-local.ps1" %*
if errorlevel 1 (
  echo.
  echo Dauntless Revived could not start. See the message above.
  pause
)
endlocal
