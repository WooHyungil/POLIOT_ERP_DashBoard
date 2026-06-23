@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

if "%~1" neq "elevated" (
    net session >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo 관리자 권한이 필요합니다. UAC 창이 나타납니다...
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'elevated' -Verb RunAs"
        exit /b
    )
)

echo.
echo ============================================
echo 폴리엇 대시보드 서버 및 터널 시작
echo ============================================
echo.

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%"
set "VENV_PATH=%PROJECT_ROOT%.venv"
set "PYTHON_EXE=%VENV_PATH%\Scripts\python.exe"
set "PUBLIC_FILE=%PROJECT_ROOT%runtime\public_url.txt"
set "LOG_FILE=%PROJECT_ROOT%server_startup.log"

REM Python 경로 확인
if not exist "%PYTHON_EXE%" (
    echo [오류] Python 실행 파일을 찾을 수 없습니다: %PYTHON_EXE%
    echo.
    echo 가상환경이 없는 것 같습니다. 다음 명령을 먼저 실행하세요:
    echo cd "%PROJECT_ROOT%"
    echo python -m venv .venv
    echo .venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo [OK] Python 경로: %PYTHON_EXE%

REM 방화벽 규칙 추가
echo.
echo [진행 중] 방화벽 규칙을 추가합니다...
netsh advfirewall firewall add rule name="CCI Dashboard 8000" dir=in action=allow protocol=TCP localport=8000 profile=Private,Domain >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] 방화벽 규칙 추가 완료
) else (
    echo [경고] 방화벽 규칙 추가 실패 (무시)
)

REM IP 주소 설정
echo.
echo [진행 중] 로컬 IP 주소를 확인합니다...
set "IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /R "IPv4" ^| findstr /V "169\.254"') do (
    set "line=%%A"
    set "line=!line:~1!"
    if not defined IP set "IP=!line!"
)
if not defined IP set "IP=192.168.1.62"
echo http://!IP!:8000 > "%PUBLIC_FILE%"
echo [OK] 로컬 IP: !IP!:8000

REM 서버 시작 (에러 로깅)
echo.
echo [진행 중] 서버를 시작합니다...
echo [%date% %time%] 서버 시작 시도 >> "%LOG_FILE%"

REM 새 cmd 창에서 서버 실행 (에러를 화면에 표시하도록)
start "CCI Dashboard Server" cmd /k ^
    "cd /d "%PROJECT_ROOT%" && ^
    "%PYTHON_EXE%" -m uvicorn server.app.main:app --host 0.0.0.0 --port 8000 2>&1 && ^
    pause"

echo.
echo ============================================
echo 서버 정보
echo ============================================
echo LAN URL: http://!IP!:8000
echo 로컬 URL: http://localhost:8000
echo public_url 파일: "%PUBLIC_FILE%"
echo 로그 파일: "%LOG_FILE%"
echo.
echo 이 창을 닫아도 서버는 계속 실행됩니다.
echo 서버를 중지하려면 서버 창을 닫으세요.
echo.
pause