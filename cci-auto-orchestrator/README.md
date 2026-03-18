# CCI 자동화 UI 테스트 오케스트레이터 (Windows MVP)

이 프로젝트는 다음을 제공합니다.
- 중앙 서버 + 대시보드 UI
- 엑셀 테스트케이스 업로드(비동기) + AI 기반 변환
- Android/iOS 단말 에이전트 병렬 실행
- 실행 횟수 설정, 원클릭 시작
- 실패 이슈 자동 수집/리포트 생성
- 단말 이름 설정 및 상태 모니터링
- 공개 터널 (ngrok ↔ serveo 자동 폴백)

---

## 📁 프로젝트 구조

```
cci-auto-orchestrator/
├── config/                 # ⚙️ 설정 파일
│   ├── core/              # 핵심 설정 (사용자, 회사, 직원)
│   ├── devices/           # 기기 설정 및 정보
│   ├── samples/           # 테스트 샘플 데이터
│   └── README.md          # 설정 파일 가이드
│
├── scripts/               # 🔧 실행 스크립트
│   ├── tunnel/           # 공개 터널 관리
│   ├── server/           # 로컬 서버 관리
│   ├── management/       # 기기 및 시스템 관리
│   ├── archive/          # 레거시 스크립트
│   └── README.md         # 스크립트 가이드
│
├── server/               # 🖥️ FastAPI 웹 서버
│   ├── app/              # 핵심 애플리케이션 (main.py, models.py 등)
│   ├── static/           # 정적 파일 (CSS, JS)
│   ├── templates/        # HTML 템플릿 (대시보드)
│   ├── db/               # 데이터베이스 (자동 생성)
│   ├── artifacts/        # 생성된 파일들 (자동 생성)
│   ├── exports/          # 내보내기 파일 (자동 생성)
│   ├── reports/          # 테스트 리포트 (자동 생성)
│   └── uploads/          # 업로드 파일 (자동 생성)
│
├── runtime/              # 🔄 런타임 상태 파일 (자동 생성)
│   ├── *.log             # 실행 로그
│   ├── public_url.txt    # 현재 공개 URL
│   └── *.json            # 상태 정보
│
├── agent/                # 🤖 자동화 에이전트
│   └── device_agent.py  # 기기 제어 에이전트
│
├── tools/                # 🛠️ 유틸리티
│   └── smoke_rbac_test.py # RBAC 테스트
│
├── .vscode/              # VS Code 설정
│   └── tasks.json        # 자동화 작업
│
├── .venv/                # Python 가상 환경
│
└── START_PUBLIC_URL.bat   # 🚀 공개 URL 시작 (권장)
```

---

## 🚀 빠른 시작

### 가장 간단한 방법
```bash
# 1. 더블클릭으로 실행
START_PUBLIC_URL.bat
```

### 수동 제어
```powershell
# 1. 공개 터널만 시작
.\scripts\tunnel\start_public_tunnel.ps1

# 2. 공개 URL 확인
.\scripts\tunnel\get_public_tunnel_url.ps1

# 3. 서버 헬스 체크
.\scripts\server\smoke_server_check.ps1
```

---

## 1. 사전 준비
- Python 3.10+
- Node.js (Appium 서버 실행용)
- Appium 설치
  - `npm install -g appium`
  - Android: `appium driver install uiautomator2`
  - iOS: `appium driver install xcuitest`

## 2. 서버 실행

### 방법 1: 자동 시작 (권장)
```bash
START_PUBLIC_URL.bat 더블클릭
```
→ 자동으로 터널 + 서버 시작

### 방법 2: VS Code 작업 사용
1. Ctrl+Shift+P → "Tasks: Run Task" 선택
2. 다음 중 선택:
   - "Smoke Check (Server + Public URL)" - 서버 + 공개 URL 확인
   - "Start Public URL (Auto Fallback)" - 공개 터널 시작

## 화면 구성 (분리 운영)
- `http://127.0.0.1:8000/` : 개요 (단말/이슈/요약)
- `http://127.0.0.1:8000/excel` : 엑셀 센터 (업로드, AI 변환, 원본 23컬럼 미리보기)
- `http://127.0.0.1:8000/live` : 라이브 모니터 (실행 제어, 실시간 진행)

엑셀 센터 추가 기능:
- 변환 후 `TODO` 미해결 목록 자동 표시
- 규칙 제안 자동 생성(자주 등장하는 TODO 키 기반)
- 변환 파일 다운로드 링크 제공

