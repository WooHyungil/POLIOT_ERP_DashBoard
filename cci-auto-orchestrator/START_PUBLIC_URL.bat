@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Start watchdog + public tunnel (both background, no separate windows).
echo Starting CCI Server Watchdog (background mode)...
start "" powershell -WindowStyle Hidden -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\server\start_server_watchdog.ps1 -HostAddr 0.0.0.0 -Port 8000

timeout /t 2 /nobreak >nul

echo Starting CCI Public Tunnel (background mode)...
start "" powershell -WindowStyle Hidden -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel\start_public_tunnel.ps1 -Provider ngrok -NgrokDomain unshirred-examiningly-kyoko.ngrok-free.dev -LocalPort 8000 -StopExisting

timeout /t 3 /nobreak >nul
echo [✓] Both services started (running in background).
echo.
echo Server + Tunnel Details:
echo   Local port: 8000
echo   Mode: Public (ngrok tunnel)
echo   Access: http://unshirred-examiningly-kyoko.ngrok-free.dev/auth/login
echo.
echo Monitoring:
echo   Watchdog log: runtime\server_watchdog.log
echo   Tunnel log: runtime\server_tunnel_startup.log
echo.
echo Press Ctrl+C to stop monitoring this window.
echo Services will continue running in background.
echo.
pause
