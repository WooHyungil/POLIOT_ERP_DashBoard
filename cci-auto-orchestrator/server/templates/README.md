# Templates / HTML 대시보드 페이지

## 📍 사이드바 메뉴 구조

```
대시보드 (Dashboard)
├── 개요 (Overview)
│   └── overview.html - 서버 상태, URL 공유, 빠른 액션
│
├── 👤 사용자 (User)
│   ├── 로그인 (Login) - auth_login.html
│   ├── 회원가입 (Register) - auth_register.html
│   └── 마이페이지 (MyPage) - mypage.html
│
├── 🧪 테스트 (QA)
│   ├── 테스트 관리 (QA Dashboard) - qa_dashboard.html
│   ├── 결함 목록 (Defects) - qa_defectlist_editor.html
│   ├── 결함 상세 (Detail) - defects_detail.html
│   └── 엑셀 센터 (Excel) - excel_center.html
│
├── ⚙️ 관리 (Admin)
│   ├── 시스템 관리 (Manage) - manage.html
│   └── 관리자 (Admin Panel) - admin.html
│
└── 📋 정보 (Info)
    └── 도움말 (Help)
```

## 📄 페이지별 역할

| 파일명 | 경로 | 설명 |
|--------|------|------|
| **overview.html** | `/` | 🟢 대시보드 홈 - 서버 상태, 공개 URL, 크イック 액션 |
| **mypage.html** | `/mypage` | 👤 사용자 정보 및 설정 |
| **auth_login.html** | `/auth/login` | 🔐 로그인 페이지 |
| **auth_register.html** | `/auth/register` | 📝 회원가입 페이지 |
| **qa_dashboard.html** | `/qa` | 🧪 테스트 케이스 관리 |
| **qa_defectlist_editor.html** | `/defects` | 🐞 결함 목록 및 편집 |
| **defects_detail.html** | `/defects/:id` | 📌 결함 상세 정보 |
| **excel_center.html** | `/excel` | 📊 엑셀 업로드 센터 |
| **manage.html** | `/manage` | ⚙️ 시스템 관리 |
| **admin.html** | `/admin` | 🛡️ 관리자 패널 |

## 🎨 컴포넌트 (components/)

재사용 가능한 UI 컴포넌트 (Jinja2 매크로 또는 포함 파일)

```
components/
├── header.html - 상단 헤더
├── sidebar.html - 좌측 사이드바 메뉴
├── footer.html - 하단 푸터
├── navbar.html - 네비게이션 바
└── ...
```

## 💡 템플릿 작성 가이드

### 새 페이지 추가 시
1. `templates/` 폴더에 새 HTML 파일 생성
2. 기본 레이아웃 상속:
   ```html
   {% extends "base.html" %}
   
   {% block title %}페이지 제목{% endblock %}
   {% block content %}
   <!-- 페이지 내용 -->
   {% endblock %}
   ```

3. `app/main.py`에서 라우트 추가:
   ```python
   @app.get("/new-page")
   def new_page():
       return templates.TemplateResponse("new_page.html", {})
   ```

### 사이드바에 메뉴 추가
1. `components/sidebar.html` 수정
2. 새 메뉴 아이템 추가 및 경로 연결

## 🔄 현재 상태

✅ 완료:
- 기본 페이지 레이아웃
- 로그인/회원가입
- QA 테스트 관리
- 결함/엑셀/관리 화면

⏳ 개선 예정:
- 다크 모드 지원
- 반응형 디자인 개선
- 접근성 (a11y) 개선
- 국제화 (i18n) 지원

## 📱 사이드바 메뉴 추천 구조

```
┌─────────────────────┐
│     CCI 대시보드     │  (로고/제목)
├─────────────────────┤
│ 🏠 개요             │  ← 현재 페이지 하이라이트
│ 👤 마이페이지       │
├─────────────────────┤
│ 🧪 테스트           │
│   ├ 관리             │
│   ├ 결함             │
│   └ 엑셀             │
├─────────────────────┤
│ ⚙️ 관리             │
│   ├ 시스템           │
│   └ 관리자           │
├─────────────────────┤
│ 🔐 로그아웃          │
└─────────────────────┘
```