## 3. Appium 실행 (단말별)
예시 Android 단말 1:
```powershell
appium -p 4723
```

예시 iOS 단말 1 (Mac 환경):
```powershell
appium -p 4725
```

Windows 노트북에서 iOS를 사용할 때:
- iOS 자동화 서버(Appium + XCUITest)는 보통 Mac에서 실행해야 합니다.
- 이 경우 `config/devices.json`에 iOS 단말별 `appiumUrl`(예: `http://192.168.0.10:4725`)을 설정하세요.
- `start_all.ps1`는 iOS에 `appiumUrl`이 있으면 원격 서버를 사용하고, 없으면 Windows에서 iOS를 자동 스킵합니다.

## 4. 단말 에이전트 실행 (단말마다 1개)
Android 예시:
```powershell
cd "c:\Users\poliot\OneDrive\바탕 화면\자동화 프로그램\cci-auto-orchestrator"
.\scripts\start_agent.ps1 -DeviceId "a01" -Name "Galaxy_S24" -Platform android -AppiumUrl "http://127.0.0.1:4723" -Udid "ANDROID_UDID"
```

iOS 예시:
```powershell
cd "c:\Users\poliot\OneDrive\바탕 화면\자동화 프로그램\cci-auto-orchestrator"
.\scripts\start_agent.ps1 -DeviceId "i01" -Name "iPhone_15" -Platform ios -AppiumUrl "http://127.0.0.1:4725" -Udid "IOS_UDID"
```

자동 시작 설정 파일:
- `config/devices.json`
- 단말명, platform, udid, appiumPort, enabled 설정
- 선택: `appiumUrl` (원격 Appium 서버 주소, iOS 권장)
- 필요 시 `scripts/auto_detect_devices.ps1` 단독 실행으로 감지 결과 갱신 가능
- Android 자동 감지는 `platform=android` 항목만 갱신하고, iOS 항목은 유지됩니다.
- iOS 예시 설정: `config/devices.ios.sample.json`

## 5. 엑셀 업로드 및 실행 (권장 프로세스)
1. `엑셀 센터(/excel)`에서 파일 업로드
2. 업로드가 즉시 Job으로 접수되고 `AI 변환` 진행률이 표시됨
3. 변환 완료 후 원본 엑셀 23컬럼(A~W) 테이블 확인
4. `라이브 모니터(/live)`에서 실행 횟수/OS 설정 후 시작
5. 진행 현황/이슈를 실시간 확인
6. 완료 후 결과 엑셀 내보내기 (O/P/Q + 사유)

## 6. 원본 엑셀 컬럼 매핑 (Control 시트)
- 시작 행: `21`
- `B`: TC_ID (비어있으면 공란 허용)
- `C`: 카테고리
- `D`: 대분류
- `E`: 중분류
- `F`: 소분류
- `J`: App 동작조건
- `K`: 차량 동작조건
- `L`: 테스트 절차
- `M`: 기대결과
- `O`: 두 OS 종합 결과
- `P`: Android 결과
- `Q`: iOS 결과
- 결과 상태: `PASS`, `FAIL`, `N/T`

추가 지원:
- 현재 제공하신 대형 매트릭스 엑셀(`TC ID`, `TC Procedure`, `Expected Result`)도 자동 파싱됩니다.
- 이 포맷은 상세 locator/동작 정보가 없어 `note` 타입으로 로드됩니다.
- 실제 UI 자동 조작까지 하려면 구조화 컬럼 포맷(위 권장 컬럼)으로 점진 변환을 권장합니다.

자동 변환 규칙:
- 파일: `config/conversion_rules.json`
- `contains` 문구가 `TC Procedure`에 포함되면 action/target/locator/value 자동 매핑
- 매핑되지 않은 click/input은 `TODO_TARGET`으로 표기되며 변환 결과에 `unresolved` 개수로 표시

## 7. 참고
- 앱은 단말에서 이미 실행 중이라는 조건으로 `noReset=true`로 동작합니다.
- 실패 시 스크린샷이 `server/artifacts/`에 저장되고 대시보드 이슈에서 링크로 열 수 있습니다.
- Run 완료 시 `server/reports/`에 HTML 리포트가 생성되고 대시보드에서 바로 열 수 있습니다.
