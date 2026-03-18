@echo off
cd /d "%~dp0"
start "CCI Public URL" powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\start_public_tunnel.ps1 -Provider ngrok -NgrokDomain unshirred-examiningly-kyoko.ngrok-free.dev -LocalPort 8000 -StopExisting
exit /b 0
