@echo off
cd /d "%~dp0"
start "CCI Auto Starter" powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\start_all.ps1 -HostAddr 0.0.0.0 -Port 8000
exit /b 0
