@echo off
cd /d "%~dp0.."
start "CCI All" powershell -NoLogo -NoProfile -NoExit -ExecutionPolicy Bypass -File .\scripts\start_all.ps1
echo Startup launched. Dashboard opens automatically.
pause
