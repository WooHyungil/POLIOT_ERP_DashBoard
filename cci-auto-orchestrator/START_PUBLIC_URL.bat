@echo off
cd /d "%~dp0"
start "CCI Server" powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\server\start_server.ps1 -HostAddr 0.0.0.0 -Port 8000
timeout /t 5 /nobreak >nul
start "CCI Public URL" powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel\start_public_tunnel.ps1 -Provider ngrok -NgrokDomain unshirred-examiningly-kyoko.ngrok-free.dev -LocalPort 8000 -StopExisting
exit /b 0
