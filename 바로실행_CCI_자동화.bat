@echo off
set "ROOT=%~dp0cci-auto-orchestrator"
if not exist "%ROOT%\scripts\start_all.ps1" exit /b 1
start "CCI Auto Starter" powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\start_all.ps1" -HostAddr 0.0.0.0 -Port 8000
exit /b 0
