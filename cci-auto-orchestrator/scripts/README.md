# Scripts / 실행 스크립트

## 폴더 구조

### 🔌 tunnel/
공개 터널 관리 스크립트

- **start_public_tunnel.ps1**: 공개 터널 시작 (ngrok → serveo 자동 폴백)
- **get_public_tunnel_url.ps1**: 현재 활성 공개 URL 조회

**실행 예:**
```powershell
.\scripts\tunnel\start_public_tunnel.ps1 -Provider ngrok
.\scripts\tunnel\get_public_tunnel_url.ps1
```

### 🖥️ server/
로컬 서버 관리 스크립트

- **smoke_server_check.ps1**: 서버 헬스 체크 및 시작
- **start_server.ps1**: 서버 시작

**실행 예:**
```powershell
.\scripts\server\smoke_server_check.ps1 -HostAddr 127.0.0.1 -Port 8000
```

### ⚙️ management/
기기 및 시스템 관리 스크립트

- **auto_detect_devices.ps1**: 기기 자동 감지
- **setup_autostart.ps1**: 자동 시작 설정

### 📦 archive/
사용 중단된 또는 레거시 스크립트

- start_all.ps1
- start_agent.ps1
- run_all.bat

## 주요 진입점

### 빠른 시작
```bash
# 터널 + 서버 모두 시작
.\START_PUBLIC_URL.bat
```

### 개별 실행
```powershell
# 1. 터널만 시작
.\scripts\tunnel\start_public_tunnel.ps1
```

## 참고사항
- 모든 PowerShell 스크립트는 ExecutionPolicy: Bypass 필요
- 한글 경로 지원: UTF8 인코딩 사용
