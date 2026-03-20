# Server / FastAPI 웹 애플리케이션

## 📁 구조

### app/
FastAPI 애플리케이션 핵심 모듈

- **main.py**: FastAPI 앱 진입점, 라우팅
- **models.py**: Pydantic 데이터 모델
- **orchestrator.py**: 테스트 오케스트레이션 로직
- **excel_parser.py**: 엑셀 파싱 및 변환
- **converter.py**: 테스트케이스 변환 로직
- **reporting.py**: 리포트 생성
- **builtin_cases.py**: 기본 제공 테스트케이스

### templates/
HTML 템플릿 (Jinja2)

**레이아웃:**
- 각 페이지는 독립적인 HTML 파일
- components/ 폴더에 재사용 가능한 UI 컴포넌트

**주요 페이지:**
- **overview.html**: 대시보드 홈 (URL 공유, 서버 상태)
- **qa_dashboard.html**: QA 테스트 관리
- **excel_center.html**: 엑셀 업로드 센터
- **manage.html**: 시스템 관리
- **admin.html**: 관리자 페이지
- **auth_login.html**: 로그인 페이지
- **auth_register.html**: 회원가입 페이지
- **defects_detail.html**: 결함 상세 정보
- **mypage.html**: 사용자 마이페이지

### static/
정적 자산

- CSS 파일
- JavaScript 파일
- 이미지 등

### db/
데이터베이스 파일 (자동 생성)

- SQLite 데이터베이스

### artifacts/
생성된 파일들 (자동 생성)

- a01/, a02/ - 아티팩트 저장소

### exports/
내보내기 결과 파일 (자동 생성)

- 리포트, 데이터 내보내기 등

### reports/
테스트 리포트 (자동 생성)

- HTML 리포트
- JSON 리포트

### uploads/
사용자 업로드 파일 (자동 생성)

- 엑셀 파일
- 기타 문서

---

## 🔗 주요 엔드포인트

| URL | 설명 |
|-----|------|
| `/` | 대시보드 홈 |
| `/auth/login` | 로그인 |
| `/qa` | QA 테스트 관리 |
| `/excel` | 엑셀 업로드 |
| `/manage` | 관리 페이지 |
| `/mypage` | 사용자 페이지 |
| `/defects` | 결함 목록 |

---

## ⚙️ 포트 및 설정

- **기본 포트**: 8000
- **호스트**: 127.0.0.1 (로컬) 또는 0.0.0.0 (공개)
- **공개 터널**: ngrok (기본) → serveo (폴백)

---

## 🚀 실행

```powershell
# 로컬 실행
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 공개 실행 (같은 네트워크)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 외부 접속 (공개 터널 사용, 별도 스크립트 필요)
.\scripts\tunnel\start_public_tunnel.ps1
```
