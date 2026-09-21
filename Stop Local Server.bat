@echo off
setlocal
title Stop Dauntless Revived Local Server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\stop-local.ps1"
if errorlevel 1 pause
endlocal
@echo off