@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Start watchdog + public tunnel (both background, no separate windows).
echo Starting CCI Server Watchdog (background mode)...
start "" powershell -WindowStyle Hidden -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\server\start_server_watchdog.ps1 -HostAddr 0.0.0.0 -Port 8000

timeout /t 2 /nobreak >nul

echo Starting CCI Tunnel Watchdog (background mode)...
start "" powershell -WindowStyle Hidden -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel\start_tunnel_watchdog.ps1 -Provider localtunnel -LocalPort 8000 -CheckIntervalSec 30 -ForceRefreshMinutes 240

timeout /t 3 /nobreak >nul
echo [✓] Both services started (running in background).
echo.
set "PUBLIC_URL_FILE=runtime\public_url.txt"
set "PUBLIC_URL="
for /f "usebackq delims=" %%i in ("%PUBLIC_URL_FILE%") do (
	set "PUBLIC_URL=%%i"
	goto :url_read_done
)
:url_read_done

echo Server + Tunnel Details:
echo   Local port: 8000
echo   Mode: Public watchdog (localtunnel primary + fallback chain)
echo   Access URL file: runtime\public_url.txt
if not "%PUBLIC_URL%"=="" (
	echo   Active URL: %PUBLIC_URL%
)
echo.
echo Monitoring:
echo   Watchdog log: runtime\server_watchdog.log
echo   Tunnel watchdog log: runtime\tunnel_watchdog.log
echo.
echo Press Ctrl+C to stop monitoring this window.
echo Services will continue running in background.
echo.
pause
