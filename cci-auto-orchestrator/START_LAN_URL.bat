@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Start watchdog-managed LAN server (background, no separate window).
echo Starting CCI LAN Watchdog (background mode)...
echo.
start "" powershell -WindowStyle Hidden -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\server\start_server_watchdog.ps1 -HostAddr 0.0.0.0 -Port 8000 -LanOnly -AllowedLanCidrs "192.168.0.0/16,10.0.0.0/8,172.16.0.0/12"

timeout /t 2 /nobreak >nul
echo [✓] Watchdog started (running in background).
echo.
echo Server Details:
echo   Port: 8000
echo   Mode: LAN Only (local network access)
echo   LAN IP: 192.168.x.x (your computer's LAN IP)
echo   URLs: http://YOUR_LAN_IP:8000/auth/login
echo.
echo Monitoring:
echo   Log file: runtime\server_watchdog.log
echo   State file: runtime\server_watchdog.state.json
echo.
echo Press Ctrl+C to stop this window (watchdog will continue running).
echo Or run the batch again to restart watchdog.
echo.
pause
