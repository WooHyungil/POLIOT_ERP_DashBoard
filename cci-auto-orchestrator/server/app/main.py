from __future__ import annotations

import shutil
import subprocess
import threading
import uuid
import importlib
import os
import socket
import time
import json
import re
import base64
import hashlib
from urllib.parse import quote, urlencode, urljoin, urlsplit, urlunsplit
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, Response, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner
from openpyxl import load_workbook
from openpyxl.styles import Alignment
from openpyxl.utils import get_column_letter, column_index_from_string
import pandas as pd
import requests

from .converter import convert_control_excel_to_structured, convert_matrix_excel_to_structured
from .builtin_cases import load_builtin_testcases
from .excel_parser import (
    CONTROL_SHEET_NAME,
    parse_control_sheet_full_rows,
    parse_control_sheet_rows,
    parse_excel_to_testcases,
)
from .models import Device
from .orchestrator import orchestrator

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR = BASE_DIR / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACT_DIR = BASE_DIR / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR = BASE_DIR / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_EXCEL = BASE_DIR.parent.parent / "Oneapp_EU_Full_TestCase v1.3.7_2603정업대응 평가결과.xlsx"
RULE_FILE = BASE_DIR.parent / "config" / "conversion_rules.json"
DEVICE_CONFIG_FILE = BASE_DIR.parent / "config" / "devices.json"
DEVICE_MEMORY_FILE = BASE_DIR.parent / "config" / "device_memory.json"
COMPANY_MEMBERS_FILE = BASE_DIR.parent / "config" / "company_members.json"
OVERVIEW_UPDATES_FILE = BASE_DIR.parent / "config" / "dashboard_updates.json"
OVERVIEW_UPDATE_STATE_FILE = BASE_DIR.parent / "config" / "dashboard_update_state.json"
USERS_FILE = BASE_DIR.parent / "config" / "users.json"
EMPLOYEES_FILE = BASE_DIR.parent / "config" / "employees.json"
LEGACY_USERS_FILE = BASE_DIR.parent / "config" / "core" / "users.json"
LEGACY_EMPLOYEES_FILE = BASE_DIR.parent / "config" / "core" / "employees.json"
ASSETS_FILE = BASE_DIR.parent / "config" / "assets.json"
MANAGE_SCHEDULES_FILE = BASE_DIR.parent / "config" / "manage_schedules.json"
GAME_SCORES_FILE = BASE_DIR.parent / "config" / "game_scores.json"
AUTH_LOCK = threading.RLock()

ADMIN_EMAILS = {
    "sue@poliot.co.kr",
    "hiss0723@poliot.co.kr",
}
GAME_ACCESS_MANAGER_EMAIL = "hiss0723@poliot.co.kr"

# Fixed shortcut URLs are configurable so production can point to the team's real Google Sheets.
GOOGLE_SHORTCUT_DEFECTLIST_URL = os.getenv(
    "GOOGLE_SHORTCUT_DEFECTLIST_URL",
    "https://docs.google.com/spreadsheets/d/1vEiIZM--JUzh7WYX8DLTqi8dysplrOY7n20nNT18eL8/edit?gid=407769955#gid=407769955",
).strip()
GOOGLE_SHORTCUT_FULL_TC_URL = os.getenv(
    "GOOGLE_SHORTCUT_FULL_TC_URL",
    "https://docs.google.com/spreadsheets/d/1UP6ruF4DlPwzNgVuEastRcxoky1SihNlsqIWMTIkQuI/edit?gid=529386068#gid=529386068&fvid=1436018023",
).strip()
GOOGLE_SHORTCUT_SANITY_URL = os.getenv(
    "GOOGLE_SHORTCUT_SANITY_URL",
    "https://docs.google.com/spreadsheets/d/11bv1DKhFLLIHXiq3JChsJrqoyU4BBats53-fVoteVxw/edit?gid=1196102142#gid=1196102142",
).strip()
GOOGLE_SHORTCUT_SPEC_URL = os.getenv(
    "GOOGLE_SHORTCUT_SPEC_URL",
    "https://docs.google.com/spreadsheets/d/1ldoiVk1mc3dwpFhK4zh0aV15YFtFyCYSmFr9A8Tp35s/edit?gid=636517542#gid=636517542",
).strip()
GOOGLE_SHORTCUT_ASSET_URL = os.getenv(
    "GOOGLE_SHORTCUT_ASSET_URL",
    "https://docs.google.com/spreadsheets/d/1anqfp6zx7PJrsUmvhqhiuvK4ptwCXX_Ilnl89WccfBI/edit?gid=301763855#gid=301763855",
).strip()
GOOGLE_SHORTCUT_SCHEDULE_URL = os.getenv(
    "GOOGLE_SHORTCUT_SCHEDULE_URL",
    "https://docs.google.com/spreadsheets/d/1QNRyS2gj4_QEigFiQGVaytGaISJjDF3e0N5C4Jf-v7k/edit?gid=0#gid=0",
).strip()
GOOGLE_SHORTCUT_ACCOUNT_URL = os.getenv(
    "GOOGLE_SHORTCUT_ACCOUNT_URL",
    "https://docs.google.com/spreadsheets/d/16jL3vexlJx0hav91Z603QGd-dJ34UjNpfapHASmoV3o/edit?gid=1838534105#gid=1838534105",
).strip()

REQUIRED_SHORTCUT_ITEMS = [
    {"id": "fixed-defectlist", "name": "[EU]_DefectList", "url": GOOGLE_SHORTCUT_DEFECTLIST_URL, "fixed": True},
    {"id": "fixed-fulltc", "name": "[EU]_Full_TC", "url": GOOGLE_SHORTCUT_FULL_TC_URL, "fixed": True},
    {"id": "fixed-sanity-check", "name": "[EU]_Sanity/Check", "url": GOOGLE_SHORTCUT_SANITY_URL, "fixed": True},
    {"id": "fixed-spec-sheet", "name": "[EU]_사양시트", "url": GOOGLE_SHORTCUT_SPEC_URL, "fixed": True},
    {"id": "fixed-asset-manage", "name": "[EU]_단말관리", "url": GOOGLE_SHORTCUT_ASSET_URL, "fixed": True},
    {"id": "fixed-schedule", "name": "[EU]_일정관리", "url": GOOGLE_SHORTCUT_SCHEDULE_URL, "fixed": True},
    {"id": "fixed-account", "name": "[EU]_계정관리", "url": GOOGLE_SHORTCUT_ACCOUNT_URL, "fixed": True},
]
REQUIRED_SHORTCUT_IDS = {str(x["id"]) for x in REQUIRED_SHORTCUT_ITEMS}

LAST_UPLOADED_EXCEL: Path | None = None
LAST_CONVERTED_EXCEL: Path | None = None
LATEST_EXCEL_HEADERS: list[str] = []
LATEST_EXCEL_ROWS: list[dict] = []
UPLOAD_JOBS: dict[str, dict] = {}
UPLOAD_LOCK = threading.Lock()
LIVE_SHOT_CACHE: dict[str, bytes] = {}
LIVE_SHOT_LOCK = threading.Lock()
LIVE_SHOT_CACHE_TS: dict[str, float] = {}
LIVE_SHOT_INFLIGHT: set[str] = set()
LIVE_SHOT_MIN_INTERVAL_SEC = 0.08
LIVE_SHOT_TIMEOUT_SEC = 3
LIVE_SHOT_BG_INTERVAL_SEC = 0.10
LIVE_SHOT_STALE_MAX_SEC = 1.2
LIVE_SHOT_WORKERS: set[str] = set()
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ADB_SYNC_LOCK = threading.Lock()
ADB_LAST_SYNC_TS = 0.0
ADB_SYNC_MIN_INTERVAL_SEC = 1.2
ADB_LAST_USED_PATH = ""
ADB_LAST_ERROR = ""
DEVICE_MEMORY_LOCK = threading.Lock()
DEVICE_MEMORY_CACHE: dict[str, dict] = {}
DEVICE_MEMORY_LOADED = False
GOOGLE_DEFECT_SHEET_URL = os.getenv(
    "GOOGLE_DEFECT_SHEET_URL",
    "https://docs.google.com/spreadsheets/d/1vEiIZM--JUzh7WYX8DLTqi8dysplrOY7n20nNT18eL8/edit?gid=1901079782#gid=1901079782",
)
DEFAULT_PUBLIC_SHARE_URL = os.getenv("DEFAULT_PUBLIC_SHARE_URL", "https://cci-dashboard.serveousercontent.com").strip()
GROUPWARE_BASE_URL = os.getenv("GROUPWARE_BASE_URL", "https://gw.poliot.co.kr").strip().rstrip("/")
GROUPWARE_LOGIN_PATH = "/groupware/login.php"
GROUPWARE_PROXY_PREFIX = "/groupware/proxy"
GROUPWARE_EMBED_PREFIX = "/groupware"
GROUPWARE_PROXY_TIMEOUT = (10, 60)
GROUPWARE_PROXY_LOCK = threading.Lock()
GROUPWARE_PROXY_SESSIONS: dict[str, requests.Session] = {}
GROUPWARE_ATTR_RE = re.compile(r'(?P<attr>\b(?:href|src|action|poster)\s*=\s*)(?P<quote>["\'])(?P<value>.*?)(?P=quote)', re.IGNORECASE)
GROUPWARE_CSS_URL_RE = re.compile(r'url\((?P<quote>["\']?)(?P<value>.*?)(?P=quote)\)', re.IGNORECASE)
GROUPWARE_CSS_IMPORT_RE = re.compile(r'@import\s+(?P<quote>["\'])(?P<value>.*?)(?P=quote)', re.IGNORECASE)
GOOGLE_DEFECT_SHEET_NAME = os.getenv("GOOGLE_DEFECT_SHEET_NAME", "DefectList_Raw")
GOOGLE_DEFECT_SHEET_RANGE = os.getenv("GOOGLE_DEFECT_SHEET_RANGE", "B2:R")
GOOGLE_DEFECTLIST_SHEET_NAME = os.getenv("GOOGLE_DEFECTLIST_SHEET_NAME", "DefectList")
GOOGLE_DEFECTLIST_HEADER_RANGE = os.getenv("GOOGLE_DEFECTLIST_HEADER_RANGE", "B17:Z17")
GOOGLE_DEFECTLIST_DATA_RANGE = os.getenv("GOOGLE_DEFECTLIST_DATA_RANGE", "B18:Z")
UPLOADED_DEFECT_RAW_FILE = UPLOAD_DIR / "defectlist_raw_uploaded.xlsx"
UPLOADED_FULL_TC_FILE = UPLOAD_DIR / "full_tc_uploaded.xlsx"
DEFECT_RAW_UPLOAD_HISTORY_FILE = UPLOAD_DIR / "defectlist_raw_upload_history.json"
DEFECT_RAW_UPLOAD_HISTORY_LOCK = threading.Lock()
MAX_DEFECT_RAW_UPLOAD_HISTORY = 50
GOOGLE_RAW_STATUS_RANGE = os.getenv("GOOGLE_RAW_STATUS_RANGE", "B2:R")
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
GOOGLE_DEFECT_CACHE_TTL_SEC = max(20.0, float(os.getenv("GOOGLE_DEFECT_CACHE_TTL_SEC", "90")))
GOOGLE_DEFECT_API_KEY = os.getenv("GOOGLE_SHEETS_API_KEY", "").strip()
GOOGLE_DEFECT_CACHE_LOCK = threading.Lock()
GOOGLE_DEFECT_CACHE_TS = 0.0
GOOGLE_DEFECT_CACHE_DATA: dict = {}
GOOGLE_TEAM_DEFECT_RANGE = os.getenv("GOOGLE_TEAM_DEFECT_RANGE", "B5:R")
COMPANY_DEFECT_CACHE_LOCK = threading.Lock()
COMPANY_DEFECT_CACHE_TS = 0.0
COMPANY_DEFECT_CACHE_DATA: dict = {}
GOOGLE_DEFECT_CACHE_FETCHING = False
COMPANY_DEFECT_CACHE_FETCHING = False
RAW_DEFECT_ISSUES_CACHE_LOCK = threading.Lock()
RAW_DEFECT_ISSUES_CACHE_TS = 0.0
RAW_DEFECT_ISSUES_CACHE_DATA: dict = {}
RAW_DEFECT_ISSUES_CACHE_FETCHING = False
# Raw row cache for DefectList editor (B17 header + B18:Z data)
DEFECTLIST_ROWS_CACHE_LOCK = threading.Lock()
DEFECTLIST_ROWS_CACHE_TS = 0.0
DEFECTLIST_ROWS_CACHE_DATA: dict = {}
DEFECTLIST_ROWS_CACHE_FETCHING = False
OVERVIEW_UPDATE_LOCK = threading.Lock()
FULL_TC_APPS_SCRIPT_ID = os.getenv(
    "FULL_TC_APPS_SCRIPT_ID",
    "AKfycbzh3q2RuP2jjlTi8PiFKv6fUqHNx7Mcm_Sh0qmIkhFk88ZeWTSgtBHX_lwVAuwan3njRQ",
).strip()
FULL_TC_APPS_SCRIPT_URL = os.getenv(
    "FULL_TC_APPS_SCRIPT_URL",
    "https://script.google.com/macros/s/AKfycbzh3q2RuP2jjlTi8PiFKv6fUqHNx7Mcm_Sh0qmIkhFk88ZeWTSgtBHX_lwVAuwan3njRQ/exec",
).strip()
FULL_TC_FALLBACK_SHEETS = [
    str(x).strip()
    for x in os.getenv(
        "FULL_TC_FALLBACK_SHEETS",
        "Statistics,Control,Map,My Car,Handle Layer / Home,Widget,Watch,Common",
    ).split(",")
    if str(x).strip()
]
FULL_TC_REALTIME_SHEETS = {
    str(x).strip()
    for x in os.getenv(
        "FULL_TC_REALTIME_SHEETS",
        "Statistics,Control,Map,My Car,Handle Layer / Home,Widget,Watch,Common",
    ).split(",")
    if str(x).strip()
}
FULL_TC_SHEET_LIST_TTL_SEC = max(10.0, float(os.getenv("FULL_TC_SHEET_LIST_TTL_SEC", "120")))
FULL_TC_REALTIME_CACHE_TTL_SEC = max(2.0, float(os.getenv("FULL_TC_REALTIME_CACHE_TTL_SEC", "4")))
FULL_TC_NORMAL_CACHE_TTL_SEC = max(10.0, float(os.getenv("FULL_TC_NORMAL_CACHE_TTL_SEC", "60")))
FULL_TC_CACHE_LOCK = threading.Lock()
FULL_TC_SHEET_LIST_CACHE: dict = {"ts": 0.0, "data": None}
FULL_TC_SHEET_DATA_CACHE: dict[str, dict] = {}
COMPANY_DEFAULT_MEMBERS = [
    "장수경/협력사",
    "이도권/협력사",
    "공우빈/협력사",
    "한근희/협력사",
    "지민우/협력사",
    "전도훈/협력사",
    "유승훈/협력사",
    "김희영/협력사",
    "우형일/협력사",
    "김희경/협력사",
    "나덕윤/협력사",
    "이주원/협력사",
    "이지연/협력사",
    "김준/협력사",
    "윤지은/협력사",
]
SEVERITY_SCORE = {
    "highest": 2.0,
    "high": 1.8,
    "medium": 1.6,
    "low": 1.4,
    "lowest": 1.2,
}

app = FastAPI(title="CCI Automation Orchestrator")
APP_SESSION_SECRET = os.getenv("CCI_SESSION_SECRET", "cci-dashboard-session-secret-2026").strip()
SESSION_IDLE_TIMEOUT_SECONDS = 60 * 60 * 1        # 유휴 1시간 → 자동 로그아웃
SESSION_MAX_AGE_SECONDS = 60 * 60 * 2             # 쿠키 최대 수명 2시간 (heartbeat가 주기적으로 갱신)
SESSION_COOKIE_SAMESITE = os.getenv("CCI_SESSION_SAMESITE", "lax").strip().lower() or "lax"
if SESSION_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    SESSION_COOKIE_SAMESITE = "lax"
SESSION_COOKIE_HTTPS_ONLY = os.getenv("CCI_SESSION_HTTPS_ONLY", "0").strip().lower() in {"1", "true", "yes", "on"}
app.add_middleware(
    SessionMiddleware,
    secret_key=APP_SESSION_SECRET,
    max_age=SESSION_MAX_AGE_SECONDS,
    same_site=SESSION_COOKIE_SAMESITE,
    https_only=SESSION_COOKIE_HTTPS_ONLY,
)

# Middleware to skip ngrok browser warning
class NgrokWarningSkipMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["ngrok-skip-browser-warning"] = "true"
        response.headers["ngrok-skip-browser-warning-for-user-agent"] = "*"
        return response

app.add_middleware(NgrokWarningSkipMiddleware)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
app.mount("/reports", StaticFiles(directory=str(REPORT_DIR)), name="reports")
app.mount("/artifacts", StaticFiles(directory=str(ARTIFACT_DIR)), name="artifacts")
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/exports", StaticFiles(directory=str(EXPORT_DIR)), name="exports")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def _hash_password(email: str, password: str) -> str:
    key = f"{email.strip().lower()}::{password}::poliot"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _load_json_array(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    return []


def _save_json_array(path: Path, items: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _ensure_users_file() -> None:
    with AUTH_LOCK:
        users = _load_json_array(USERS_FILE)
        by_email = {str(x.get("email", "")).strip().lower(): x for x in users}
        for admin_email in sorted(ADMIN_EMAILS):
            if admin_email not in by_email:
                users.append(
                    {
                        "email": admin_email,
                        "password_hash": _hash_password(admin_email, "Poliot12!@"),
                        "role": "admin",
                        "name": admin_email.split("@")[0],
                        "created_at": datetime.utcnow().isoformat(timespec="seconds"),
                        "game_access": admin_email == GAME_ACCESS_MANAGER_EMAIL,
                        "shortcut_items": [],
                        "shortcut_windows": [],
                    }
                )
            else:
                by_email[admin_email]["role"] = "admin"
                # Core admin game permission policy is deterministic:
                # only the designated manager can access game features.
                by_email[admin_email]["game_access"] = admin_email == GAME_ACCESS_MANAGER_EMAIL
        _save_json_array(USERS_FILE, users)


def _load_users() -> list[dict]:
    _ensure_users_file()
    return _load_json_array(USERS_FILE)


def _save_users(users: list[dict]) -> None:
    _save_json_array(USERS_FILE, users)


def _find_user(email: str) -> dict | None:
    target = str(email or "").strip().lower()
    if not target:
        return None
    for user in _load_users():
        if str(user.get("email", "")).strip().lower() == target:
            return user
    return None


def _is_admin_user(user: dict | None) -> bool:
    if not user:
        return False
    role = str(user.get("role", "user")).strip().lower()
    if role == "admin":
        return True
    email = str(user.get("email", "")).strip().lower()
    return bool(email and email in ADMIN_EMAILS)


def _can_user_login(user: dict | None) -> bool:
    if not user:
        return False
    # Backward compatibility: existing rows without can_login stay usable.
    raw = user.get("can_login", None)
    if raw is None:
        return True
    return bool(raw)


def _is_user_approved(user: dict | None) -> bool:
    if not user:
        return False
    raw = user.get("approved", None)
    if raw is None:
        return _can_user_login(user)
    return bool(raw)


def _can_manage_game_access(user: dict | None) -> bool:
    if not user:
        return False
    email = str(user.get("email", "")).strip().lower()
    return email == GAME_ACCESS_MANAGER_EMAIL


def _has_game_access(user: dict | None) -> bool:
    if not user:
        return False
    if _can_manage_game_access(user):
        return True
    if _is_admin_user(user):
        return False
    raw = user.get("game_access", None)
    if raw is None:
        return False
    return bool(raw)


def _load_game_scores() -> list[dict]:
    return _load_json_array(GAME_SCORES_FILE)


def _save_game_scores(items: list[dict]) -> None:
    _save_json_array(GAME_SCORES_FILE, items)


def _decode_session_cookie_value(raw_cookie: str) -> dict:
    if not raw_cookie:
        return {}
    signer = TimestampSigner(APP_SESSION_SECRET)
    try:
        signed = signer.unsign(raw_cookie, max_age=SESSION_MAX_AGE_SECONDS)
        decoded = base64.b64decode(signed)
        payload = json.loads(decoded.decode("utf-8"))
        return payload if isinstance(payload, dict) else {}
    except (BadSignature, SignatureExpired, ValueError, json.JSONDecodeError):
        return {}


def _is_session_timed_out(request: Request) -> bool:
    session_data = request.scope.get("session")
    if not isinstance(session_data, dict):
        return False
    email = str(session_data.get("user_email", "")).strip().lower()
    if not email:
        return False
    # last_active_at 우선, 없으면 login_at 폴백 (기존 세션 호환)
    active_at_raw = (
        str(session_data.get("last_active_at", "") or "").strip()
        or str(session_data.get("login_at", "") or "").strip()
    )
    if not active_at_raw:
        return True
    try:
        active_at = datetime.fromisoformat(active_at_raw)
    except ValueError:
        return True
    return (datetime.utcnow() - active_at).total_seconds() > SESSION_IDLE_TIMEOUT_SECONDS


def _current_user_from_request(request: Request) -> dict | None:
    # request.session can be unavailable in some middleware ordering scenarios.
    session_data = request.scope.get("session")
    if isinstance(session_data, dict):
        email = str(session_data.get("user_email", "")).strip().lower()
        if email:
            return _find_user(email)

    cookie_data = _decode_session_cookie_value(str(request.cookies.get("session", "")))
    email = str(cookie_data.get("user_email", "")).strip().lower()
    if not email:
        return None
    return _find_user(email)


def _require_admin(request: Request) -> dict:
    user = _current_user_from_request(request)
    if not _is_admin_user(user):
        raise HTTPException(status_code=403, detail="admin required")
    return user or {}


def _require_game_access(request: Request) -> dict:
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    if not _has_game_access(user):
        raise HTTPException(status_code=403, detail="game access denied")
    return user


def _is_public_path(path: str) -> bool:
    if path in {"/favicon.ico", "/auth/login", "/auth/register", "/auth/logout", "/api/board/urgent"}:
        return True
    for prefix in ("/static", "/reports", "/artifacts", "/uploads", "/exports", "/auth"):
        if path.startswith(prefix):
            return True
    return False


def _groupware_session_key(request: Request) -> str | None:
    user = _current_user_from_request(request)
    email = str((user or {}).get("email", "")).strip().lower()
    cookie = str(request.cookies.get("session", "")).strip()
    # 같은 계정을 여러 브라우저/터널에서 동시에 쓰더라도 업스트림 세션이 섞이지 않게 분리한다.
    if email and cookie:
        cookie_hash = hashlib.sha256(cookie.encode("utf-8", errors="ignore")).hexdigest()
        return f"gw:{email}:{cookie_hash}"
    if email:
        return f"gw:{email}"
    if cookie:
        return "gw:anon:" + hashlib.sha256(cookie.encode("utf-8", errors="ignore")).hexdigest()
    return None


def _get_groupware_client(request: Request) -> requests.Session:
    key = _groupware_session_key(request)
    if not key:
        raise HTTPException(status_code=401, detail="login required")
    with GROUPWARE_PROXY_LOCK:
        found = GROUPWARE_PROXY_SESSIONS.get(key)
        if found is not None:
            return found
        session = requests.Session()
        GROUPWARE_PROXY_SESSIONS[key] = session
        return session


def _clear_groupware_client(request: Request) -> None:
    key = _groupware_session_key(request)
    if not key:
        return
    with GROUPWARE_PROXY_LOCK:
        found = GROUPWARE_PROXY_SESSIONS.pop(key, None)
    if found is not None:
        try:
            found.close()
        except Exception:
            pass


def _groupware_target_path_from_request_path(request_path: str) -> str:
    path = str(request_path or "").strip()

    def _tail(src: str, prefix: str) -> str:
        return str(src[len(prefix):] if src.startswith(prefix) else "").lstrip("/")

    if path.startswith("/groupware/cjs/"):
        tail = _tail(path, "/groupware/cjs/")
        return f"/cjs/{tail}" if tail else "/cjs/"
    if path.startswith("/groupware/upload_file/"):
        tail = _tail(path, "/groupware/upload_file/")
        return f"/upload_file/{tail}" if tail else "/upload_file/"
    if path.startswith("/groupware/chtml/"):
        tail = _tail(path, "/groupware/chtml/")
        return f"/chtml/{tail}" if tail else "/chtml/"
    if path.startswith("/groupware/static/"):
        tail = _tail(path, "/groupware/static/")
        return f"/static/{tail}" if tail else "/static/"
    if path.startswith("/groupware/img/"):
        tail = _tail(path, "/groupware/img/")
        return f"/groupware/img/{tail}" if tail else "/groupware/img/"
    if path.startswith("/groupware/main/"):
        tail = _tail(path, "/groupware/main/")
        return f"/groupware/main/{tail}" if tail else "/groupware/main/"
    if path.startswith("/cjs/"):
        tail = _tail(path, "/cjs/")
        return f"/cjs/{tail}" if tail else "/cjs/"
    if path.startswith("/upload_file/"):
        tail = _tail(path, "/upload_file/")
        return f"/upload_file/{tail}" if tail else "/upload_file/"
    if path.startswith("/chtml/"):
        tail = _tail(path, "/chtml/")
        return f"/chtml/{tail}" if tail else "/chtml/"
    if path.startswith("/static/"):
        tail = _tail(path, "/static/")
        return f"/static/{tail}" if tail else "/static/"
    if path.startswith("/img/"):
        tail = _tail(path, "/img/")
        return f"/groupware/img/{tail}" if tail else "/groupware/img/"
    if path.startswith("/main/"):
        tail = _tail(path, "/main/")
        return f"/groupware/main/{tail}" if tail else "/groupware/main/"
    if path.startswith(GROUPWARE_PROXY_PREFIX):
        tail = _tail(path, GROUPWARE_PROXY_PREFIX + "/")
        return f"/{tail}" if tail else GROUPWARE_LOGIN_PATH
    if path.startswith("/groupware"):
        return path if path != "/groupware" else GROUPWARE_LOGIN_PATH
    return GROUPWARE_LOGIN_PATH


def _groupware_proxy_url_from_value(raw_value: str) -> str:
    value = str(raw_value or "").strip()
    if not value or value.startswith(("#", "javascript:", "mailto:", "data:")):
        return value
    if value.startswith("//"):
        value = "https:" + value
    parts = urlsplit(value)
    group_parts = urlsplit(GROUPWARE_BASE_URL)

    def map_path(path: str) -> str:
        clean = str(path or "/").strip() or "/"
        # 로그인 HTML이 잘못 참조하는 정적 자산 경로 보정
        if clean.startswith("/groupware/cjs/"):
            return clean.removeprefix("/groupware")
        if clean.startswith("/groupware/upload_file/"):
            return clean.removeprefix("/groupware")
        # img는 업스트림에서 /groupware/img/... 경로를 사용한다.
        if clean.startswith("/groupware/img/"):
            return clean
        if clean.startswith("/groupware/main/"):
            return clean.removeprefix("/groupware")
        if clean.startswith("/groupware/chtml/"):
            return clean.removeprefix("/groupware")
        if clean.startswith("/groupware/static/"):
            return clean.removeprefix("/groupware")
        if clean.startswith("/cjs/") or clean.startswith("/upload_file/") or clean.startswith("/main/") or clean.startswith("/chtml/") or clean.startswith("/static/"):
            return clean
        if clean.startswith("/img/"):
            return f"/groupware{clean}"
        if clean.startswith("/groupware/") or clean == "/groupware":
            return clean
        return f"{GROUPWARE_EMBED_PREFIX}{clean}"

    if parts.scheme and parts.netloc:
        if parts.netloc.lower() != group_parts.netloc.lower():
            return value
        mapped = map_path(parts.path or "/")
        return urlunsplit(("", "", mapped, parts.query, parts.fragment))
    if value.startswith(GROUPWARE_PROXY_PREFIX) or value.startswith(GROUPWARE_EMBED_PREFIX) or value.startswith("/cjs/") or value.startswith("/upload_file/") or value.startswith("/main/") or value.startswith("/chtml/") or value.startswith("/img/") or value.startswith("/static/"):
        return value
    if value.startswith("/"):
        return map_path(value)
    return value


def _rewrite_groupware_html(content: str, upstream_url: str) -> str:
    def repl(match: re.Match[str]) -> str:
        return f"{match.group('attr')}{match.group('quote')}{_groupware_proxy_url_from_value(match.group('value'))}{match.group('quote')}"

    rewritten = GROUPWARE_ATTR_RE.sub(repl, content)
    current = urlsplit(upstream_url)
    current_real_url = urlunsplit(("https", current.netloc, current.path or "/", current.query, current.fragment))
    
        # iframe 내 링크 처리 JavaScript inject
    link_interceptor_js = """
<script>
(function() {
  try {
        // 로그인 필요 시 전달된 복귀 URL을 저장
        try {
            var sp = new URLSearchParams(window.location.search || "");
            var ret = sp.get("gw_return");
            if (ret) {
                sessionStorage.setItem("gw_return", ret);
            }
        } catch(_) {}

    function toProxyUrl(raw) {
      const s = String(raw || "").trim();
      if (!s || s.startsWith("#") || s.startsWith("javascript:") || s.startsWith("mailto:") || s.startsWith("data:")) return s;
      
      // 이미 프록시 경로면 그대로 반환
      if (s.startsWith("/groupware") || s.startsWith("/cjs") || s.startsWith("/upload_file") || 
          s.startsWith("/main") || s.startsWith("/chtml") || s.startsWith("/img") || s.startsWith("/static")) {
        return s;
      }
      
      // gw.poliot.co.kr 도메인 내부 다른 프로토콜 URL
      if ((s.startsWith("http://") || s.startsWith("https://")) && s.includes("gw.poliot.co.kr")) {
        const u = new URL(s);
        const path = u.pathname || "/";
        const query = u.search || "";
        const hash = u.hash || "";
        // /groupware/ 또는 /cjs/, /main/ 등으로 보정
        if (path.includes("/groupware/")) {
          return path.replace(/^\\/groupware/, "/groupware") + query + hash;
        } else if (path.includes("/cjs") || path.includes("/main") || path.includes("/chtml") || 
                   path.includes("/img") || path.includes("/upload_file") || path.includes("/static")) {
          return path + query + hash;
        } else {
          return "/groupware" + path + query + hash;
        }
      }
      
      // 절대경로
      if (s.startsWith("/")) {
        return s;
      }
      
      return s;
    }
    
    // 모든 <a> 클릭 intercept
    document.addEventListener("click", function(e) {
      let el = e.target;
      while (el && el !== document) {
        if (el.tagName === "A" || el.tagName === "a") {
          const href = el.getAttribute("href");
          if (href && !href.startsWith("#") && !href.startsWith("javascript:") && !href.startsWith("mailto:")) {
            const proxyUrl = toProxyUrl(href);
            if (proxyUrl !== href) {
              e.preventDefault();
              window.location.href = proxyUrl;
              return;
            }
          }
          break;
        }
        el = el.parentNode;
      }
    }, true);
    
    // XMLHttpRequest 프록시 변환
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      const proxyUrl = toProxyUrl(String(url || ""));
      return origOpen.apply(this, [method, proxyUrl]);
    };

        // 새창/팝업을 같은 프레임 내 이동으로 강제 (메일쓰기 포함)
        var origWindowOpen = window.open;
        window.open = function(url, name, specs) {
            const proxyUrl = toProxyUrl(String(url || ""));
            if (proxyUrl && proxyUrl !== "" && proxyUrl !== "about:blank") {
                window.location.href = proxyUrl;
                return window;
            }
            return origWindowOpen.apply(window, arguments);
        };
        try { if (window.parent && window.parent !== window) { window.parent.open = window.open; } } catch(_) {}
        try { if (window.top && window.top !== window) { window.top.open = window.open; } } catch(_) {}

        // _blank 폼 전송을 같은 프레임으로 고정
        document.addEventListener("submit", function(e) {
            const form = e.target;
            if (!form || !form.getAttribute) return;
            const action = form.getAttribute("action") || "";
            const proxyAction = toProxyUrl(action);
            if (proxyAction && proxyAction !== action) {
                form.setAttribute("action", proxyAction);
            }
            const target = String(form.getAttribute("target") || "").toLowerCase();
            if (target === "_blank" || target === "blank") {
                form.setAttribute("target", "_self");
            }
        }, true);

        // 페이지 내 기존 _blank 링크/폼도 즉시 고정
        try {
            document.querySelectorAll('a[target="_blank"], form[target="_blank"]').forEach(function(el){
                el.setAttribute('target', '_self');
            });
        } catch(_) {}

        // 로그인 성공 후 메인으로 떨어지면 원래 요청 URL로 자동 복귀
        try {
            var pending = sessionStorage.getItem("gw_return") || "";
            var p = String(window.location.pathname || "");
            var isLanding = (
                p === "/groupware/index.php" ||
                p === "/groupware/" ||
                p === "/groupware" ||
                p === "/groupware/main/main.php" ||
                p === "/groupware/main/" ||
                p === "/groupware/main"
            );
            if (pending && isLanding) {
                sessionStorage.removeItem("gw_return");
                window.location.replace(pending);
            }
        } catch(_) {}
    
  } catch(err) {
    console.error("Groupware proxy interceptor error:", err);
  }
})();
</script>
"""
    
    # 스크립트/인라인 문자열에 남아 있는 절대 URL도 프록시 URL로 치환
    rewritten = rewritten.replace("https://gw.poliot.co.kr/groupware", "/groupware")
    rewritten = rewritten.replace("http://gw.poliot.co.kr/groupware", "/groupware")
    rewritten = rewritten.replace("https:\\/\\/gw.poliot.co.kr\\/groupware", "/groupware")
    rewritten = rewritten.replace("http:\\/\\/gw.poliot.co.kr\\/groupware", "/groupware")
    rewritten = rewritten.replace(GROUPWARE_BASE_URL + "/groupware", "/groupware")

    if "<body" in rewritten.lower():
        rewritten = re.sub(
            r"</body>",
            link_interceptor_js + "</body>",
            rewritten,
            count=1,
            flags=re.IGNORECASE,
        )
        rewritten = re.sub(
            r"<body([^>]*)>",
            lambda m: f'<body{m.group(1)} data-groupware-url="{current_real_url}">',
            rewritten,
            count=1,
            flags=re.IGNORECASE,
        )
    elif "<html" in rewritten.lower():
        rewritten = re.sub(
            r"</html>",
            link_interceptor_js + "</html>",
            rewritten,
            count=1,
            flags=re.IGNORECASE,
        )
    
    return rewritten


def _rewrite_groupware_css(content: str) -> str:
    def repl_url(match: re.Match[str]) -> str:
        quote_char = match.group("quote") or ""
        value = _groupware_proxy_url_from_value(match.group("value"))
        return f"url({quote_char}{value}{quote_char})"

    rewritten = GROUPWARE_CSS_URL_RE.sub(repl_url, content)
    rewritten = GROUPWARE_CSS_IMPORT_RE.sub(
        lambda m: f"@import {m.group('quote')}{_groupware_proxy_url_from_value(m.group('value'))}{m.group('quote')}",
        rewritten,
    )
    return rewritten


def _normalize_shortcut_items(raw_items: list) -> list[dict]:
    out: list[dict] = []
    seen = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        item_id = str(raw.get("id", "")).strip()
        name = str(raw.get("name", "")).strip()
        url = str(raw.get("url", "")).strip()
        if not item_id or not name or not url:
            continue
        if item_id in seen:
            continue
        seen.add(item_id)
        out.append(
            {
                "id": item_id,
                "name": name,
                "url": url,
                "fixed": bool(raw.get("fixed", False)) or (item_id in REQUIRED_SHORTCUT_IDS),
            }
        )
    return out


def _normalize_shortcut_windows(raw_windows: list) -> list[dict]:
    out: list[dict] = []
    if not isinstance(raw_windows, list):
        return out
    for raw in raw_windows:
        if not isinstance(raw, dict):
            continue
        item_id = str(raw.get("id", "")).strip()
        if not item_id:
            continue
        out.append(
            {
                "id": item_id,
                "left": str(raw.get("left", "")).strip(),
                "top": str(raw.get("top", "")).strip(),
                "width": str(raw.get("width", "")).strip(),
                "height": str(raw.get("height", "")).strip(),
                "is_minimized": bool(raw.get("is_minimized", False)),
                "is_maximized": bool(raw.get("is_maximized", False)),
                "is_snapped_left": bool(raw.get("is_snapped_left", False)),
                "is_snapped_right": bool(raw.get("is_snapped_right", False)),
            }
        )
    return out


def _merge_required_shortcuts(items: list[dict]) -> list[dict]:
    merged = _normalize_shortcut_items(items)
    by_id = {str(x.get("id", "")).strip(): x for x in merged}
    for req in REQUIRED_SHORTCUT_ITEMS:
        by_id[str(req["id"])] = dict(req)

    fixed = [by_id[x["id"]] for x in REQUIRED_SHORTCUT_ITEMS]
    custom = [v for k, v in by_id.items() if k and k not in REQUIRED_SHORTCUT_IDS]
    custom.sort(key=lambda x: str(x.get("name", "")).lower())
    return fixed + custom


def _load_user_shortcut_state(user: dict) -> dict:
    item_list = _merge_required_shortcuts(list(user.get("shortcut_items") or []))
    allowed_ids = {str(x.get("id", "")).strip() for x in item_list}
    windows = [x for x in _normalize_shortcut_windows(list(user.get("shortcut_windows") or [])) if str(x.get("id", "")) in allowed_ids]
    return {"items": item_list, "windows": windows}


def _save_user_shortcut_state(user_email: str, items: list, windows: list) -> dict:
    normalized_email = str(user_email or "").strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="invalid user")

    merged_items = _merge_required_shortcuts(list(items or []))
    allowed_ids = {str(x.get("id", "")).strip() for x in merged_items}
    clean_windows = [
        x
        for x in _normalize_shortcut_windows(list(windows or []))
        if str(x.get("id", "")).strip() in allowed_ids
    ]

    _ensure_users_file()
    with AUTH_LOCK:
        users = _load_json_array(USERS_FILE)
        found = False
        for row in users:
            if str(row.get("email", "")).strip().lower() != normalized_email:
                continue
            row["shortcut_items"] = merged_items
            row["shortcut_windows"] = clean_windows
            found = True
            break
        if not found:
            raise HTTPException(status_code=404, detail="user not found")
        _save_users(users)

    return {"items": merged_items, "windows": clean_windows}


@app.middleware("http")
async def auth_guard_middleware(request: Request, call_next):
    path = request.url.path
    if _is_public_path(path):
        return await call_next(request)

    # 그룹웨어 프록시/자산 경로는 로컬 세션이 끊겨도 그룹웨어 자체 로그인 흐름을 유지한다.
    groupware_passthrough_prefixes = (
        "/groupware",
        "/cjs/",
        "/upload_file/",
        "/main/",
        "/chtml/",
        "/img/",
    )
    if path.startswith(groupware_passthrough_prefixes):
        return await call_next(request)

    if _is_session_timed_out(request):
        if request.session:
            request.session.clear()
        if path.startswith("/api"):
            return JSONResponse(status_code=401, content={"ok": False, "detail": "session expired"})
        next_path = quote(str(request.url.path or "/"), safe="/:#?=&")
        msg = quote("1시간 동안 사용하지 않아 자동 로그아웃되었습니다. 다시 로그인해 주세요.", safe="")
        return RedirectResponse(url=f"/auth/login?next={next_path}&message={msg}", status_code=303)

    user = _current_user_from_request(request)
    if not user:
        if path.startswith("/api"):
            return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
        next_path = quote(str(request.url.path or "/"), safe="/:#?=&")
        return RedirectResponse(url=f"/auth/login?next={next_path}", status_code=303)

    request.state.current_user = user

    # RBAC: 일반 사용자는 인원별 이슈 통계 API와 관리 메뉴/API 접근 차단
    admin_only_prefixes = ("/admin", "/api/admin")
    admin_only_exact = {
        "/api/company-members",
        "/api/company-members/add",
        "/api/company-members/remove",
        "/api/stats/company-defects",
        "/api/stats/company-defects/detail",
    }
    admin_allowed_api_patterns = (
        re.compile(r"^/api/admin/assets/[^/]+/request-delete$"),
        re.compile(r"^/api/admin/assets/request-delete-bulk$"),
        re.compile(r"^/api/admin/assets/[^/]+/withdraw-request$"),
    )
    if any(path.startswith(p) for p in admin_only_prefixes) or path in admin_only_exact:
        if any(pattern.match(path) for pattern in admin_allowed_api_patterns):
            return await call_next(request)
        if not _is_admin_user(user):
            if path.startswith("/api"):
                return JSONResponse(status_code=403, content={"ok": False, "detail": "admin required"})
            return RedirectResponse(url="/", status_code=303)

    return await call_next(request)


_ensure_users_file()


def _seed_admin_assets_and_employees() -> None:
    if not EMPLOYEES_FILE.exists():
        _save_json_array(
            EMPLOYEES_FILE,
            [
                {
                    "id": "emp-sue",
                    "name": "장수경",
                    "birth": "1004",
                    "title": "차장",
                    "employee_no": "230103",
                    "account_email": "sue@poliot.co.kr",
                    "google_email": "sue@poliot.co.kr",
                    "phone": "010-4785-1003",
                    "remote_id": "hae\\9452861",
                    "remote_password": "Poliot12!@",
                },
                {
                    "id": "emp-hiss",
                    "name": "우형일",
                    "birth": "2001.07.23",
                    "title": "책임",
                    "employee_no": "240130",
                    "account_email": "hiss0723@poliot.co.kr",
                    "google_email": "hiss0723@poliot.co.kr",
                    "phone": "010-8326-5491",
                    "remote_id": "hae\\9477402",
                    "remote_password": "Poliot12!@",
                },
            ],
        )
    if not ASSETS_FILE.exists():
        _save_json_array(
            ASSETS_FILE,
            [
                {
                    "id": "asset-sw-goa-23",
                    "asset_no": "SW-GOA-23",
                    "management_no": "Poliot_EU_S/W_022",
                    "platform": "Android",
                    "maker": "Google",
                    "category": "스마트폰",
                    "model": "Pixel 7 pro",
                    "os_version": "13",
                    "serial": "34211FDH300051",
                    "region": "EU",
                    "owner": "장수경",
                },
                {
                    "id": "asset-sw-bty-001",
                    "asset_no": "SW-BTY-001",
                    "management_no": "",
                    "platform": "기타물품",
                    "maker": "Power Bank",
                    "category": "보조 배터리",
                    "model": "Built-in Cable 10000mAh",
                    "os_version": "",
                    "serial": "",
                    "region": "EU",
                    "owner": "공우빈",
                },
            ],
        )


_seed_admin_assets_and_employees()


def _bg_cache_warmer() -> None:
    """TTL 만료 전에 Google Sheets 캐시를 선제적으로 갱신하는 데몬 스레드."""
    # 서버 초기화 후 10초 대기 후 첫 워밍 시작
    time.sleep(10)
    while True:
        try:
            _get_cached_google_defect_stats(force=True)
        except Exception:
            pass
        try:
            _get_cached_company_defect_stats(force=True)
        except Exception:
            pass
        try:
            _get_cached_raw_defect_issue_stats(force=True)
        except Exception:
            pass
        try:
            _get_cached_defectlist_rows(force=True)
        except Exception:
            pass
        # 다음 갱신은 TTL의 80% 후 (기본 72초)
        time.sleep(max(30, int(GOOGLE_DEFECT_CACHE_TTL_SEC * 0.8)))


threading.Thread(target=_bg_cache_warmer, daemon=True).start()


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


@app.get("/auth/login", response_class=HTMLResponse)
def auth_login_page(request: Request, next: str = "/", message: str = ""):
    help_text = "현재 사용하고 있는 구글 시트에 아이디(이메일)/비밀번호를 입력해 주세요"
    return templates.TemplateResponse(
        "auth_login.html",
        {
            "request": request,
            "next": next or "/",
            "message": help_text,
            "popup_message": str(message or "").strip(),
        },
    )


@app.post("/auth/login")
def auth_login_submit(request: Request, email: str = Form(...), password: str = Form(...), next: str = Form("/")):
    user = _find_user(email)
    redirect_to = str(next or "/").strip() or "/"
    if not redirect_to.startswith("/"):
        redirect_to = "/"

    if not user or str(user.get("password_hash", "")) != _hash_password(email, password):
        msg = quote("이메일 또는 비밀번호가 올바르지 않습니다.", safe="")
        return RedirectResponse(url=f"/auth/login?next={quote(redirect_to, safe='/:#?=&')}&message={msg}", status_code=303)

    if not _is_user_approved(user):
        msg = quote("관리자 승인 대기 중입니다. 관리자에게 승인 요청해 주세요.", safe="")
        return RedirectResponse(url=f"/auth/login?next={quote(redirect_to, safe='/:#?=&')}&message={msg}", status_code=303)

    if not _can_user_login(user):
        msg = quote("로그인 권한이 비활성화된 계정입니다. 관리자에게 문의해 주세요.", safe="")
        return RedirectResponse(url=f"/auth/login?next={quote(redirect_to, safe='/:#?=&')}&message={msg}", status_code=303)

    now_iso = datetime.utcnow().isoformat(timespec="seconds")
    request.session["user_email"] = str(user.get("email", "")).strip().lower()
    request.session["login_at"] = now_iso
    request.session["last_active_at"] = now_iso
    return RedirectResponse(url=redirect_to, status_code=303)


@app.get("/auth/register", response_class=HTMLResponse)
def auth_register_page(request: Request, next: str = "/", message: str = ""):
    return templates.TemplateResponse(
        "auth_register.html",
        {
            "request": request,
            "next": next or "/",
            "message": "현재 사용하고 있는 구글 시트에 아이디(이메일)/비밀번호를 입력해 주세요",
            "popup_message": str(message or "").strip(),
        },
    )


@app.post("/auth/register")
def auth_register_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    name: str = Form(...),
    phone: str = Form(...),
    title: str = Form(""),
    birth: str = Form(""),
    address: str = Form(""),
    next: str = Form("/"),
):
    normalized = str(email or "").strip().lower()
    clean_name = str(name or "").strip()
    clean_phone = str(phone or "").strip()
    clean_title = str(title or "").strip()
    clean_birth = str(birth or "").strip()
    clean_address = str(address or "").strip()

    redirect_to = str(next or "/").strip() or "/"
    if not redirect_to.startswith("/"):
        redirect_to = "/"

    if "@" not in normalized:
        msg = quote("이메일 형식이 올바르지 않습니다.", safe="")
        return RedirectResponse(url=f"/auth/register?next={quote(redirect_to, safe='/:#?=&')}&message={msg}", status_code=303)
    if not clean_name:
        msg = quote("이름을 입력해 주세요.", safe="")
        return RedirectResponse(url=f"/auth/register?next={quote(redirect_to, safe='/:#?=&')}&message={msg}", status_code=303)
    if not clean_phone:
        msg = quote("전화번호를 입력해 주세요.", safe="")
        return RedirectResponse(url=f"/auth/register?next={quote(redirect_to, safe='/:#?=&')}&message={msg}", status_code=303)
    if len(str(password or "")) < 8:
        msg = quote("비밀번호는 8자 이상이어야 합니다.", safe="")
        return RedirectResponse(url=f"/auth/register?next={quote(redirect_to, safe='/:#?=&')}&message={msg}", status_code=303)

    users = _load_users()
    if any(str(x.get("email", "")).strip().lower() == normalized for x in users):
        msg = quote("이미 가입된 이메일입니다. 로그인하거나 관리자에게 문의해 주세요.", safe="")
        return RedirectResponse(url=f"/auth/register?next={quote(redirect_to, safe='/:#?=&')}&message={msg}", status_code=303)

    is_admin_seed = normalized in ADMIN_EMAILS
    users.append(
        {
            "email": normalized,
            "password_hash": _hash_password(normalized, password),
            "role": "admin" if is_admin_seed else "user",
            "name": clean_name,
            "phone": clean_phone,
            "title": clean_title,
            "birth": clean_birth,
            "address": clean_address,
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
            "approved": bool(is_admin_seed),
            "can_login": bool(is_admin_seed),
            "approved_at": datetime.utcnow().isoformat(timespec="seconds") if is_admin_seed else "",
            "shortcut_items": [],
            "shortcut_windows": [],
        }
    )
    _save_users(users)

    employees = _load_json_array(EMPLOYEES_FILE)
    found_employee = False
    for row in employees:
        account_email = str(row.get("account_email", "")).strip().lower()
        if account_email != normalized:
            continue
        row["name"] = clean_name
        row["title"] = clean_title
        row["account_email"] = normalized
        row["phone"] = clean_phone
        row["birth"] = clean_birth
        row["address"] = clean_address
        found_employee = True
        break
    if not found_employee:
        employees.append(
            {
                "id": f"emp-{uuid.uuid4().hex[:10]}",
                "name": clean_name,
                "title": clean_title,
                "account_email": normalized,
                "phone": clean_phone,
                "birth": clean_birth,
                "address": clean_address,
            }
        )
    _save_json_array(EMPLOYEES_FILE, employees)

    if not is_admin_seed:
        _append_audit_update(
            "회원가입 승인 요청",
            [
                f"계정: {normalized}",
                f"이름: {clean_name}",
                f"전화번호: {clean_phone}",
                "상태: 관리자 승인 대기",
            ],
            kind="added",
            scope="회원가입",
        )
    if not is_admin_seed:
        msg = quote("회원가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.", safe="")
        return RedirectResponse(url=f"/auth/login?next={quote(redirect_to, safe='/:#?=&')}&message={msg}", status_code=303)
    request.session["user_email"] = normalized
    request.session["login_at"] = datetime.utcnow().isoformat(timespec="seconds")
    return RedirectResponse(url=redirect_to, status_code=303)


@app.post("/auth/logout")
def auth_logout(request: Request):
    _clear_groupware_client(request)
    if request.session:
        request.session.clear()
    return RedirectResponse(url="/auth/login", status_code=303)


@app.get("/api/auth/me")
def auth_me(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    return {
        "ok": True,
        "user": {
            "email": str(user.get("email", "")),
            "name": str(user.get("name", "")),
            "role": "admin" if _is_admin_user(user) else "user",
            "approved": _is_user_approved(user),
            "can_login": _can_user_login(user),
            "game_access": _has_game_access(user),
            "can_manage_game_access": _can_manage_game_access(user),
            "address": str(user.get("address", "") or ""),
            "login_at": str(request.session.get("login_at", "") or ""),
            "last_active_at": str(request.session.get("last_active_at", "") or request.session.get("login_at", "") or ""),
        },
    }


@app.post("/api/auth/heartbeat")
def auth_heartbeat(request: Request):
    """프론트엔드 활동 시 세션 유휴 타이머를 서버에서도 갱신합니다."""
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    request.session["last_active_at"] = datetime.utcnow().isoformat(timespec="seconds")
    return {"ok": True}

@app.put("/api/user/me")
async def user_self_update(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    target_email = str(user.get("email", "")).strip().lower()
    users = _load_users()
    updated_user = None
    audit_lines: list[str] = []
    for row in users:
        if str(row.get("email", "")).strip().lower() != target_email:
            continue
        before = dict(row)
        if "name" in payload:
            new_name = str(payload.get("name", "") or "").strip()
            if new_name:
                row["name"] = new_name
        if "password" in payload:
            password = str(payload.get("password", "") or "")
            if password:
                if len(password) < 8:
                    raise HTTPException(status_code=400, detail="password too short")
                row["password_hash"] = _hash_password(target_email, password)
                audit_lines.append("password: updated")
        if "address" in payload:
            row["address"] = str(payload.get("address", "") or "").strip()
        audit_lines = _build_change_lines(before, row, ["name", "address"]) + audit_lines
        updated_user = {
            "email": target_email,
            "name": str(row.get("name", "")),
            "address": str(row.get("address", "") or ""),
        }
        break

    if updated_user is None:
        raise HTTPException(status_code=404, detail="user not found")

    _save_users(users)
    if audit_lines:
        _append_audit_update(
            "내 정보 수정",
            [f"계정: {target_email}", *audit_lines],
            kind="updated",
            scope="마이페이지",
            actor=user,
        )
    return {"ok": True, "user": updated_user}


@app.get("/api/admin/users")
def admin_users(request: Request):
    _require_admin(request)

    # Read both primary and legacy stores so admin page can always show signup fields.
    users_by_email: dict[str, dict] = {}
    for path in (LEGACY_USERS_FILE, USERS_FILE):
        for row in _load_json_array(path):
            email = str(row.get("email", "")).strip().lower()
            if not email:
                continue
            prev = users_by_email.get(email) or {}
            users_by_email[email] = {**prev, **row, "email": email}

    employees_by_email: dict[str, dict] = {}
    for path in (LEGACY_EMPLOYEES_FILE, EMPLOYEES_FILE):
        for row in _load_json_array(path):
            email = str(row.get("account_email", "")).strip().lower()
            if not email:
                continue
            prev = employees_by_email.get(email) or {}
            employees_by_email[email] = {**prev, **row, "account_email": email}

    out = []
    for row in users_by_email.values():
        email = str(row.get("email", "")).strip().lower()
        password_hash = str(row.get("password_hash", "") or "")
        password_hash_preview = password_hash if password_hash else "(없음)"
        employee = employees_by_email.get(email) or {}

        title = str(row.get("title", "") or "").strip() or str(employee.get("title", "") or "").strip()
        phone = str(row.get("phone", "") or "").strip() or str(employee.get("phone", "") or "").strip()
        birth = str(row.get("birth", "") or "").strip() or str(employee.get("birth", "") or "").strip()
        address = str(row.get("address", "") or "").strip() or str(employee.get("address", "") or "").strip()

        out.append(
            {
                "email": email,
                "name": str(row.get("name", "")),
                "role": "admin" if str(row.get("role", "user")).strip().lower() == "admin" else "user",
                "created_at": str(row.get("created_at", "")),
                "approved": _is_user_approved(row),
                "can_login": _can_user_login(row),
                "game_access": _has_game_access(row),
                "title": title,
                "phone": phone,
                "birth": birth,
                "address": address,
                "password_hash_preview": password_hash_preview,
            }
        )
    out.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
    return {
        "ok": True,
        "items": out,
        "can_manage_game_access": _can_manage_game_access(_current_user_from_request(request)),
    }


@app.post("/api/admin/users")
async def admin_user_create(request: Request):
    admin_user = _require_admin(request)
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", "") or "")
    if "@" not in email:
        raise HTTPException(status_code=400, detail="invalid email")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="password too short")

    users = _load_users()
    if any(str(x.get("email", "")).strip().lower() == email for x in users):
        raise HTTPException(status_code=400, detail="email already exists")

    is_core_admin = email in ADMIN_EMAILS
    role = str(payload.get("role", "user")).strip().lower()
    approved = bool(payload.get("approved", False))
    can_login = bool(payload.get("can_login", approved))
    if role not in {"admin", "user"}:
        role = "user"
    if is_core_admin:
        role = "admin"
        approved = True
        can_login = True

    created = {
        "email": email,
        "password_hash": _hash_password(email, password),
        "role": role,
        "name": str(payload.get("name", "")).strip() or email.split("@")[0],
        "created_at": datetime.utcnow().isoformat(timespec="seconds"),
        "approved": approved,
        "can_login": can_login,
        "game_access": False,
        "approved_at": datetime.utcnow().isoformat(timespec="seconds") if approved else "",
        "shortcut_items": [],
        "shortcut_windows": [],
    }
    users.append(created)
    _save_users(users)

    item = {
        "email": email,
        "name": str(created.get("name", "")),
        "role": "admin" if str(created.get("role", "user")).strip().lower() == "admin" else "user",
        "created_at": str(created.get("created_at", "")),
        "approved": _is_user_approved(created),
        "can_login": _can_user_login(created),
        "game_access": _has_game_access(created),
    }
    _append_audit_update(
        "회원 계정 추가",
        [
            f"대상: {email}",
            f"이름: {item['name'] or '-'}",
            f"권한: {item['role']}",
            f"승인: {'예' if item['approved'] else '아니오'}",
            f"로그인 허용: {'예' if item['can_login'] else '아니오'}",
            f"게임 접근: {'허용' if item['game_access'] else '차단'}",
        ],
        kind="added",
        scope="인원 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": item}


@app.put("/api/admin/users/{user_email}")
async def admin_user_update(user_email: str, request: Request):
    admin_user = _require_admin(request)
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    target = str(user_email or "").strip().lower()
    if not target:
        raise HTTPException(status_code=400, detail="invalid user")

    users = _load_users()
    updated = None
    for row in users:
        email = str(row.get("email", "")).strip().lower()
        if email != target:
            continue

        before = dict(row)
        is_core_admin = target in ADMIN_EMAILS

        if is_core_admin and ("can_login" in payload and not bool(payload.get("can_login"))):
            raise HTTPException(status_code=400, detail="core admin login cannot be disabled")

        if "name" in payload:
            row["name"] = str(payload.get("name", "")).strip() or str(row.get("name", ""))
        if "title" in payload:
            row["title"] = str(payload.get("title", "") or "").strip()
        if "phone" in payload:
            row["phone"] = str(payload.get("phone", "") or "").strip()
        if "birth" in payload:
            row["birth"] = str(payload.get("birth", "") or "").strip()
        if "address" in payload:
            row["address"] = str(payload.get("address", "") or "").strip()
        if "password" in payload:
            password = str(payload.get("password", "") or "")
            if password:
                if len(password) < 8:
                    raise HTTPException(status_code=400, detail="password too short")
                row["password_hash"] = _hash_password(email, password)
        if "role" in payload and not is_core_admin:
            role = str(payload.get("role", "user")).strip().lower()
            if role in {"admin", "user"}:
                row["role"] = role
        if "approved" in payload and not is_core_admin:
            row["approved"] = bool(payload.get("approved"))
            if bool(row["approved"]):
                row["approved_at"] = datetime.utcnow().isoformat(timespec="seconds")
        if "can_login" in payload and not is_core_admin:
            row["can_login"] = bool(payload.get("can_login"))
        if "game_access" in payload:
            if not _can_manage_game_access(admin_user):
                raise HTTPException(status_code=403, detail="only hiss0723 can manage game access")
            if str(row.get("role", "user")).strip().lower() == "admin":
                raise HTTPException(status_code=400, detail="admin game access cannot be changed")
            row["game_access"] = bool(payload.get("game_access"))
        if is_core_admin:
            row["role"] = "admin"
            row["approved"] = True
            row["can_login"] = True
            row["approved_at"] = str(row.get("approved_at", "")).strip() or datetime.utcnow().isoformat(timespec="seconds")

        updated = {
            "email": email,
            "name": str(row.get("name", "")),
            "role": "admin" if str(row.get("role", "user")).strip().lower() == "admin" else "user",
            "created_at": str(row.get("created_at", "")),
            "approved": _is_user_approved(row),
            "can_login": _can_user_login(row),
            "game_access": _has_game_access(row),
            "title": str(row.get("title", "") or ""),
            "phone": str(row.get("phone", "") or ""),
            "birth": str(row.get("birth", "") or ""),
            "address": str(row.get("address", "") or ""),
        }
        change_lines = _build_change_lines(
            {
                **before,
                "approved": str(_is_user_approved(before)),
                "can_login": str(_can_user_login(before)),
                "game_access": str(_has_game_access(before)),
            },
            {
                **row,
                "approved": str(_is_user_approved(row)),
                "can_login": str(_can_user_login(row)),
                "game_access": str(_has_game_access(row)),
            },
            ["name", "title", "phone", "birth", "address", "role", "approved", "can_login", "game_access"],
        )
        if "password" in payload and str(payload.get("password", "") or ""):
            change_lines.append("password: updated")
        title = "회원 승인" if not _is_user_approved(before) and _is_user_approved(row) else "회원 계정 수정"
        _append_audit_update(
            title,
            [f"대상: {email}", *(change_lines or ["변경 항목 없음"])],
            kind="updated",
            scope="인원 관리",
            actor=admin_user,
        )
        break

    if updated is None:
        raise HTTPException(status_code=404, detail="user not found")

    _save_users(users)
    return {"ok": True, "item": updated}


@app.delete("/api/admin/users/{user_email}")
def admin_user_delete(user_email: str, request: Request):
    admin_user = _require_admin(request)
    target = str(user_email or "").strip().lower()
    if not target:
        raise HTTPException(status_code=400, detail="invalid user")
    if target in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="core admin cannot be deleted")

    users = _load_users()
    next_users = [x for x in users if str(x.get("email", "")).strip().lower() != target]
    employees = _load_json_array(EMPLOYEES_FILE)
    next_employees = [
        x
        for x in employees
        if str(x.get("account_email", "")).strip().lower() != target
    ]
    _save_users(next_users)
    if len(next_employees) != len(employees):
        _save_json_array(EMPLOYEES_FILE, next_employees)
    if len(next_users) < len(users):
        removed_employee_count = len(employees) - len(next_employees)
        details = [f"대상: {target}"]
        if removed_employee_count > 0:
            details.append(f"직원 연동 데이터 삭제: {removed_employee_count}건")
        _append_audit_update(
            "회원 계정 삭제",
            details,
            kind="removed",
            scope="인원 관리",
            actor=admin_user,
        )
    return {"ok": True, "deleted": len(next_users) < len(users)}


@app.get("/api/user/shortcut-state")
def get_user_shortcut_state(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    return {"ok": True, **_load_user_shortcut_state(user)}


@app.put("/api/user/shortcut-state")
async def put_user_shortcut_state(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")
    state = _save_user_shortcut_state(
        str(user.get("email", "")),
        payload.get("items") or [],
        payload.get("windows") or [],
    )
    return {"ok": True, **state}


@app.get("/mypage", response_class=HTMLResponse)
def mypage_page(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return RedirectResponse(url="/auth/login?next=/mypage", status_code=303)
    return templates.TemplateResponse("mypage.html", {"request": request})


@app.get("/admin", response_class=HTMLResponse)
def admin_page(request: Request):
    _require_admin(request)
    return templates.TemplateResponse("admin.html", {"request": request})


@app.get("/manage", response_class=HTMLResponse)
def manage_page(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return RedirectResponse(url="/auth/login?next=/manage", status_code=303)
    return templates.TemplateResponse("manage.html", {"request": request})


@app.get("/games", response_class=HTMLResponse)
def games_page(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return RedirectResponse(url="/auth/login?next=/games", status_code=303)
    if not _has_game_access(user):
        raise HTTPException(status_code=403, detail="game access denied")
    return templates.TemplateResponse("games.html", {"request": request})


@app.get("/games/stats", response_class=HTMLResponse)
def games_stats_page(request: Request):
    # Legacy path is kept for compatibility and redirected to the new game center.
    return RedirectResponse(url="/games", status_code=303)


@app.get("/api/games/scores")
def games_scores(request: Request):
    user = _require_game_access(request)
    records = _load_game_scores()
    valid_games = {"omok", "missile", "reva"}

    filtered = []
    for row in records:
        game = str(row.get("game", "")).strip().lower()
        if game not in valid_games:
            continue
        score_value = row.get("score", 0)
        try:
            score = int(score_value)
        except Exception:
            continue
        filtered.append(
            {
                "game": game,
                "score": score,
                "email": str(row.get("email", "")).strip().lower(),
                "name": str(row.get("name", "") or "").strip(),
                "played_at": str(row.get("played_at", "") or "").strip(),
            }
        )

    by_game: dict[str, list[dict]] = {"omok": [], "missile": [], "reva": []}
    for game in by_game:
        rows = [x for x in filtered if x["game"] == game]
        rows.sort(key=lambda x: (x["score"], x["played_at"]), reverse=True)
        by_game[game] = rows[:20]

    totals: dict[str, dict] = {}
    for row in filtered:
        key = row["email"]
        if not key:
            continue
        rec = totals.setdefault(
            key,
            {
                "email": key,
                "name": row["name"] or key.split("@")[0],
                "total_score": 0,
                "plays": 0,
                "best_reva": 0,
            },
        )
        rec["total_score"] += int(row["score"])
        rec["plays"] += 1
        if row["game"] == "reva":
            rec["best_reva"] = max(int(rec["best_reva"]), int(row["score"]))

    ranking = sorted(
        totals.values(),
        key=lambda x: (int(x["best_reva"]), int(x["total_score"]), -int(x["plays"])),
        reverse=True,
    )
    for idx, rec in enumerate(ranking, start=1):
        rec["rank"] = idx

    my_email = str(user.get("email", "")).strip().lower()
    my_stats = next((x for x in ranking if str(x.get("email", "")).lower() == my_email), None)

    return {
        "ok": True,
        "games": by_game,
        "ranking": ranking,
        "my_stats": my_stats,
    }


@app.post("/api/games/scores")
async def submit_game_score(request: Request):
    user = _require_game_access(request)
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    game = str(payload.get("game", "")).strip().lower()
    if game not in {"omok", "missile", "reva"}:
        raise HTTPException(status_code=400, detail="invalid game")

    try:
        score = int(payload.get("score", 0))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid score")
    if score < 0:
        raise HTTPException(status_code=400, detail="invalid score")

    now = datetime.utcnow().isoformat(timespec="seconds")
    email = str(user.get("email", "")).strip().lower()
    name = str(user.get("name", "") or "").strip() or email.split("@")[0]

    row = {
        "id": uuid.uuid4().hex,
        "game": game,
        "score": score,
        "email": email,
        "name": name,
        "played_at": now,
    }

    with AUTH_LOCK:
        records = _load_game_scores()
        records.append(row)
        if len(records) > 5000:
            records = records[-5000:]
        _save_game_scores(records)

    return {"ok": True, "item": row}


@app.get("/api/manage/assets")
def manage_assets(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    return {"ok": True, "items": _load_json_array(ASSETS_FILE)}


@app.get("/api/manage/schedules")
def manage_schedules(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    raw_items = _load_json_array(MANAGE_SCHEDULES_FILE)
    items = sorted(
        [
            {
                **row,
                "type": _normalize_manage_schedule_type(row.get("type", "vacation")),
                "approval_status": _normalize_manage_schedule_approval(row.get("approval_status", "pending")),
                "approved_by": str(row.get("approved_by", "") or "").strip().lower(),
                "approved_at": str(row.get("approved_at", "") or "").strip(),
                "reject_reason": str(row.get("reject_reason", "") or "").strip(),
                "brand": str(row.get("brand", "") or "").strip(),
            }
            for row in raw_items
        ],
        key=lambda row: (
            str(row.get("start_date", "")),
            str(row.get("end_date", "")),
            str(row.get("created_at", "")),
        ),
    )
    return {"ok": True, "items": items}


def _normalize_manage_schedule_type(raw_type: str) -> str:
    text = str(raw_type or "").strip().lower()
    aliases = {
        "vacation": "vacation",
        "annual_leave": "annual_leave",
        "annual-leave": "annual_leave",
        "annual": "annual_leave",
        "half_day": "half_day",
        "half-day": "half_day",
        "halfday": "half_day",
        "sick_leave": "sick_leave",
        "sick-leave": "sick_leave",
        "sick": "sick_leave",
        "deployment": "deployment",
        "release": "deployment",
        "meeting": "meeting",
        "brand_meeting": "brand_meeting",
        "brand-meeting": "brand_meeting",
        "brand": "brand_meeting",
        "schedule": "meeting",
        "memo": "meeting",
        "admin_schedule": "meeting",
    }
    return aliases.get(text, "vacation")


def _normalize_manage_schedule_approval(raw_status: str) -> str:
    text = str(raw_status or "").strip().lower()
    aliases = {
        "pending": "pending",
        "requested": "pending",
        "waiting": "pending",
        "approved": "approved",
        "approve": "approved",
        "ok": "approved",
        "rejected": "rejected",
        "reject": "rejected",
        "denied": "rejected",
    }
    return aliases.get(text, "pending")


def _parse_manage_schedule_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    schedule_type = _normalize_manage_schedule_type(payload.get("type", "vacation"))

    start_date = str(payload.get("start_date", "") or "").strip()
    end_date = str(payload.get("end_date", "") or start_date).strip()
    title = str(payload.get("title", "") or "").strip()
    brand = str(payload.get("brand", "") or "").strip()
    note = str(payload.get("note", "") or "").strip()

    if not start_date:
        raise HTTPException(status_code=400, detail="start date required")
    if not title:
        if schedule_type in {"meeting", "deployment", "brand_meeting"}:
            raise HTTPException(status_code=400, detail="title required")
        title_defaults = {
            "vacation": "휴가",
            "annual_leave": "연차",
            "half_day": "반차",
            "sick_leave": "병가",
            "deployment": "배포 일정",
            "meeting": "회의",
            "brand_meeting": "브랜드 회의",
        }
        title = title_defaults.get(schedule_type, "일정")

    try:
        start_dt = date.fromisoformat(start_date)
        end_dt = date.fromisoformat(end_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid date") from exc

    if end_dt < start_dt:
        raise HTTPException(status_code=400, detail="end date must be on or after start date")

    return {
        "type": schedule_type,
        "start_date": start_dt.isoformat(),
        "end_date": end_dt.isoformat(),
        "title": title,
        "brand": brand,
        "note": note,
    }


@app.post("/api/manage/schedules")
async def manage_schedule_create(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    payload = await request.json()
    parsed = _parse_manage_schedule_payload(payload)

    # 모든 일정은 관리자 승인 흐름으로 들어가도록 요청 상태를 pending으로 시작한다.
    approval_status = "pending"
    approved_by = ""
    approved_at = ""

    item = {
        "id": f"schedule-{uuid.uuid4().hex[:12]}",
        **parsed,
        "approval_status": approval_status,
        "approved_by": approved_by,
        "approved_at": approved_at,
        "reject_reason": "",
        "author_email": str(user.get("email", "")).strip().lower(),
        "author_name": str(user.get("name", "")).strip() or str(user.get("email", "")).strip().lower(),
        "created_at": datetime.utcnow().isoformat(timespec="seconds"),
    }

    with AUTH_LOCK:
        items = _load_json_array(MANAGE_SCHEDULES_FILE)
        items.append(item)
        _save_json_array(MANAGE_SCHEDULES_FILE, items)

    _append_audit_update(
        "일정 생성",
        [
            f"제목: {str(item.get('title', '')).strip() or '-'}",
            f"일정 유형: {str(item.get('type', '')).strip() or '-'}",
            f"시작일: {str(item.get('start_date', '')).strip() or '-'}",
            f"종료일: {str(item.get('end_date', '')).strip() or '-'}",
            f"승인 상태: {str(item.get('approval_status', '')).strip() or '-'}",
        ],
        kind="added",
        scope="일정 관리",
        actor=user,
    )

    return {"ok": True, "item": item}


@app.put("/api/manage/schedules/{schedule_id}")
async def manage_schedule_update(schedule_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})

    target_id = str(schedule_id or "").strip()
    if not target_id:
        raise HTTPException(status_code=400, detail="invalid schedule id")

    payload = await request.json()
    parsed = _parse_manage_schedule_payload(payload)

    with AUTH_LOCK:
        items = _load_json_array(MANAGE_SCHEDULES_FILE)
        target = next((row for row in items if str(row.get("id", "")).strip() == target_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="schedule not found")

        current_status = _normalize_manage_schedule_approval(target.get("approval_status", target.get("request_status", "pending")))
        if current_status == "approved":
            raise HTTPException(status_code=409, detail="approved schedule is locked")

        actor_email = str(user.get("email", "")).strip().lower()
        owner_email = str(target.get("author_email", "")).strip().lower()
        if actor_email != owner_email and not _is_admin_user(user):
            raise HTTPException(status_code=403, detail="edit not allowed")

        before = dict(target)
        target.update(parsed)
        # 수정 시에는 작성자/관리자 구분 없이 재승인 대상으로 전환한다.
        target["approval_status"] = "pending"
        target["approved_by"] = ""
        target["approved_at"] = ""
        target["reject_reason"] = ""
        _save_json_array(MANAGE_SCHEDULES_FILE, items)

    change_lines = _build_change_lines(before, target, ["type", "start_date", "end_date", "title", "brand", "note", "approval_status"])
    _append_audit_update(
        "일정 수정",
        [f"ID: {target_id}", *(change_lines or ["변경 항목 없음"])],
        kind="updated",
        scope="일정 관리",
        actor=user,
    )

    return {"ok": True, "item": target}


@app.delete("/api/manage/schedules/{schedule_id}")
def manage_schedule_delete(schedule_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})

    target_id = str(schedule_id or "").strip()
    if not target_id:
        raise HTTPException(status_code=400, detail="invalid schedule id")

    with AUTH_LOCK:
        items = _load_json_array(MANAGE_SCHEDULES_FILE)
        target = next((row for row in items if str(row.get("id", "")).strip() == target_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="schedule not found")

        current_status = _normalize_manage_schedule_approval(target.get("approval_status", target.get("request_status", "pending")))
        if current_status == "approved":
            raise HTTPException(status_code=409, detail="approved schedule is locked")

        actor_email = str(user.get("email", "")).strip().lower()
        owner_email = str(target.get("author_email", "")).strip().lower()
        if actor_email != owner_email and not _is_admin_user(user):
            raise HTTPException(status_code=403, detail="delete not allowed")

        next_items = [row for row in items if str(row.get("id", "")).strip() != target_id]
        _save_json_array(MANAGE_SCHEDULES_FILE, next_items)

    _append_audit_update(
        "일정 삭제",
        [
            f"제목: {str((target or {}).get('title', '')).strip() or '-'}",
            f"일정 유형: {str((target or {}).get('type', '')).strip() or '-'}",
            f"시작일: {str((target or {}).get('start_date', '')).strip() or '-'}",
            f"종료일: {str((target or {}).get('end_date', '')).strip() or '-'}",
        ],
        kind="removed",
        scope="일정 관리",
        actor=user,
    )
    return {"ok": True, "deleted": True}


@app.post("/api/manage/schedules/{schedule_id}/approval")
async def manage_schedule_approval(schedule_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    if not _is_admin_user(user):
        raise HTTPException(status_code=403, detail="admin only")

    target_id = str(schedule_id or "").strip()
    if not target_id:
        raise HTTPException(status_code=400, detail="invalid schedule id")

    payload = await request.json()
    status = _normalize_manage_schedule_approval((payload or {}).get("status", "pending"))
    if status not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="invalid approval status")

    reject_reason = str((payload or {}).get("reason", "") or "").strip()
    if status == "rejected" and not reject_reason:
        raise HTTPException(status_code=400, detail="reject reason required")

    with AUTH_LOCK:
        items = _load_json_array(MANAGE_SCHEDULES_FILE)
        target = next((row for row in items if str(row.get("id", "")).strip() == target_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="schedule not found")

        before = dict(target)
        target["approval_status"] = status
        target["approved_by"] = str(user.get("email", "")).strip().lower()
        target["approved_at"] = datetime.utcnow().isoformat(timespec="seconds")
        target["reject_reason"] = reject_reason if status == "rejected" else ""
        _save_json_array(MANAGE_SCHEDULES_FILE, items)

    change_lines = _build_change_lines(before, target, ["approval_status", "approved_by", "approved_at", "reject_reason"])
    _append_audit_update(
        "일정 승인 처리",
        [f"ID: {target_id}", *(change_lines or ["변경 항목 없음"])],
        kind="updated",
        scope="일정 관리",
        actor=user,
    )

    return {"ok": True, "item": target}


@app.post("/api/manage/schedules/{schedule_id}/withdraw-request")
async def manage_schedule_withdraw_request(schedule_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "login required"})
    if not _is_admin_user(user):
        raise HTTPException(status_code=403, detail="admin only")

    target_id = str(schedule_id or "").strip()
    if not target_id:
        raise HTTPException(status_code=400, detail="invalid schedule id")

    with AUTH_LOCK:
        items = _load_json_array(MANAGE_SCHEDULES_FILE)
        target = next((row for row in items if str(row.get("id", "")).strip() == target_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="schedule not found")

        current_status = _normalize_manage_schedule_approval(target.get("approval_status", "pending"))
        if current_status != "pending":
            raise HTTPException(status_code=400, detail="pending request not found")

        before = dict(target)
        target["approval_status"] = "rejected"
        target["approved_by"] = str(user.get("email", "")).strip().lower()
        target["approved_at"] = datetime.utcnow().isoformat(timespec="seconds")
        target["reject_reason"] = "관리자 요청취소"
        _save_json_array(MANAGE_SCHEDULES_FILE, items)

    change_lines = _build_change_lines(before, target, ["approval_status", "approved_by", "approved_at", "reject_reason"])
    _append_audit_update(
        "일정 요청 취소",
        [f"ID: {target_id}", *(change_lines or ["변경 항목 없음"])],
        kind="updated",
        scope="일정 관리",
        actor=user,
    )

    return {"ok": True, "item": target}


@app.get("/api/admin/employees")
def admin_employees(request: Request):
    _require_admin(request)
    users = _load_users()
    hash_preview_by_email: dict[str, str] = {}
    for user in users:
        email = str(user.get("email", "")).strip().lower()
        password_hash = str(user.get("password_hash", "") or "")
        hash_preview_by_email[email] = password_hash if password_hash else "(없음)"

    items = _load_json_array(EMPLOYEES_FILE)
    out = []
    for row in items:
        account_email = str(row.get("account_email", "")).strip().lower()
        out.append(
            {
                **row,
                "password_hash_preview": hash_preview_by_email.get(account_email, "(없음)"),
            }
        )
    return {"ok": True, "items": out}


def _asset_match_tokens(row: dict) -> set[str]:
    tokens: set[str] = set()
    for key in ("id", "NEW 관리 번호", "구 관리번호", "asset_no", "management_no"):
        value = str((row or {}).get(key, "") or "").strip()
        if not value:
            continue
        tokens.add(value)
        tokens.add(value.lower())
    return tokens


def _find_asset_index_by_key(items: list[dict], asset_key: str) -> int:
    key = str(asset_key or "").strip()
    if not key:
        return -1
    key_lower = key.lower()
    for idx, row in enumerate(items):
        row_tokens = _asset_match_tokens(row if isinstance(row, dict) else {})
        if key in row_tokens or key_lower in row_tokens:
            return idx
    return -1


@app.post("/api/admin/employees")
async def admin_employee_create(request: Request):
    admin_user = _require_admin(request)
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")
    items = _load_json_array(EMPLOYEES_FILE)
    item = {k: v for k, v in payload.items()}
    password = str(item.pop("password", "") or "").strip()
    item_id = str(item.get("id", "")).strip() or f"emp-{uuid.uuid4().hex[:10]}"
    item["id"] = item_id
    account_email = str(item.get("account_email", "")).strip().lower()
    item["account_email"] = account_email

    if password:
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="password too short")
        users = _load_users()
        user_row = next((x for x in users if str(x.get("email", "")).strip().lower() == account_email), None)
        if user_row is None:
            raise HTTPException(status_code=400, detail="linked user not found")
        user_row["password_hash"] = _hash_password(account_email, password)
        _save_users(users)
    items = [x for x in items if str(x.get("id", "")) != item_id]
    items.append(item)
    _save_json_array(EMPLOYEES_FILE, items)
    _append_audit_update(
        "인원 정보 추가",
        [
            f"ID: {item_id}",
            f"이름: {str(item.get('name', '')).strip() or '-'}",
            f"직책: {str(item.get('title', '')).strip() or '-'}",
            f"계정: {str(item.get('account_email', '')).strip() or '-'}",
        ],
        kind="added",
        scope="인원 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": item, "items": items}


@app.put("/api/admin/employees/{item_id}")
async def admin_employee_update(item_id: str, request: Request):
    admin_user = _require_admin(request)
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")
    items = _load_json_array(EMPLOYEES_FILE)
    updated = None
    change_lines: list[str] = []
    new_password = str(payload.get("password", "") or "").strip()
    safe_payload = {k: v for k, v in payload.items() if k != "password"}
    for idx, row in enumerate(items):
        if str(row.get("id", "")) == str(item_id):
            before = dict(row)
            merged = {**row, **safe_payload}
            merged["id"] = str(item_id)
            merged["account_email"] = str(merged.get("account_email", "")).strip().lower()
            items[idx] = merged
            updated = merged
            change_lines = _build_change_lines(before, merged, sorted({*before.keys(), *merged.keys()}))
            break
    if updated is None:
        raise HTTPException(status_code=404, detail="employee not found")

    if new_password:
        if len(new_password) < 8:
            raise HTTPException(status_code=400, detail="password too short")
        account_email = str(updated.get("account_email", "")).strip().lower()
        users = _load_users()
        user_row = next((x for x in users if str(x.get("email", "")).strip().lower() == account_email), None)
        if user_row is None:
            raise HTTPException(status_code=400, detail="linked user not found")
        user_row["password_hash"] = _hash_password(account_email, new_password)
        _save_users(users)
        change_lines.append("password: updated")

    _save_json_array(EMPLOYEES_FILE, items)
    _append_audit_update(
        "인원 정보 수정",
        [f"ID: {item_id}", *(change_lines[:12] or ["변경 항목 없음"])],
        kind="updated",
        scope="인원 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": updated, "items": items}


@app.delete("/api/admin/employees/{item_id}")
def admin_employee_delete(item_id: str, request: Request):
    admin_user = _require_admin(request)
    items = _load_json_array(EMPLOYEES_FILE)
    target = next((x for x in items if str(x.get("id", "")) == str(item_id)), None)
    next_items = [x for x in items if str(x.get("id", "")) != str(item_id)]
    _save_json_array(EMPLOYEES_FILE, next_items)
    if len(next_items) < len(items):
        _append_audit_update(
            "인원 정보 삭제",
            [
                f"ID: {item_id}",
                f"이름: {str((target or {}).get('name', '')).strip() or '-'}",
            ],
            kind="removed",
            scope="인원 관리",
            actor=admin_user,
        )
    return {"ok": True, "deleted": len(next_items) < len(items), "items": next_items}


@app.get("/api/admin/assets")
def admin_assets(request: Request, include_deleted: bool = False):
    _require_admin(request)
    items = _load_json_array(ASSETS_FILE)
    out = []
    changed = False
    normalized_items = []
    for row in items:
        item = dict(row)
        if not str(item.get("id", "") or "").strip():
            item["id"] = f"asset-{uuid.uuid4().hex[:10]}"
            changed = True
        normalized_items.append(item)
        status = str(item.get("status", "active") or "active").strip().lower()
        dr_status = str(item.get("delete_request_status", "none") or "none").strip().lower()
        if not include_deleted:
            if status in ("deleted", "cancelled"):
                continue
            if dr_status in ("approved", "cancelled"):
                continue
        out.append(item)
    if changed:
        _save_json_array(ASSETS_FILE, normalized_items)
    return {"ok": True, "items": out}


@app.post("/api/admin/assets")
async def admin_asset_create(request: Request):
    admin_user = _require_admin(request)
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")
    items = _load_json_array(ASSETS_FILE)
    item = {k: v for k, v in payload.items()}
    item_id = str(item.get("id", "")).strip() or f"asset-{uuid.uuid4().hex[:10]}"
    item["id"] = item_id
    item["status"] = str(item.get("status", "active") or "active").strip().lower() or "active"
    item["delete_request_status"] = str(item.get("delete_request_status", "none") or "none").strip().lower() or "none"
    items = [x for x in items if str(x.get("id", "")) != item_id]
    items.append(item)
    _save_json_array(ASSETS_FILE, items)
    _append_audit_update(
        "단말 자산 추가",
        [
            f"ID: {item_id}",
            f"구 관리번호: {str(item.get('구 관리번호', '')).strip() or '-'}",
            f"NEW 관리 번호: {str(item.get('NEW 관리 번호', '')).strip() or '-'}",
            f"기기 소지자: {str(item.get('기기 소지자', '')).strip() or '-'}",
        ],
        kind="added",
        scope="단말 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": item, "items": items}


@app.put("/api/admin/assets/{item_id}")
async def admin_asset_update(item_id: str, request: Request):
    admin_user = _require_admin(request)
    payload = await request.json()
    items = _load_json_array(ASSETS_FILE)
    updated = None
    change_lines: list[str] = []
    for idx, row in enumerate(items):
        if str(row.get("id", "")) == str(item_id):
            current_status = str(row.get("status", "active") or "active").strip().lower()
            current_req_status = str(row.get("delete_request_status", "none") or "none").strip().lower()
            if current_status in {"pending", "deleted", "cancelled"} or current_req_status == "pending":
                raise HTTPException(status_code=409, detail="asset is locked by delete approval workflow")

            before = dict(row)
            merged = {**row, **(payload if isinstance(payload, dict) else {})}
            merged["id"] = str(item_id)
            if not str(merged.get("status", "")).strip():
                merged["status"] = "active"
            if not str(merged.get("delete_request_status", "")).strip():
                merged["delete_request_status"] = "none"
            items[idx] = merged
            updated = merged
            change_lines = _build_change_lines(before, merged, sorted({*before.keys(), *merged.keys()}))
            break
    if updated is None:
        raise HTTPException(status_code=404, detail="asset not found")
    _save_json_array(ASSETS_FILE, items)
    _append_audit_update(
        "단말 자산 수정",
        [f"ID: {item_id}", *(change_lines[:12] or ["변경 항목 없음"])],
        kind="updated",
        scope="단말 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": updated, "items": items}


@app.delete("/api/admin/assets/{item_id}")
def admin_asset_delete(item_id: str, request: Request):
    admin_user = _require_admin(request)
    items = _load_json_array(ASSETS_FILE)
    target = next((x for x in items if str(x.get("id", "")) == str(item_id)), None)
    next_items = [x for x in items if str(x.get("id", "")) != str(item_id)]
    _save_json_array(ASSETS_FILE, next_items)
    if len(next_items) < len(items):
        _append_audit_update(
            "단말 자산 삭제",
            [
                f"ID: {item_id}",
                f"구 관리번호: {str((target or {}).get('구 관리번호', '')).strip() or '-'}",
                f"NEW 관리 번호: {str((target or {}).get('NEW 관리 번호', '')).strip() or '-'}",
            ],
            kind="removed",
            scope="단말 관리",
            actor=admin_user,
        )
    return {"ok": True, "deleted": len(next_items) < len(items), "items": next_items}


@app.post("/api/admin/assets/{item_id}/request-delete")
def admin_asset_request_delete(item_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    actor_email = str(user.get("email", "")).strip().lower() or "unknown"

    items = _load_json_array(ASSETS_FILE)
    target = None
    before_status = ""
    before_delete_status = ""
    item_key = str(item_id or "").strip()
    idx = _find_asset_index_by_key(items, item_key)
    if idx >= 0:
        target = dict(items[idx])
        if not str(target.get("id", "") or "").strip():
            target["id"] = f"asset-{uuid.uuid4().hex[:10]}"
        before_status = str(target.get("status", "active") or "active").strip().lower()
        before_delete_status = str(target.get("delete_request_status", "none") or "none").strip().lower()

        if before_status in {"pending", "deleted", "cancelled"} or before_delete_status == "pending":
            raise HTTPException(status_code=409, detail="asset is already in delete approval workflow")

        target["status"] = "pending"
        target["delete_request_status"] = "pending"
        target["delete_requested_by"] = actor_email
        target["delete_requested_at"] = datetime.utcnow().isoformat(timespec="seconds")
        target.pop("delete_reviewed_by", None)
        target.pop("delete_reviewed_at", None)
        target.pop("delete_reject_reason", None)
        items[idx] = target

    if target is None:
        raise HTTPException(status_code=404, detail="asset not found")

    _save_json_array(ASSETS_FILE, items)
    _append_audit_update(
        "단말 자산 삭제 요청",
        [
            f"ID: {item_id}",
            f"요청자: {actor_email}",
            f"상태: {before_status or '-'} -> pending",
            f"삭제요청상태: {before_delete_status or '-'} -> pending",
            f"구 관리번호: {str(target.get('구 관리번호', '')).strip() or '-'}",
        ],
        kind="updated",
        scope="단말 관리",
        actor=user,
    )
    return {"ok": True, "item": target}


@app.post("/api/admin/assets/request-delete-bulk")
async def admin_asset_request_delete_bulk(request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    actor_email = str(user.get("email", "")).strip().lower() or "unknown"

    payload = await request.json()
    ids = payload.get("ids") if isinstance(payload, dict) else []
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="ids must be a list")
    request_ids = [str(x or "").strip() for x in ids if str(x or "").strip()]
    if not request_ids:
        raise HTTPException(status_code=400, detail="no ids provided")

    items = _load_json_array(ASSETS_FILE)
    not_found: list[str] = []
    locked_ids: list[str] = []
    updated_items: list[dict] = []

    for req_id in request_ids:
        idx = _find_asset_index_by_key(items, req_id)
        if idx < 0:
            not_found.append(req_id)
            continue

        target = dict(items[idx])
        if not str(target.get("id", "") or "").strip():
            target["id"] = f"asset-{uuid.uuid4().hex[:10]}"
        before_status = str(target.get("status", "active") or "active").strip().lower()
        before_delete_status = str(target.get("delete_request_status", "none") or "none").strip().lower()

        if before_status in {"pending", "deleted", "cancelled"} or before_delete_status == "pending":
            locked_ids.append(req_id)
            continue

        target["status"] = "pending"
        target["delete_request_status"] = "pending"
        target["delete_requested_by"] = actor_email
        target["delete_requested_at"] = datetime.utcnow().isoformat(timespec="seconds")
        target.pop("delete_reviewed_by", None)
        target.pop("delete_reviewed_at", None)
        target.pop("delete_reject_reason", None)
        items[idx] = target
        updated_items.append(target)

        _append_audit_update(
            "단말 자산 삭제 요청",
            [
                f"ID: {str(target.get('id', '')).strip() or req_id}",
                f"요청자: {actor_email}",
                f"상태: {before_status or '-'} -> pending",
                f"삭제요청상태: {before_delete_status or '-'} -> pending",
                f"구 관리번호: {str(target.get('구 관리번호', '')).strip() or '-'}",
            ],
            kind="updated",
            scope="단말 관리",
            actor=user,
        )

    if not updated_items:
        if locked_ids and not not_found:
            raise HTTPException(status_code=409, detail=f"asset is already in delete approval workflow: {', '.join(locked_ids[:5])}")
        if not_found and not locked_ids:
            raise HTTPException(status_code=404, detail=f"asset not found: {', '.join(not_found[:5])}")
        raise HTTPException(
            status_code=409,
            detail=f"request blocked (locked: {', '.join(locked_ids[:3]) or '-'}, not found: {', '.join(not_found[:3]) or '-'})",
        )

    _save_json_array(ASSETS_FILE, items)

    return {
        "ok": True,
        "requested": len(request_ids),
        "updated": len(updated_items),
        "not_found": not_found,
        "items": updated_items,
    }


@app.post("/api/admin/assets/{item_id}/withdraw-request")
def admin_asset_withdraw_request(item_id: str, request: Request):
    """일반 사용자 또는 관리자가 pending 상태의 삭제 요청을 철회합니다."""
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    actor_email = str(user.get("email", "")).strip().lower() or "unknown"

    items = _load_json_array(ASSETS_FILE)
    item_key = str(item_id or "").strip()
    idx = _find_asset_index_by_key(items, item_key)
    if idx < 0:
        raise HTTPException(status_code=404, detail="asset not found")

    target = dict(items[idx])
    current_req_status = str(target.get("delete_request_status", "none") or "none").strip().lower()
    if current_req_status != "pending":
        raise HTTPException(status_code=400, detail="pending request not found")

    before_status = str(target.get("status", "pending") or "pending").strip().lower()
    requester = str(target.get("delete_requested_by", "")).strip() or "-"

    target["status"] = "active"
    target["delete_request_status"] = "none"
    target.pop("delete_requested_by", None)
    target.pop("delete_requested_at", None)
    target.pop("delete_reviewed_by", None)
    target.pop("delete_reviewed_at", None)
    target.pop("delete_reject_reason", None)
    items[idx] = target
    _save_json_array(ASSETS_FILE, items)

    _append_audit_update(
        "단말 자산 삭제 요청 철회",
        [
            f"ID: {str(target.get('id', '')).strip() or item_id}",
            f"철회자: {actor_email}",
            f"원 요청자: {requester}",
            f"상태: {before_status or '-'} -> active",
            f"삭제요청상태: pending -> none",
            f"구 관리번호: {str(target.get('구 관리번호', '')).strip() or '-'}",
        ],
        kind="updated",
        scope="단말 관리",
        actor=user,
    )
    return {"ok": True, "item": target}


@app.get("/api/admin/assets/delete-requests")
def admin_asset_delete_requests(request: Request):
    _require_admin(request)
    items = _load_json_array(ASSETS_FILE)
    pending: list[dict] = []

    for row in items:
        if str(row.get("delete_request_status", "none") or "none").strip().lower() != "pending":
            continue

        row_id = str(row.get("id", "") or "").strip() or f"asset-{uuid.uuid4().hex[:10]}"
        requester_id = str(row.get("delete_requested_by", "") or "").strip().lower()
        requester_user = _find_user(requester_id) if requester_id else None
        requester_name = str((requester_user or {}).get("name", "") or "").strip() or requester_id or "-"
        requested_at = str(row.get("delete_requested_at", "") or "").strip()

        pending.append(
            {
                "request_id": f"asset-delete::{row_id}",
                "target_id": row_id,
                "source_type": "asset-delete",
                "page_name": "단말관리",
                "request_label": "단말 삭제 요청",
                "requester_name": requester_name,
                "requester_id": requester_id or "-",
                "requested_at": requested_at,
                "detail_lines": [
                    "요청 구분: 단말 삭제 요청",
                    "페이지: 단말관리",
                    f"ID: {row_id}",
                    f"구 관리번호: {str(row.get('구 관리번호', '')).strip() or '-'}",
                    f"NEW 관리 번호: {str(row.get('NEW 관리 번호', '')).strip() or '-'}",
                    f"기기 소지자: {str(row.get('기기 소지자', '')).strip() or '-'}",
                    f"요청자 이름: {requester_name}",
                    f"요청자 아이디: {requester_id or '-'}",
                    f"요청일시: {requested_at or '-'}",
                ],
            }
        )

    # 일정관리 승인 요청 데이터가 같은 파일 포맷으로 저장되면 동일 목록에 합류시킨다.
    for row in _load_json_array(MANAGE_SCHEDULES_FILE):
        raw_status = row.get("approval_status", row.get("request_status", "none"))
        approval_status = _normalize_manage_schedule_approval(raw_status)
        if approval_status != "pending":
            continue

        schedule_id = str(row.get("id", "") or "").strip() or f"schedule-{uuid.uuid4().hex[:10]}"
        requester_id = str(row.get("author_email", row.get("requested_by", "")) or "").strip().lower()
        requester_name = str(row.get("author_name", row.get("requested_by_name", "")) or "").strip() or requester_id or "-"
        requested_at = str(row.get("requested_at", row.get("created_at", "")) or "").strip()
        request_label = str(row.get("request_label", row.get("request_action", "일정 요청")) or "일정 요청").strip()

        pending.append(
            {
                "request_id": f"schedule::{schedule_id}",
                "target_id": schedule_id,
                "source_type": "schedule",
                "page_name": "일정관리",
                "request_label": request_label,
                "requester_name": requester_name,
                "requester_id": requester_id or "-",
                "requested_at": requested_at,
                "detail_lines": [
                    f"요청 구분: {request_label}",
                    "페이지: 일정관리",
                    f"ID: {schedule_id}",
                    f"제목: {str(row.get('title', '')).strip() or '-'}",
                    f"일정 유형: {str(row.get('type', '')).strip() or '-'}",
                    f"시작일: {str(row.get('start_date', '')).strip() or '-'}",
                    f"종료일: {str(row.get('end_date', '')).strip() or '-'}",
                    f"요청자 이름: {requester_name}",
                    f"요청자 아이디: {requester_id or '-'}",
                    f"요청일시: {requested_at or '-'}",
                    f"비고: {str(row.get('note', '')).strip() or '-'}",
                ],
            }
        )

    # 게시판 승인 대기 글도 공통 요청 목록으로 합류시킨다.
    board_posts = _load_json_array(BOARD_POSTS_FILE)
    for row in board_posts:
        if str(row.get("status", "pending") or "pending").strip().lower() != "pending":
            continue

        post_id = str(row.get("id", "") or "").strip()
        if not post_id:
            continue
        requester_id = str(row.get("author_email", "") or "").strip().lower()
        requester_name = str(row.get("author_name", "") or "").strip() or requester_id or "-"
        requested_at = str(row.get("created_at", "") or "").strip()
        priority = str(row.get("priority", "Medium") or "Medium").strip()

        pending.append(
            {
                "request_id": f"board::{post_id}",
                "target_id": post_id,
                "source_type": "board",
                "page_name": "게시판",
                "request_label": "게시글 승인 요청",
                "requester_name": requester_name,
                "requester_id": requester_id or "-",
                "requested_at": requested_at,
                "detail_lines": [
                    "요청 구분: 게시글 승인 요청",
                    "페이지: 게시판",
                    f"ID: {post_id}",
                    f"제목: {str(row.get('title', '')).strip() or '-'}",
                    f"우선순위: {priority}",
                    f"작성자 이름: {requester_name}",
                    f"작성자 아이디: {requester_id or '-'}",
                    f"요청일시: {requested_at or '-'}",
                ],
            }
        )

    pending.sort(key=lambda r: str(r.get("requested_at", "")), reverse=True)
    return {"ok": True, "items": pending}


@app.get("/api/admin/assets/deleted-items")
def admin_asset_deleted_items(request: Request):
    _require_admin(request)
    items = _load_json_array(ASSETS_FILE)
    deleted = [
        dict(x)
        for x in items
        if str(x.get("delete_request_status", "none") or "none").strip().lower() in ("approved", "cancelled")
    ]

    def _deleted_sort_key(row: dict) -> str:
        return str(
            row.get("delete_cancelled_at", "")
            or row.get("delete_reviewed_at", "")
            or row.get("delete_requested_at", "")
        )

    deleted.sort(key=_deleted_sort_key, reverse=True)
    return {"ok": True, "items": deleted}


@app.get("/api/admin/assets/rejected-items")
def admin_asset_rejected_items(request: Request):
    _require_admin(request)
    items = _load_json_array(ASSETS_FILE)
    rejected = [
        dict(x)
        for x in items
        if str(x.get("delete_request_status", "none") or "none").strip().lower() == "rejected"
    ]
    rejected.sort(key=lambda r: str(r.get("delete_reviewed_at", "")), reverse=True)
    return {"ok": True, "items": rejected}


@app.get("/api/admin/activity-log")
def admin_activity_log(request: Request, limit: int = 300, include_all: bool = True):
    _require_admin(request)
    updates: list[dict] = []
    if OVERVIEW_UPDATES_FILE.exists():
        try:
            payload = json.loads(OVERVIEW_UPDATES_FILE.read_text(encoding="utf-8"))
            if isinstance(payload, list):
                updates = [x for x in payload if isinstance(x, dict)]
        except Exception:
            updates = []

    # 기본: 상태 변경성 이력(승인/차단/삭제/수정/요청 등)을 전체 사용자 기준으로 반환
    filtered = list(updates)
    if not include_all:
        keywords = ("상태", "승인", "반려", "삭제", "차단", "허용", "요청", "수정", "생성", "변경")

        def _is_status_like(row: dict) -> bool:
            title = str(row.get("title", "") or "")
            scope = str(row.get("scope", "") or "")
            detail_text = " ".join(str(x or "") for x in list(row.get("details") or []))
            merged = f"{title} {scope} {detail_text}"
            if any(kw in merged for kw in keywords):
                return True
            return "->" in detail_text

        filtered = [row for row in updates if _is_status_like(row)]

    filtered.sort(key=lambda r: str(r.get("updated_at", "")), reverse=True)
    result = []
    for row in filtered[:max(1, int(limit))]:
        details = list(row.get("details") or [])
        # 작업자는 details[0]에서 추출 ("작업자: ...")
        actor = ""
        other_details = []
        for d in details:
            d_text = str(d)
            if d_text.startswith("작업자:"):
                actor = d_text.split(":", 1)[1].strip() if ":" in d_text else ""
            else:
                other_details.append(d_text)
        result.append({
            "updated_at": str(row.get("updated_at", "")),
            "title": str(row.get("title", "")),
            "kind": str(row.get("kind", "")),
            "scope": str(row.get("scope", "")),
            "actor": actor,
            "details": other_details,
        })
    return {"ok": True, "items": result}



@app.post("/api/admin/assets/{item_id}/approve-delete")
def admin_asset_approve_delete(item_id: str, request: Request):
    admin_user = _require_admin(request)
    reviewer = str(admin_user.get("email", "")).strip().lower() or "admin"
    items = _load_json_array(ASSETS_FILE)
    target = None
    before_status = ""
    before_delete_status = ""
    item_key = str(item_id or "").strip()
    for idx, row in enumerate(items):
        if item_key in _asset_match_tokens(row):
            target = dict(row)
            if not str(target.get("id", "") or "").strip():
                target["id"] = f"asset-{uuid.uuid4().hex[:10]}"
            before_status = str(target.get("status", "active") or "active").strip().lower()
            before_delete_status = str(target.get("delete_request_status", "none") or "none").strip().lower()
            target["status"] = "deleted"
            target["delete_request_status"] = "approved"
            target["delete_reviewed_by"] = reviewer
            target["delete_reviewed_at"] = datetime.utcnow().isoformat(timespec="seconds")
            items[idx] = target
            break
    if target is None:
        raise HTTPException(status_code=404, detail="asset not found")

    _save_json_array(ASSETS_FILE, items)
    _append_audit_update(
        "단말 자산 삭제 승인",
        [
            f"ID: {item_id}",
            f"승인자: {reviewer}",
            f"상태: {before_status or '-'} -> deleted",
            f"삭제요청상태: {before_delete_status or '-'} -> approved",
            f"구 관리번호: {str(target.get('구 관리번호', '')).strip() or '-'}",
        ],
        kind="removed",
        scope="단말 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": target}


@app.post("/api/admin/assets/{item_id}/reject-delete")
async def admin_asset_reject_delete(item_id: str, request: Request):
    admin_user = _require_admin(request)
    reviewer = str(admin_user.get("email", "")).strip().lower() or "admin"
    payload = await request.json()
    reason = str((payload or {}).get("reason", "") or "").strip()

    items = _load_json_array(ASSETS_FILE)
    target = None
    before_status = ""
    before_delete_status = ""
    item_key = str(item_id or "").strip()
    for idx, row in enumerate(items):
        if item_key in _asset_match_tokens(row):
            target = dict(row)
            if not str(target.get("id", "") or "").strip():
                target["id"] = f"asset-{uuid.uuid4().hex[:10]}"
            before_status = str(target.get("status", "active") or "active").strip().lower()
            before_delete_status = str(target.get("delete_request_status", "none") or "none").strip().lower()
            target["status"] = "rejected"
            target["delete_request_status"] = "rejected"
            target["delete_reviewed_by"] = reviewer
            target["delete_reviewed_at"] = datetime.utcnow().isoformat(timespec="seconds")
            if reason:
                target["delete_reject_reason"] = reason
            items[idx] = target
            break
    if target is None:
        raise HTTPException(status_code=404, detail="asset not found")

    _save_json_array(ASSETS_FILE, items)
    _append_audit_update(
        "단말 자산 삭제 반려",
        [
            f"ID: {item_id}",
            f"반려자: {reviewer}",
            f"상태: {before_status or '-'} -> rejected",
            f"삭제요청상태: {before_delete_status or '-'} -> rejected",
            f"사유: {reason or '-'}",
        ],
        kind="updated",
        scope="단말 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": target}


@app.post("/api/admin/assets/{item_id}/cancel-approval")
def admin_asset_cancel_approval(item_id: str, request: Request):
    admin_user = _require_admin(request)
    reviewer = str(admin_user.get("email", "")).strip().lower() or "admin"
    items = _load_json_array(ASSETS_FILE)
    idx = _find_asset_index_by_key(items, str(item_id or "").strip())
    if idx < 0:
        raise HTTPException(status_code=404, detail="asset not found")

    target = dict(items[idx])
    current_req_status = str(target.get("delete_request_status", "none") or "none").strip().lower()
    if current_req_status != "approved":
        raise HTTPException(status_code=400, detail="approved request not found")

    before_status = str(target.get("status", "active") or "active").strip().lower()
    before_delete_status = current_req_status

    target["status"] = "cancelled"
    target["delete_request_status"] = "cancelled"
    target["delete_cancelled_by"] = reviewer
    target["delete_cancelled_at"] = datetime.utcnow().isoformat(timespec="seconds")
    target.pop("delete_reject_reason", None)
    items[idx] = target
    _save_json_array(ASSETS_FILE, items)

    _append_audit_update(
        "단말 자산 삭제 승인 취소",
        [
            f"ID: {str(target.get('id', '')).strip() or str(item_id)}",
            f"처리자: {reviewer}",
            f"상태: {before_status or '-'} -> cancelled",
            f"삭제요청상태: {before_delete_status or '-'} -> cancelled",
            f"구 관리번호: {str(target.get('구 관리번호', '')).strip() or '-'}",
        ],
        kind="updated",
        scope="단말 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": target}


@app.post("/api/admin/assets/{item_id}/restore-deleted")
def admin_asset_restore_deleted(item_id: str, request: Request):
    admin_user = _require_admin(request)
    reviewer = str(admin_user.get("email", "")).strip().lower() or "admin"
    items = _load_json_array(ASSETS_FILE)
    idx = _find_asset_index_by_key(items, str(item_id or "").strip())
    if idx < 0:
        raise HTTPException(status_code=404, detail="asset not found")

    target = dict(items[idx])
    current_req_status = str(target.get("delete_request_status", "none") or "none").strip().lower()
    if current_req_status != "approved":
        raise HTTPException(status_code=400, detail="deleted item not found")

    before_status = str(target.get("status", "active") or "active").strip().lower()
    before_delete_status = current_req_status
    target["status"] = "active"
    target["delete_request_status"] = "none"
    target.pop("delete_reviewed_by", None)
    target.pop("delete_reviewed_at", None)
    target.pop("delete_reject_reason", None)
    items[idx] = target
    _save_json_array(ASSETS_FILE, items)

    _append_audit_update(
        "단말 자산 복구(삭제됨)",
        [
            f"ID: {str(target.get('id', '')).strip() or str(item_id)}",
            f"처리자: {reviewer}",
            f"상태: {before_status or '-'} -> active",
            f"삭제요청상태: {before_delete_status or '-'} -> none",
        ],
        kind="updated",
        scope="단말 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": target}


@app.post("/api/admin/assets/{item_id}/restore-rejected")
def admin_asset_restore_rejected(item_id: str, request: Request):
    admin_user = _require_admin(request)
    reviewer = str(admin_user.get("email", "")).strip().lower() or "admin"
    items = _load_json_array(ASSETS_FILE)
    idx = _find_asset_index_by_key(items, str(item_id or "").strip())
    if idx < 0:
        raise HTTPException(status_code=404, detail="asset not found")

    target = dict(items[idx])
    current_req_status = str(target.get("delete_request_status", "none") or "none").strip().lower()
    if current_req_status != "rejected":
        raise HTTPException(status_code=400, detail="rejected item not found")

    before_status = str(target.get("status", "active") or "active").strip().lower()
    before_delete_status = current_req_status
    target["status"] = "active"
    target["delete_request_status"] = "none"
    target.pop("delete_reviewed_by", None)
    target.pop("delete_reviewed_at", None)
    target.pop("delete_reject_reason", None)
    items[idx] = target
    _save_json_array(ASSETS_FILE, items)

    _append_audit_update(
        "단말 자산 복구(반려됨)",
        [
            f"ID: {str(target.get('id', '')).strip() or str(item_id)}",
            f"처리자: {reviewer}",
            f"상태: {before_status or '-'} -> active",
            f"삭제요청상태: {before_delete_status or '-'} -> none",
        ],
        kind="updated",
        scope="단말 관리",
        actor=admin_user,
    )
    return {"ok": True, "item": target}


# ─── 게시판 (Board) ────────────────────────────────────────────────────────────
BOARD_POSTS_FILE = BASE_DIR.parent / "config" / "board_posts.json"
BOARD_EMOJIS_FILE = BASE_DIR.parent / "config" / "board_emojis.json"
BOARD_UPLOAD_DIR = UPLOAD_DIR / "board"
BOARD_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
BOARD_COMMENT_UPLOAD_DIR = BOARD_UPLOAD_DIR / "comments"
BOARD_COMMENT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
BOARD_EMOJI_UPLOAD_DIR = BOARD_UPLOAD_DIR / "emojis"
BOARD_EMOJI_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
BOARD_LOCK = threading.Lock()
BOARD_MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
BOARD_COMMENT_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
BOARD_COMMENT_MAX_FILE_COUNT = 5
BOARD_CUSTOM_EMOJI_MAX_FILE_SIZE = 512 * 1024  # 512 KB
BOARD_CUSTOM_EMOJI_ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
BOARD_URGENT_CACHE_TTL_SEC = 5.0
BOARD_URGENT_CACHE_LOCK = threading.Lock()
BOARD_URGENT_CACHE: dict[str, dict] = {}
BOARD_UPDATE_SEQ_LOCK = threading.Lock()
BOARD_UPDATE_SEQ = 1
BOARD_UPDATE_TS = datetime.utcnow().isoformat(timespec="seconds")
BOARD_ALLOWED_EXT = {
    ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
    ".txt", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".mp4", ".csv",
}


_MENTION_PATTERN = re.compile(r'@([\w가-힣]{1,30})', re.UNICODE)


def _extract_mentions(content: str) -> list[str]:
    """댓글 본문에서 @이름 형태의 멘션 이름 목록을 추출합니다. (중복 제거)"""
    return list(dict.fromkeys(_MENTION_PATTERN.findall(content)))


def _board_touch_update() -> int:
    global BOARD_UPDATE_SEQ, BOARD_UPDATE_TS
    with BOARD_UPDATE_SEQ_LOCK:
        BOARD_UPDATE_SEQ += 1
        BOARD_UPDATE_TS = datetime.utcnow().isoformat(timespec="seconds")
        return BOARD_UPDATE_SEQ


def _board_update_snapshot() -> tuple[int, str]:
    with BOARD_UPDATE_SEQ_LOCK:
        return BOARD_UPDATE_SEQ, BOARD_UPDATE_TS


def _get_board_read_post_ids(user_email: str) -> set[str]:
    target_email = str(user_email or "").strip().lower()
    if not target_email:
        return set()
    user = _find_user(target_email)
    if not user:
        return set()
    raw_ids = user.get("board_read_post_ids") or []
    return {str(v).strip() for v in raw_ids if str(v).strip()}


def _mark_board_post_read(user_email: str, post_id: str) -> None:
    target_email = str(user_email or "").strip().lower()
    target_post_id = str(post_id or "").strip()
    if not target_email or not target_post_id:
        return

    with AUTH_LOCK:
        users = _load_users()
        changed = False
        for row in users:
            email = str((row or {}).get("email", "")).strip().lower()
            if email != target_email:
                continue
            ids = [str(v).strip() for v in (row.get("board_read_post_ids") or []) if str(v).strip()]
            if target_post_id in ids:
                break
            ids.insert(0, target_post_id)
            row["board_read_post_ids"] = ids[:500]
            changed = True
            break
        if changed:
            _save_users(users)


def _board_summary(p: dict) -> dict:
    return {
        "id": str(p.get("id", "")),
        "title": str(p.get("title", "")),
        "author_name": str(p.get("author_name", "")),
        "author_email": str(p.get("author_email", "")),
        "priority": str(p.get("priority", "Medium")),
        "status": str(p.get("status", "pending")),
        "comment_count": len(list(p.get("comments") or [])),
        "file_count": len(list(p.get("files") or [])),
        "created_at": str(p.get("created_at", "")),
        "reviewed_at": str(p.get("reviewed_at", "") or ""),
        "reject_reason": str(p.get("reject_reason", "") or ""),
    }


def _board_detail_payload(post: dict) -> dict:
    payload = dict(post or {})
    payload["id"] = str(payload.get("id", "")).strip()
    payload["title"] = str(payload.get("title", ""))
    payload["author_name"] = str(payload.get("author_name", ""))
    payload["author_email"] = str(payload.get("author_email", "")).strip().lower()
    payload["content"] = str(payload.get("content", ""))
    payload["priority"] = str(payload.get("priority", "Medium") or "Medium")
    payload["status"] = str(payload.get("status", "pending") or "pending")
    payload["created_at"] = str(payload.get("created_at", "") or "")
    payload["updated_at"] = str(payload.get("updated_at", "") or "")
    payload["reviewed_at"] = str(payload.get("reviewed_at", "") or "")
    payload["reject_reason"] = str(payload.get("reject_reason", "") or "")

    files = payload.get("files")
    if not isinstance(files, list):
        files = []
    payload["files"] = [row for row in files if isinstance(row, dict)]

    comments = payload.get("comments")
    if not isinstance(comments, list):
        comments = []
    normalized_comments: list[dict] = []
    for row in comments:
        if not isinstance(row, dict):
            continue
        c = dict(row)
        c["id"] = str(c.get("id", "")).strip()
        c["author_name"] = str(c.get("author_name", ""))
        c["author_email"] = str(c.get("author_email", "")).strip().lower()
        c["content"] = str(c.get("content", ""))
        c["parent_id"] = str(c.get("parent_id", "") or "").strip()
        c["created_at"] = str(c.get("created_at", "") or "")
        c["mentions"] = [m for m in (c.get("mentions") if isinstance(c.get("mentions"), list) else []) if isinstance(m, dict)]
        c["files"] = [f for f in (c.get("files") if isinstance(c.get("files"), list) else []) if isinstance(f, dict)]
        c["reactions"] = [r for r in (c.get("reactions") if isinstance(c.get("reactions"), list) else []) if isinstance(r, dict)]
        normalized_comments.append(c)
    payload["comments"] = normalized_comments
    return payload


def _board_id_equals(row: dict, post_id: str) -> bool:
    return str((row or {}).get("id", "")).strip() == str(post_id or "").strip()


def _board_priority_order(priority: str) -> int:
    return {"High": 0, "Medium": 1, "Low": 2}.get(str(priority or "Medium"), 1)


def _board_admin_email_set() -> set[str]:
    admin_emails = {str(x or "").strip().lower() for x in ADMIN_EMAILS if str(x or "").strip()}
    for user in _load_users():
        if str(user.get("role", "user")).strip().lower() == "admin":
            email = str(user.get("email", "")).strip().lower()
            if email:
                admin_emails.add(email)
    return admin_emails


def _normalize_admin_authored_board_posts(posts: list[dict]) -> bool:
    admin_emails = _board_admin_email_set()
    changed = False
    now = datetime.utcnow().isoformat(timespec="seconds")

    for post in posts:
        if not isinstance(post, dict):
            continue
        author_email = str(post.get("author_email", "")).strip().lower()
        if not author_email or author_email not in admin_emails:
            continue

        status = str(post.get("status", "pending")).strip().lower()
        if status != "approved":
            post["status"] = "approved"
            post["reviewed_by"] = author_email
            post["reviewed_at"] = str(post.get("reviewed_at", "")).strip() or now
            post.pop("reject_reason", None)
            changed = True
    return changed


def _delete_board_comment_tree(comments: list[dict], comment_id: str) -> tuple[list[dict], dict | None]:
    target_id = str(comment_id or "").strip()
    if not target_id:
        return list(comments or []), None

    comment_map: dict[str, dict] = {}
    children_map: dict[str, list[str]] = {}
    for item in list(comments or []):
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id", "")).strip()
        if not item_id:
            continue
        comment_map[item_id] = item
        parent_id = str(item.get("parent_id", "")).strip()
        if parent_id:
            children_map.setdefault(parent_id, []).append(item_id)

    target = comment_map.get(target_id)
    if not target:
        return list(comments or []), None

    remove_ids = {target_id}
    stack = [target_id]
    while stack:
        current = stack.pop()
        for child_id in children_map.get(current, []):
            if child_id not in remove_ids:
                remove_ids.add(child_id)
                stack.append(child_id)

    remaining = [item for item in list(comments or []) if str(item.get("id", "")).strip() not in remove_ids]
    return remaining, target


def _can_view_board_post(post: dict, user: dict | None) -> bool:
    if not user:
        return False
    status = str(post.get("status", "pending")).strip().lower()
    if status == "approved":
        return True
    if _is_admin_user(user):
        return True
    viewer_email = str(user.get("email", "")).strip().lower()
    author_email = str(post.get("author_email", "")).strip().lower()
    return bool(viewer_email and author_email and viewer_email == author_email)


@app.get("/board", response_class=HTMLResponse)
def board_page(request: Request):
    user = _current_user_from_request(request)
    if not user:
        return RedirectResponse(url="/auth/login?next=/board", status_code=303)
    return templates.TemplateResponse("board.html", {"request": request})


@app.get("/api/board/posts")
def board_list(request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    posts = _load_json_array(BOARD_POSTS_FILE)
    if _normalize_admin_authored_board_posts(posts):
        with BOARD_LOCK:
            _save_json_array(BOARD_POSTS_FILE, posts)
    is_admin = _is_admin_user(user)
    result = []
    for p in posts:
        if _can_view_board_post(p, user):
            result.append(_board_summary(p))
    result.sort(key=lambda r: str(r.get("created_at", "")), reverse=True)
    return {"ok": True, "items": result, "is_admin": is_admin}


@app.get("/api/board/posts/{post_id}")
def board_get_post(post_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    posts = _load_json_array(BOARD_POSTS_FILE)
    if _normalize_admin_authored_board_posts(posts):
        with BOARD_LOCK:
            _save_json_array(BOARD_POSTS_FILE, posts)
    post = next((p for p in posts if _board_id_equals(p, post_id)), None)
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    is_admin = _is_admin_user(user)
    if not _can_view_board_post(post, user):
        raise HTTPException(status_code=403, detail="not approved")

    # 상세 조회 시 해당 게시글을 읽음 처리한다.
    _mark_board_post_read(str(user.get("email", "")).strip().lower(), str(post.get("id", "")).strip())

    normalized_post = _board_detail_payload(post)

    return {"ok": True, "post": normalized_post, "is_admin": is_admin,
            "current_email": str(user.get("email", "")).strip().lower()}


@app.get("/api/board/post")
def board_get_post_by_query(post_id: str, request: Request):
    # Fallback endpoint for environments where encoded path params can be unstable.
    return board_get_post(post_id, request)


@app.post("/api/board/posts")
async def board_create_post(
    request: Request,
    title: str = Form(...),
    author_name: str = Form(...),
    content: str = Form(...),
    priority: str = Form("Medium"),
    files: list[UploadFile] = File(default=[]),
):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    reviewer_email = str(user.get("email", "")).strip().lower()
    is_admin = _is_admin_user(user) or reviewer_email in _board_admin_email_set()
    priority = priority if priority in ("High", "Medium", "Low") else "Medium"
    post_id = f"board-{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow().isoformat(timespec="seconds")

    saved_files = []
    for f in files:
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext not in BOARD_ALLOWED_EXT:
            continue
        safe_name = f"{post_id}_{uuid.uuid4().hex[:6]}{ext}"
        dest = BOARD_UPLOAD_DIR / safe_name
        content_bytes = await f.read()
        if len(content_bytes) > BOARD_MAX_FILE_SIZE:
            continue
        dest.write_bytes(content_bytes)
        saved_files.append({"original_name": f.filename, "path": f"/uploads/board/{safe_name}"})

    post = {
        "id": post_id,
        "title": str(title)[:200].strip(),
        "author_name": str(author_name)[:50].strip(),
        "author_email": str(user.get("email", "")).strip().lower(),
        "content": str(content)[:5000].strip(),
        "priority": priority,
        "status": "approved" if is_admin else "pending",
        "files": saved_files,
        "comments": [],
        "created_at": now,
        "updated_at": now,
    }
    if is_admin:
        post["reviewed_by"] = reviewer_email
        post["reviewed_at"] = now

    with BOARD_LOCK:
        posts = _load_json_array(BOARD_POSTS_FILE)
        posts.append(post)
        _save_json_array(BOARD_POSTS_FILE, posts)
    _board_touch_update()
    return {"ok": True, "post": _board_summary(post)}


@app.put("/api/board/posts/{post_id}")
async def board_update_post(post_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    payload = await request.json()
    title = str((payload or {}).get("title", "")).strip()[:200]
    author_name = str((payload or {}).get("author_name", "")).strip()[:50]
    content = str((payload or {}).get("content", "")).strip()[:5000]
    priority = str((payload or {}).get("priority", "Medium"))
    if not title or not author_name or not content:
        raise HTTPException(status_code=400, detail="required fields missing")
    if priority not in ("High", "Medium", "Low"):
        priority = "Medium"

    user_email = str(user.get("email", "")).strip().lower()
    is_admin = _is_admin_user(user)
    now = datetime.utcnow().isoformat(timespec="seconds")

    with BOARD_LOCK:
        posts = _load_json_array(BOARD_POSTS_FILE)
        idx = next((i for i, p in enumerate(posts) if _board_id_equals(p, post_id)), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="post not found")
        post = dict(posts[idx])
        author_email = str(post.get("author_email", "")).strip().lower()
        if not is_admin and user_email != author_email:
            raise HTTPException(status_code=403, detail="not allowed")

        post["title"] = title
        post["author_name"] = author_name
        post["content"] = content
        post["priority"] = priority
        post["updated_at"] = now

        # 작성자 수정은 재승인을 요구한다.
        if not is_admin:
            post["status"] = "pending"
            post.pop("reviewed_by", None)
            post.pop("reviewed_at", None)
            post.pop("reject_reason", None)

        posts[idx] = post
        _save_json_array(BOARD_POSTS_FILE, posts)
    _board_touch_update()
    return {"ok": True, "post": _board_summary(post)}


@app.post("/api/board/posts/{post_id}/withdraw")
async def board_withdraw_post(post_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    payload = await request.json()
    reason = str((payload or {}).get("reason", "")).strip()[:300]

    user_email = str(user.get("email", "")).strip().lower()
    is_admin = _is_admin_user(user)

    with BOARD_LOCK:
        posts = _load_json_array(BOARD_POSTS_FILE)
        idx = next((i for i, p in enumerate(posts) if _board_id_equals(p, post_id)), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="post not found")
        post = dict(posts[idx])
        author_email = str(post.get("author_email", "")).strip().lower()
        if not is_admin and user_email != author_email:
            raise HTTPException(status_code=403, detail="not allowed")
        if str(post.get("status", "")).strip().lower() not in ("pending", "rejected"):
            raise HTTPException(status_code=400, detail="cannot withdraw in current status")

        post["status"] = "withdrawn"
        post["reviewed_by"] = user_email
        post["reviewed_at"] = datetime.utcnow().isoformat(timespec="seconds")
        if reason:
            post["reject_reason"] = reason
        posts[idx] = post
        _save_json_array(BOARD_POSTS_FILE, posts)
    _board_touch_update()
    return {"ok": True, "post": _board_summary(post)}


@app.post("/api/board/posts/{post_id}/comments")
async def board_add_comment(post_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")

    content = ""
    parent_id = ""
    upload_files: list[UploadFile] = []
    ctype = str(request.headers.get("content-type", "")).lower()

    if "multipart/form-data" in ctype:
        form = await request.form()
        content = str(form.get("content", "")).strip()[:1000]
        parent_id = str(form.get("parent_id", "")).strip()
        raw_files = form.getlist("files") if hasattr(form, "getlist") else []
        upload_files = [f for f in raw_files if isinstance(f, UploadFile)]
    else:
        payload = await request.json()
        content = str((payload or {}).get("content", "")).strip()[:1000]
        parent_id = str((payload or {}).get("parent_id", "")).strip()

    if len(upload_files) > BOARD_COMMENT_MAX_FILE_COUNT:
        raise HTTPException(status_code=400, detail=f"files max {BOARD_COMMENT_MAX_FILE_COUNT}")

    saved_files: list[dict] = []
    for f in upload_files:
        if not getattr(f, "filename", ""):
            continue
        ext = Path(str(f.filename)).suffix.lower()
        if ext not in BOARD_ALLOWED_EXT and ext not in {".webp"}:
            continue
        b = await f.read()
        if len(b) > BOARD_COMMENT_MAX_FILE_SIZE:
            continue
        safe_name = f"cmt_{post_id}_{uuid.uuid4().hex[:8]}{ext}"
        dest = BOARD_COMMENT_UPLOAD_DIR / safe_name
        dest.write_bytes(b)
        saved_files.append({
            "original_name": str(f.filename),
            "path": f"/uploads/board/comments/{safe_name}",
            "size": len(b),
            "is_image": ext in {".png", ".jpg", ".jpeg", ".gif", ".webp"},
        })

    if not content and not saved_files:
        raise HTTPException(status_code=400, detail="content or files required")

    # @이름 멘션 → 사용자 이메일 매핑
    raw_mention_names = _extract_mentions(content)
    mentions: list[dict] = []
    if raw_mention_names:
        users_list = _load_users()
        name_to_email = {
            str(u.get("name", "") or "").strip(): str(u.get("email", "") or "").strip().lower()
            for u in users_list
            if str(u.get("name", "") or "").strip() and str(u.get("email", "") or "").strip()
        }
        for name in raw_mention_names:
            email = name_to_email.get(name, "")
            if email:
                mentions.append({"name": name, "email": email})

    comment = {
        "id": f"cmt-{uuid.uuid4().hex[:10]}",
        "author_name": str(user.get("name", "") or user.get("email", "")).strip(),
        "author_email": str(user.get("email", "")).strip().lower(),
        "content": content,
        "parent_id": parent_id or "",
        "created_at": datetime.utcnow().isoformat(timespec="seconds"),
        "mentions": mentions,
        "files": saved_files,
    }

    with BOARD_LOCK:
        posts = _load_json_array(BOARD_POSTS_FILE)
        idx = next((i for i, p in enumerate(posts) if _board_id_equals(p, post_id)), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="post not found")
        post = dict(posts[idx])
        if str(post.get("status", "")) != "approved" and not _is_admin_user(user):
            raise HTTPException(status_code=403, detail="not approved")
        comments = list(post.get("comments") or [])
        if parent_id:
            parent_exists = any(str(c.get("id", "")).strip() == parent_id for c in comments)
            if not parent_exists:
                raise HTTPException(status_code=400, detail="parent comment not found")
        comments.append(comment)
        post["comments"] = comments
        posts[idx] = post
        _save_json_array(BOARD_POSTS_FILE, posts)

    _board_touch_update()
    return {"ok": True, "comment": comment}


@app.post("/api/board/posts/{post_id}/comments/{comment_id}/reactions")
async def board_toggle_comment_reaction(post_id: str, comment_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")

    payload = await request.json()
    emoji = str((payload or {}).get("emoji", "")).strip()
    if not emoji:
        raise HTTPException(status_code=400, detail="emoji required")

    # 일반 유니코드 이모지(짧은 문자열) 또는 :custom_name: 토큰 지원
    if emoji.startswith(":") and emoji.endswith(":") and len(emoji) > 2:
        custom_name = str(emoji[1:-1]).strip().lower()
        if not re.fullmatch(r"[a-z0-9_]{2,30}", custom_name):
            raise HTTPException(status_code=400, detail="invalid custom emoji token")
        custom_items = _load_json_array(BOARD_EMOJIS_FILE)
        exists = any(str((row or {}).get("name", "")).strip().lower() == custom_name for row in custom_items)
        if not exists:
            raise HTTPException(status_code=404, detail="custom emoji not found")
    elif len(emoji) > 8:
        raise HTTPException(status_code=400, detail="emoji too long")

    user_email = str(user.get("email", "")).strip().lower()

    with BOARD_LOCK:
        posts = _load_json_array(BOARD_POSTS_FILE)
        idx = next((i for i, p in enumerate(posts) if _board_id_equals(p, post_id)), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="post not found")

        post = dict(posts[idx])
        comments = list(post.get("comments") or [])
        cidx = next((i for i, c in enumerate(comments) if str(c.get("id", "")).strip() == str(comment_id).strip()), -1)
        if cidx < 0:
            raise HTTPException(status_code=404, detail="comment not found")

        comment = dict(comments[cidx])
        reactions = list(comment.get("reactions") or [])
        ridx = next((i for i, r in enumerate(reactions) if str((r or {}).get("emoji", "")).strip() == emoji), -1)

        active = True
        if ridx < 0:
            reactions.append({"emoji": emoji, "users": [user_email]})
        else:
            target = dict(reactions[ridx])
            users = [str(v).strip().lower() for v in (target.get("users") or []) if str(v).strip()]
            if user_email in users:
                users = [v for v in users if v != user_email]
                active = False
            else:
                users.append(user_email)
                active = True
            if users:
                target["users"] = users
                reactions[ridx] = target
            else:
                reactions.pop(ridx)

        comment["reactions"] = reactions
        comments[cidx] = comment
        post["comments"] = comments
        post["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        posts[idx] = post
        _save_json_array(BOARD_POSTS_FILE, posts)

    _board_touch_update()
    return {"ok": True, "active": active, "emoji": emoji, "reactions": comment.get("reactions") or []}


@app.delete("/api/board/posts/{post_id}/comments/{comment_id}")
def board_delete_comment(post_id: str, comment_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")

    user_email = str(user.get("email", "")).strip().lower()
    is_admin = _is_admin_user(user)

    with BOARD_LOCK:
        posts = _load_json_array(BOARD_POSTS_FILE)
        idx = next((i for i, p in enumerate(posts) if _board_id_equals(p, post_id)), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="post not found")

        post = dict(posts[idx])
        comments = list(post.get("comments") or [])
        target = next((c for c in comments if str(c.get("id", "")).strip() == str(comment_id).strip()), None)
        if not target:
            raise HTTPException(status_code=404, detail="comment not found")

        author_email = str(target.get("author_email", "")).strip().lower()
        if not is_admin and user_email != author_email:
            raise HTTPException(status_code=403, detail="not allowed")

        remaining, deleted = _delete_board_comment_tree(comments, comment_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="comment not found")

        post["comments"] = remaining
        post["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        posts[idx] = post
        _save_json_array(BOARD_POSTS_FILE, posts)

    _board_touch_update()

    if is_admin:
        _append_audit_update(
            "게시판 댓글 삭제",
            [
                f"게시글: {post.get('title', '')}",
                f"댓글 작성자: {deleted.get('author_name', '') or deleted.get('author_email', '')}",
                f"댓글 ID: {comment_id}",
            ],
            kind="removed",
            scope="게시판",
            actor=user,
        )
    return {"ok": True}


@app.post("/api/board/posts/{post_id}/approve")
def board_approve_post(post_id: str, request: Request):
    admin = _require_admin(request)
    with BOARD_LOCK:
        posts = _load_json_array(BOARD_POSTS_FILE)
        idx = next((i for i, p in enumerate(posts) if _board_id_equals(p, post_id)), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="post not found")
        post = dict(posts[idx])
        post["status"] = "approved"
        post["reviewed_by"] = str(admin.get("email", "")).strip().lower()
        post["reviewed_at"] = datetime.utcnow().isoformat(timespec="seconds")
        post.pop("reject_reason", None)
        posts[idx] = post
        _save_json_array(BOARD_POSTS_FILE, posts)
    _board_touch_update()
    return {"ok": True}


@app.post("/api/board/posts/{post_id}/reject")
async def board_reject_post(post_id: str, request: Request):
    admin = _require_admin(request)
    payload = await request.json()
    reason = str((payload or {}).get("reason", "")).strip()[:300]
    with BOARD_LOCK:
        posts = _load_json_array(BOARD_POSTS_FILE)
        idx = next((i for i, p in enumerate(posts) if _board_id_equals(p, post_id)), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="post not found")
        post = dict(posts[idx])
        post["status"] = "rejected"
        post["reviewed_by"] = str(admin.get("email", "")).strip().lower()
        post["reviewed_at"] = datetime.utcnow().isoformat(timespec="seconds")
        if reason:
            post["reject_reason"] = reason
        posts[idx] = post
        _save_json_array(BOARD_POSTS_FILE, posts)
    _board_touch_update()
    return {"ok": True}


@app.delete("/api/board/posts/{post_id}")
def board_delete_post(post_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    is_admin = _is_admin_user(user)
    user_email = str(user.get("email", "")).strip().lower()
    with BOARD_LOCK:
        posts = _load_json_array(BOARD_POSTS_FILE)
        idx = next((i for i, p in enumerate(posts) if _board_id_equals(p, post_id)), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="post not found")
        post = posts[idx]
        if not is_admin and str(post.get("author_email", "")).strip().lower() != user_email:
            raise HTTPException(status_code=403, detail="not allowed")
        posts.pop(idx)
        _save_json_array(BOARD_POSTS_FILE, posts)
    _board_touch_update()
    if is_admin:
        _append_audit_update(
            "게시판 글 삭제",
            [f"제목: {post.get('title', '')}", f"작성자: {post.get('author_name', '')}", f"ID: {post_id}"],
            kind="removed",
            scope="게시판",
            actor=user,
        )
    return {"ok": True}


@app.get("/api/board/urgent")
def board_urgent(request: Request):
    """Recent approved posts for floating indicator with priority-specific styles."""
    user = _current_user_from_request(request)
    user_email = str((user or {}).get("email", "")).strip().lower()
    cache_key = user_email or "__public__"
    now_ts = time.time()
    posts_mtime = 0.0
    try:
        posts_mtime = float(BOARD_POSTS_FILE.stat().st_mtime)
    except Exception:
        posts_mtime = 0.0

    with BOARD_URGENT_CACHE_LOCK:
        cached = BOARD_URGENT_CACHE.get(cache_key) or {}
        if (
            cached
            and (now_ts - float(cached.get("ts") or 0.0)) < BOARD_URGENT_CACHE_TTL_SEC
            and float(cached.get("posts_mtime") or 0.0) == posts_mtime
        ):
            return cached.get("data") or {"ok": True, "items": [], "mentions": [], "unread_items": []}

    posts = _load_json_array(BOARD_POSTS_FILE)
    if _normalize_admin_authored_board_posts(posts):
        with BOARD_LOCK:
            _save_json_array(BOARD_POSTS_FILE, posts)
    if user:
        urgent = [
            _board_summary(p)
            for p in posts
            if str(p.get("status", "")).strip().lower() == "approved" and _can_view_board_post(p, user)
        ]
    else:
        urgent = [_board_summary(p) for p in posts if str(p.get("status", "")).strip().lower() == "approved"]
    urgent.sort(
        key=lambda r: (str(r.get("created_at", "")), -_board_priority_order(r.get("priority", "Medium"))),
        reverse=True,
    )

    # 로그인한 사용자에 대해 댓글 멘션 알림 추가 + 미읽은 공지 집계
    # 폴링 API 부하를 줄이기 위해 최근 게시글 중심으로 스캔한다.
    mentions_out: list[dict] = []
    unread_out: list[dict] = []
    if user:
        user_email = str(user.get("email", "")).strip().lower()
        read_post_ids = _get_board_read_post_ids(user_email)
        approved_posts = [p for p in posts if str(p.get("status", "")).strip().lower() == "approved"]
        approved_posts.sort(key=lambda p: str(p.get("created_at", "")), reverse=True)
        scan_posts = approved_posts[:150]

        unread_out = [
            _board_summary(p)
            for p in scan_posts
            if (
                str(p.get("status", "")).strip().lower() == "approved"
                and _can_view_board_post(p, user)
                and str(p.get("id", "")).strip()
                and str(p.get("id", "")).strip() not in read_post_ids
            )
        ]
        unread_out.sort(
            key=lambda r: (str(r.get("created_at", "")), -_board_priority_order(r.get("priority", "Medium"))),
            reverse=True,
        )

        for post in scan_posts:
            post_id_str = str(post.get("id", ""))
            post_title_str = str(post.get("title", ""))
            for comment in (post.get("comments") or []):
                for m in (comment.get("mentions") or []):
                    if str(m.get("email", "")).strip().lower() == user_email:
                        mentions_out.append({
                            "comment_id": str(comment.get("id", "")),
                            "post_id": post_id_str,
                            "post_title": post_title_str,
                            "author_name": str(comment.get("author_name", "")),
                            "content_preview": str(comment.get("content", ""))[:120],
                            "created_at": str(comment.get("created_at", "")),
                        })
        mentions_out.sort(key=lambda m: m.get("created_at", ""), reverse=True)

    result = {"ok": True, "items": urgent[:5], "mentions": mentions_out[:10], "unread_items": unread_out[:10]}
    with BOARD_URGENT_CACHE_LOCK:
        BOARD_URGENT_CACHE[cache_key] = {"ts": now_ts, "posts_mtime": posts_mtime, "data": result}
    return result


@app.get("/api/board/members")
def board_members(request: Request):
    """Return mentionable user name list for @mention autocomplete in comments."""
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    users_list = _load_users()
    result = []
    for u in users_list:
        name = str(u.get("name", "") or "").strip()
        email = str(u.get("email", "") or "").strip().lower()
        if name and email:
            result.append({"name": name, "email": email})
    result.sort(key=lambda x: x["name"])
    return {"ok": True, "members": result}


@app.get("/api/board/updates/since")
def board_updates_since(request: Request, seq: int = 0):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    current_seq, current_ts = _board_update_snapshot()
    return {
        "ok": True,
        "changed": int(seq or 0) < int(current_seq),
        "seq": int(current_seq),
        "ts": str(current_ts),
    }


@app.get("/api/board/emojis")
def board_list_custom_emojis(request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")
    items = _load_json_array(BOARD_EMOJIS_FILE)
    user_email = str(user.get("email", "")).strip().lower()
    is_admin = _is_admin_user(user)
    normalized = []
    for row in items:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name", "")).strip().lower()
        path = str(row.get("path", "")).strip()
        if not name or not path:
            continue
        normalized.append(
            {
                "id": str(row.get("id", "")).strip(),
                "name": name,
                "path": path,
                "token": f":{name}:",
                "created_by": str(row.get("created_by", "")).strip().lower(),
                "can_delete": is_admin or str(row.get("created_by", "")).strip().lower() == user_email,
            }
        )
    normalized.sort(key=lambda x: x.get("name", ""))
    return {"ok": True, "items": normalized}


@app.post("/api/board/emojis")
async def board_create_custom_emoji(
    request: Request,
    name: str = Form(...),
    file: UploadFile = File(...),
):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")

    normalized_name = re.sub(r"[^a-z0-9_]", "", str(name or "").strip().lower())
    if len(normalized_name) < 2 or len(normalized_name) > 30:
        raise HTTPException(status_code=400, detail="emoji name must be 2-30 chars (a-z0-9_)")

    filename = str(getattr(file, "filename", "") or "").strip()
    ext = Path(filename).suffix.lower()
    if ext not in BOARD_CUSTOM_EMOJI_ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="emoji image format not allowed")

    b = await file.read()
    if not b:
        raise HTTPException(status_code=400, detail="emoji file required")
    if len(b) > BOARD_CUSTOM_EMOJI_MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="emoji file too large (max 512KB)")

    with BOARD_LOCK:
        items = _load_json_array(BOARD_EMOJIS_FILE)
        for row in items:
            if str((row or {}).get("name", "")).strip().lower() == normalized_name:
                raise HTTPException(status_code=409, detail="emoji name already exists")

        emoji_id = f"emo-{uuid.uuid4().hex[:10]}"
        safe_name = f"{emoji_id}{ext}"
        dest = BOARD_EMOJI_UPLOAD_DIR / safe_name
        dest.write_bytes(b)
        row = {
            "id": emoji_id,
            "name": normalized_name,
            "path": f"/uploads/board/emojis/{safe_name}",
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
            "created_by": str(user.get("email", "")).strip().lower(),
        }
        items.append(row)
        _save_json_array(BOARD_EMOJIS_FILE, items)
    _board_touch_update()

    return {
        "ok": True,
        "item": {
            "id": emoji_id,
            "name": normalized_name,
            "path": row["path"],
            "token": f":{normalized_name}:",
            "created_by": str(user.get("email", "")).strip().lower(),
            "can_delete": True,
        },
    }


@app.delete("/api/board/emojis/{emoji_id}")
def board_delete_custom_emoji(emoji_id: str, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="login required")

    user_email = str(user.get("email", "")).strip().lower()
    is_admin = _is_admin_user(user)

    with BOARD_LOCK:
        items = _load_json_array(BOARD_EMOJIS_FILE)
        idx = next((i for i, row in enumerate(items) if str((row or {}).get("id", "")).strip() == str(emoji_id).strip()), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="emoji not found")

        target = dict(items[idx])
        created_by = str(target.get("created_by", "")).strip().lower()
        if not is_admin and created_by != user_email:
            raise HTTPException(status_code=403, detail="not allowed")

        path = str(target.get("path", "")).strip()
        items.pop(idx)
        _save_json_array(BOARD_EMOJIS_FILE, items)
    _board_touch_update()

    # 이모지 파일 정리
    if path.startswith("/uploads/board/emojis/"):
        name = path.split("/uploads/board/emojis/")[-1].strip()
        if name:
            try:
                (BOARD_EMOJI_UPLOAD_DIR / name).unlink(missing_ok=True)
            except Exception:
                pass

    return {"ok": True}


@app.get("/api/board/overview")
def board_overview(request: Request):
    """Recent approved posts for overview page widget."""
    user = _current_user_from_request(request)
    if not user:
        return {"ok": True, "items": []}
    posts = _load_json_array(BOARD_POSTS_FILE)
    if _normalize_admin_authored_board_posts(posts):
        with BOARD_LOCK:
            _save_json_array(BOARD_POSTS_FILE, posts)
    visible = [_board_summary(p) for p in posts if _can_view_board_post(p, user)]
    visible.sort(key=lambda r: (
        {"High": 0, "Medium": 1, "Low": 2}.get(r.get("priority", "Low"), 2),
        str(r.get("created_at", ""))
    ))
    visible.sort(key=lambda r: str(r.get("created_at", "")), reverse=True)
    return {"ok": True, "items": visible[:8]}


# ─────────────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    _sync_android_devices_from_adb()
    data = orchestrator.get_dashboard_data()
    return templates.TemplateResponse("overview.html", {"request": request, "data": data})


@app.get("/static/company_logo.png")
def company_logo_fallback():
    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5Wn2kAAAAASUVORK5CYII="
    )
    return Response(content=tiny_png, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@app.api_route("/cjs/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/upload_file/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/main/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/chtml/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/img/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/static/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware/cjs/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware/upload_file/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware/main/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware/chtml/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware/img/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware/static/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware/proxy", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
@app.api_route("/groupware/proxy/{proxy_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def groupware_proxy(request: Request, proxy_path: str = ""):
    user = _current_user_from_request(request)
    if not user:
        next_url = quote(str(request.url.path or "/groupware/login.php"), safe="/:#?=&")
        return RedirectResponse(url=f"/auth/login?next={next_url}", status_code=303)

    request_path = str(request.url.path or "").strip()
    target_path = _groupware_target_path_from_request_path(request_path)

    upstream_url = GROUPWARE_BASE_URL + target_path
    if request.url.query:
        upstream_url = f"{upstream_url}?{request.url.query}"

    # 업스트림에 실파일이 없는 배경 이미지 요청은 1x1 gif를 즉시 반환해 404 폭주를 막는다.
    if target_path in {"/groupware/main/my_desk_bg.gif", "/main/my_desk_bg.gif"}:
        tiny_gif = base64.b64decode("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==")
        return Response(content=tiny_gif, status_code=200, media_type="image/gif", headers={"Cache-Control": "public, max-age=86400"})

    client = _get_groupware_client(request)
    body = await request.body() if request.method.upper() not in {"GET", "HEAD"} else None

    forwarded_headers: dict[str, str] = {
        "User-Agent": str(request.headers.get("user-agent", "Mozilla/5.0 CCI Groupware Proxy")).strip(),
        "Accept": str(request.headers.get("accept", "*/*")).strip(),
        "Accept-Language": str(request.headers.get("accept-language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")).strip(),
    }

    raw_referer = str(request.headers.get("referer", "")).strip()
    if raw_referer:
        try:
            ref = urlsplit(raw_referer)
            if ref.path:
                ref_path = _groupware_target_path_from_request_path(ref.path)
                forwarded_headers["Referer"] = GROUPWARE_BASE_URL + ref_path + (f"?{ref.query}" if ref.query else "")
        except Exception:
            pass
    if "Referer" not in forwarded_headers:
        forwarded_headers["Referer"] = GROUPWARE_BASE_URL + GROUPWARE_LOGIN_PATH

    raw_origin = str(request.headers.get("origin", "")).strip()
    if raw_origin:
        try:
            o = urlsplit(raw_origin)
            if o.scheme and o.netloc:
                forwarded_headers["Origin"] = f"{o.scheme}://{o.netloc}"
        except Exception:
            pass
    if "Origin" not in forwarded_headers:
        forwarded_headers["Origin"] = GROUPWARE_BASE_URL

    content_type = str(request.headers.get("content-type", "")).strip()
    if content_type:
        forwarded_headers["Content-Type"] = content_type
    x_requested_with = str(request.headers.get("x-requested-with", "")).strip()
    if x_requested_with:
        forwarded_headers["X-Requested-With"] = x_requested_with

    try:
        upstream_resp = client.request(
            method=request.method.upper(),
            url=upstream_url,
            headers=forwarded_headers,
            data=body,
            allow_redirects=False,
            timeout=GROUPWARE_PROXY_TIMEOUT,
        )
    except requests.RequestException as exc:
        return Response(content=f"그룹웨어 연결 실패: {exc}", status_code=502, media_type="text/plain; charset=utf-8")

    if 300 <= upstream_resp.status_code < 400:
        location = str(upstream_resp.headers.get("location", "")).strip()
        if location:
            return RedirectResponse(url=_groupware_proxy_url_from_value(location), status_code=upstream_resp.status_code)

    content_type = str(upstream_resp.headers.get("content-type", "application/octet-stream")).strip()
    response_headers = {}
    cache_control = str(upstream_resp.headers.get("cache-control", "")).strip()
    if cache_control:
        response_headers["Cache-Control"] = cache_control

    if "text/html" in content_type:
        text = upstream_resp.text
        lowered = text.lower()
        if "로그인 이후에 이용가능합니다" in text or "document.location.replace('/groupware/login.php')" in lowered:
            _clear_groupware_client(request)
            next_target = str(request.url.path or "/groupware/index.php")
            if request.url.query:
                next_target = f"{request.url.path}?{request.url.query}"
            login_qs = urlencode({"next": next_target, "gw_return": next_target})
            return RedirectResponse(url=f"/groupware/login.php?{login_qs}", status_code=303)
        rewritten = _rewrite_groupware_html(text, upstream_url)
        response_headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        return Response(content=rewritten, status_code=upstream_resp.status_code, media_type="text/html", headers=response_headers)

    if "text/css" in content_type:
        text = upstream_resp.text
        rewritten = _rewrite_groupware_css(text)
        return Response(content=rewritten, status_code=upstream_resp.status_code, media_type="text/css", headers=response_headers)

    if "javascript" in content_type or "ecmascript" in content_type:
        text = upstream_resp.text
        # 경로 재작성 순서 중요: 구체적인 것부터 일반적인 것으로
        text = text.replace(GROUPWARE_BASE_URL + "/groupware/cjs/", "/cjs/")
        text = text.replace(GROUPWARE_BASE_URL + "/groupware/upload_file/", "/upload_file/")
        text = text.replace(GROUPWARE_BASE_URL + "/groupware/main/", "/main/")
        text = text.replace(GROUPWARE_BASE_URL + "/groupware/chtml/", "/chtml/")
        text = text.replace(GROUPWARE_BASE_URL + "/groupware/img/", "/groupware/img/")
        text = text.replace(GROUPWARE_BASE_URL + "/groupware/static/", "/static/")
        text = text.replace(GROUPWARE_BASE_URL + "/groupware/", "/groupware/")
        text = text.replace(GROUPWARE_BASE_URL + "/", "/groupware/")
        # 문자열 리터럴의 경로도 재작성
        text = text.replace('"/groupware/cjs/', '"/cjs/')
        text = text.replace("'/groupware/cjs/", "'/cjs/")
        text = text.replace('"/groupware/upload_file/', '"/upload_file/')
        text = text.replace("'/groupware/upload_file/", "'/upload_file/")
        text = text.replace('"/groupware/main/', '"/main/')
        text = text.replace("'/groupware/main/", "'/main/")
        text = text.replace('"/groupware/chtml/', '"/chtml/')
        text = text.replace("'/groupware/chtml/", "'/chtml/")
        text = text.replace('"/groupware/img/', '"/groupware/img/')
        text = text.replace("'/groupware/img/", "'/groupware/img/")
        text = text.replace('"/groupware/static/', '"/static/')
        text = text.replace("'/groupware/static/", "'/static/")
        return Response(content=text, status_code=upstream_resp.status_code, media_type=content_type.split(";")[0], headers=response_headers)

    return Response(content=upstream_resp.content, status_code=upstream_resp.status_code, media_type=content_type.split(";")[0], headers=response_headers)


@app.get("/excel", response_class=HTMLResponse)
def excel_center(request: Request):
    return templates.TemplateResponse("excel_center.html", {"request": request})


@app.get("/upload/defectlist-raw", response_class=HTMLResponse)
def upload_defectlist_raw_page(request: Request):
    _require_admin(request)
    return templates.TemplateResponse("upload_defectlist_raw.html", {"request": request})


@app.get("/upload/full-tc", response_class=HTMLResponse)
def upload_full_tc_page(request: Request):
    _require_admin(request)
    return templates.TemplateResponse("upload_full_tc.html", {"request": request})


@app.get("/live", response_class=HTMLResponse)
def live_monitor(request: Request):
    return RedirectResponse(url="/qa", status_code=307)


@app.get("/remote", response_class=HTMLResponse)
def remote_control(request: Request):
    return RedirectResponse(url="/qa", status_code=307)


@app.get("/qa", response_class=HTMLResponse)
def qa_dashboard(request: Request):
    _sync_android_devices_from_adb()
    data = orchestrator.get_dashboard_data()
    return templates.TemplateResponse("qa_dashboard.html", {"request": request, "data": data})

# QA Summary API (프론트엔드 404 대응용 예시)
from datetime import datetime
@app.get("/qa/summary")
def qa_summary():
    """
    ERP/QA 대시보드 요약 데이터 반환 (예시)
    실제 데이터 로직은 추후 연동 가능
    """
    return {
        "total_cases": 120,
        "passed": 110,
        "failed": 7,
        "blocked": 3,
        "last_updated": datetime.utcnow().isoformat(),
        "summary": [
            {"category": "기능", "total": 60, "passed": 55, "failed": 3, "blocked": 2},
            {"category": "UI", "total": 30, "passed": 28, "failed": 2, "blocked": 0},
            {"category": "API", "total": 30, "passed": 27, "failed": 2, "blocked": 1},
        ]
    }


@app.get("/qa/defectlist-editor", response_class=HTMLResponse)
def qa_defectlist_editor_page(request: Request):
    _sync_android_devices_from_adb()
    data = orchestrator.get_dashboard_data()
    return templates.TemplateResponse("qa_defectlist_editor.html", {"request": request, "data": data})


@app.get("/defects", response_class=HTMLResponse)
def defects_page(request: Request):
    return templates.TemplateResponse("defects_detail.html", {"request": request})


@app.get("/api/dashboard")
def dashboard_data(force_defects: bool = False, force_company_defects: bool = False):
    _sync_android_devices_from_adb()
    data = orchestrator.get_dashboard_data()
    data["latest_upload"] = LAST_UPLOADED_EXCEL.name if LAST_UPLOADED_EXCEL else ""
    data["latest_converted"] = LAST_CONVERTED_EXCEL.name if LAST_CONVERTED_EXCEL else ""
    data["defect_stats"] = _get_cached_google_defect_stats(force=bool(force_defects))
    data["company_defect_stats"] = _get_cached_company_defect_stats(force=bool(force_company_defects))
    return data


def _extract_google_sheet_id(sheet_url: str) -> str:
    text = str(sheet_url or "").strip()
    if not text:
        return ""
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", text)
    if m:
        return m.group(1)
    return ""


def _parse_iso_datetime(value: str) -> datetime:
    text = str(value or "").strip()
    if not text:
        return datetime.min
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return datetime.min


def _infer_update_kind(title: str, details: list[str]) -> str:
    text = f"{title} {' '.join(details)}".lower()
    if any(k in text for k in ["삭제", "제거", "빠짐", "remove", "removed", "delete"]):
        return "removed"
    if any(k in text for k in ["추가", "신규", "new", "add", "added"]):
        return "added"
    return "updated"


def _load_manual_overview_updates() -> list[dict]:
    if not OVERVIEW_UPDATES_FILE.exists():
        return []
    try:
        payload = json.loads(OVERVIEW_UPDATES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(payload, list):
        return []

    out = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        details = item.get("details", [])
        if not isinstance(details, list):
            details = []
        detail_lines = [str(x or "").strip() for x in details if str(x or "").strip()]
        timestamp = str(item.get("updated_at", "")).strip() or datetime.now().isoformat(timespec="seconds")
        kind = str(item.get("kind", "")).strip().lower() or _infer_update_kind(title, detail_lines)
        scope = str(item.get("scope", "Dashboard")).strip() or "Dashboard"
        out.append(
            {
                "source": "manual",
                "title": title,
                "kind": kind,
                "scope": scope,
                "updated_at": timestamp,
                "details": detail_lines,
            }
        )
    return out


def _append_manual_overview_update(item: dict) -> None:
    updates = []
    if OVERVIEW_UPDATES_FILE.exists():
        try:
            payload = json.loads(OVERVIEW_UPDATES_FILE.read_text(encoding="utf-8"))
            if isinstance(payload, list):
                updates = [x for x in payload if isinstance(x, dict)]
        except Exception:
            updates = []

    updates.append(item)
    # Keep latest entries only to avoid unbounded growth.
    if len(updates) > 300:
        updates = updates[-300:]

    try:
        OVERVIEW_UPDATES_FILE.parent.mkdir(parents=True, exist_ok=True)
        OVERVIEW_UPDATES_FILE.write_text(
            json.dumps(updates, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception:
        pass


def _format_audit_actor(actor: dict | None) -> str:
    if not actor:
        return "system"
    name = str(actor.get("name", "")).strip()
    email = str(actor.get("email", "")).strip().lower()
    if name and email:
        return f"{name} ({email})"
    return name or email or "system"


def _build_change_lines(before: dict, after: dict, keys: list[str]) -> list[str]:
    lines: list[str] = []
    for key in keys:
        before_text = str(before.get(key, "") or "").strip()
        after_text = str(after.get(key, "") or "").strip()
        if before_text == after_text:
            continue
        lines.append(f"{key}: {before_text or '-'} -> {after_text or '-'}")
    return lines


def _append_audit_update(
    title: str,
    details: list[str] | None = None,
    *,
    kind: str = "updated",
    scope: str = "관리자",
    actor: dict | None = None,
) -> None:
    detail_lines = [str(line or "").strip() for line in list(details or []) if str(line or "").strip()]
    detail_lines.insert(0, f"작업자: {_format_audit_actor(actor)}")
    _append_manual_overview_update(
        {
            "title": str(title or "업데이트").strip() or "업데이트",
            "kind": str(kind or "updated").strip() or "updated",
            "scope": str(scope or "관리자").strip() or "관리자",
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "details": detail_lines,
        }
    )


def _load_overview_update_state() -> dict:
    if not OVERVIEW_UPDATE_STATE_FILE.exists():
        return {}
    try:
        payload = json.loads(OVERVIEW_UPDATE_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _save_overview_update_state(state: dict) -> None:
    try:
        OVERVIEW_UPDATE_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        OVERVIEW_UPDATE_STATE_FILE.write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception:
        pass


def _record_defectlist_refresh_update(stats: dict) -> None:
    fingerprint = str(stats.get("source_fingerprint", "")).strip() or str(stats.get("fingerprint", "")).strip()
    if not fingerprint:
        return

    with OVERVIEW_UPDATE_LOCK:
        state = _load_overview_update_state()
        prev_fingerprint = str(state.get("last_defectlist_fingerprint", "")).strip()

        if prev_fingerprint == fingerprint:
            state["last_seen_at"] = datetime.now().isoformat(timespec="seconds")
            _save_overview_update_state(state)
            return

        updated_at = datetime.now().isoformat(timespec="seconds")
        details = [
            f"시트: {stats.get('sheet', GOOGLE_DEFECT_SHEET_NAME)}",
            f"범위: {stats.get('range', GOOGLE_TEAM_DEFECT_RANGE)}",
            f"반영 시각: {stats.get('updated_at', updated_at)}",
            f"이슈 건수: {int(stats.get('total_rows', 0) or 0)}",
        ]
        _append_manual_overview_update(
            {
                "title": "DefectList 최신화",
                "kind": "updated",
                "scope": "DefectList",
                "updated_at": updated_at,
                "details": details,
            }
        )

        state["last_defectlist_fingerprint"] = fingerprint
        state["last_notice_at"] = updated_at
        state["last_seen_at"] = updated_at
        _save_overview_update_state(state)


def _load_git_overview_updates(limit: int = 30) -> list[dict]:
    repo_root = str(BASE_DIR.parent)
    try:
        marker = "__COMMIT__"
        cmd = [
            "git",
            "-C",
            repo_root,
            "log",
            f"-n{max(1, int(limit))}",
            "--date=iso-strict",
            f"--pretty=format:{marker}|%h|%ad|%s",
            "--name-status",
        ]
        raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True, encoding="utf-8", timeout=2.0)
    except Exception:
        return []

    out = []
    current = None
    changed = []
    for line in str(raw or "").splitlines():
        text = str(line or "").strip()
        if not text:
            continue
        if text.startswith("__COMMIT__|"):
            if current:
                subject = str(current.get("subject", "")).strip()
                short_hash = str(current.get("hash", "")).strip()
                committed_at = str(current.get("at", "")).strip()
                details = [f"Commit: {short_hash}"] if short_hash else []
                if changed:
                    details.append("Changed: " + ", ".join(changed[:8]))
                    if len(changed) > 8:
                        details.append(f"... 외 {len(changed) - 8}개 파일")
                out.append(
                    {
                        "source": "git",
                        "title": subject,
                        "kind": _infer_update_kind(subject, changed),
                        "scope": "Code",
                        "updated_at": committed_at or datetime.now().isoformat(timespec="seconds"),
                        "details": details,
                    }
                )
            parts = text.split("|", 3)
            if len(parts) >= 4:
                current = {"hash": parts[1], "at": parts[2], "subject": parts[3]}
                changed = []
            else:
                current = None
                changed = []
            continue

        if current:
            # name-status line: "A\tpath", "M\tpath", "D\tpath"
            cols = text.split("\t", 1)
            if len(cols) == 2:
                status_code = cols[0].strip()
                path = cols[1].strip()
                if path:
                    changed.append(f"{status_code}:{path}")

    if current:
        subject = str(current.get("subject", "")).strip()
        short_hash = str(current.get("hash", "")).strip()
        committed_at = str(current.get("at", "")).strip()
        details = [f"Commit: {short_hash}"] if short_hash else []
        if changed:
            details.append("Changed: " + ", ".join(changed[:8]))
            if len(changed) > 8:
                details.append(f"... 외 {len(changed) - 8}개 파일")
        out.append(
            {
                "source": "git",
                "title": subject,
                "kind": _infer_update_kind(subject, changed),
                "scope": "Code",
                "updated_at": committed_at or datetime.now().isoformat(timespec="seconds"),
                "details": details,
            }
        )

    return out


def _load_git_worktree_updates() -> list[dict]:
    repo_root = str(BASE_DIR.parent)
    try:
        cmd = ["git", "-C", repo_root, "status", "--porcelain"]
        raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True, encoding="utf-8", timeout=1.5)
    except Exception:
        return []

    lines = [str(x or "").rstrip() for x in str(raw or "").splitlines() if str(x or "").strip()]
    if not lines:
        return []

    changed_files = []
    for ln in lines:
        if len(ln) < 4:
            continue
        status = ln[:2].strip() or "??"
        path = ln[3:].strip()
        if path:
            changed_files.append(f"{status}:{path}")

    if not changed_files:
        return []

    return [
        {
            "source": "git-working",
            "title": "현재 작업중 변경사항",
            "kind": "updated",
            "scope": "Workspace",
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "details": changed_files,
        }
    ]


def _build_auto_refresh_update(force: bool = False) -> dict:
    defect = _get_cached_google_defect_stats(force=bool(force))
    company = _get_cached_company_defect_stats(force=bool(force))
    regular = _build_regular_release_stats(company.get("issues", []))
    return {
        "source": "system",
        "title": "데이터 최신화 상태",
        "kind": "updated",
        "scope": "Data",
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "details": [
            f"DefectList_Raw: {defect.get('updated_at', '-')}",
            f"회사 결함 통계: {company.get('updated_at', '-')}",
            f"정기배포 집계: {regular.get('updated_at', '-')}",
        ],
    }


@app.get("/api/overview/updates")
def overview_updates(force: bool = False):
    items = []
    items.extend(_load_manual_overview_updates())
    items.extend(_load_git_overview_updates(limit=30))
    items.extend(_load_git_worktree_updates())
    items.append(_build_auto_refresh_update(force=bool(force)))

    def _overview_sort_key(row: dict) -> tuple[int, float]:
        source = str((row or {}).get("source", "")).strip().lower()
        source_rank = 0 if source == "git-working" else 1
        ts = _parse_iso_datetime(str((row or {}).get("updated_at", ""))).timestamp()
        return (source_rank, -ts)

    items.sort(key=_overview_sort_key)
    return {
        "ok": True,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "count": len(items),
        "items": items,
    }


def _parse_gviz_json_rows(raw_text: str) -> list[list[str]]:
    # gviz returns wrapped JS text: google.visualization.Query.setResponse({...});
    text = str(raw_text or "")
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return []
    body = text[start : end + 1]
    try:
        payload = json.loads(body)
    except Exception:
        return []

    out: list[list[str]] = []
    for row in (((payload.get("table") or {}).get("rows") or [])):
        cols = row.get("c") or []
        parsed_row = []
        for c in cols:
            if not isinstance(c, dict):
                parsed_row.append("")
                continue
            v = c.get("v")
            parsed_row.append("" if v is None else str(v).strip())
        out.append(parsed_row)
    return out


def _uploaded_file_datetime_text(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        return datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds")
    except Exception:
        return ""


def _current_defect_source_info() -> tuple[str, str]:
    if UPLOADED_DEFECT_RAW_FILE.exists():
        return "uploaded-excel", UPLOADED_DEFECT_RAW_FILE.name
    return "google-sheet", GOOGLE_DEFECT_SHEET_URL


def _parse_a1_range(cell_range: str) -> tuple[int, int, int | None, int | None]:
    text = str(cell_range or "").strip()
    m = re.match(r"^([A-Za-z]+)(\d*)\s*:\s*([A-Za-z]+)(\d*)$", text)
    if not m:
        raise ValueError("unsupported range")
    start_col = column_index_from_string(m.group(1).upper())
    start_row = int(m.group(2)) if m.group(2) else 1
    end_col = column_index_from_string(m.group(3).upper())
    end_row = int(m.group(4)) if m.group(4) else None
    return start_col, start_row, end_col, end_row


def _read_uploaded_excel_range_rows(file_path: Path, sheet_name: str, cell_range: str) -> list[list[str]]:
    if not file_path.exists():
        return []
    start_col, start_row, end_col, end_row = _parse_a1_range(cell_range)
    wb = load_workbook(str(file_path), data_only=True, read_only=True)
    try:
        ws = wb[sheet_name] if sheet_name in wb.sheetnames else wb[wb.sheetnames[0]]
        max_row = int(end_row or ws.max_row or start_row)
        rows: list[list[str]] = []
        for raw in ws.iter_rows(
            min_row=start_row,
            max_row=max_row,
            min_col=start_col,
            max_col=end_col,
            values_only=True,
        ):
            cells = ["" if val is None else str(val).strip() for val in list(raw)]
            while cells and not cells[-1]:
                cells.pop()
            if any(cells):
                rows.append(cells)
        return rows
    finally:
        wb.close()


def _fetch_uploaded_defect_rows_if_available(sheet_name: str, cell_range: str) -> list[list[str]] | None:
    wanted = str(sheet_name or "").strip().lower()
    raw_name = str(GOOGLE_DEFECT_SHEET_NAME or "").strip().lower()
    if wanted != raw_name:
        return None
    # DefectList_Raw is now upload-only. If no file exists, do not fall back to Google.
    if not UPLOADED_DEFECT_RAW_FILE.exists():
        return []
    try:
        return _read_uploaded_excel_range_rows(UPLOADED_DEFECT_RAW_FILE, GOOGLE_DEFECT_SHEET_NAME, cell_range)
    except Exception:
        return []


def _read_uploaded_full_tc_sheet_names() -> list[str]:
    if not UPLOADED_FULL_TC_FILE.exists():
        return []
    wb = load_workbook(str(UPLOADED_FULL_TC_FILE), data_only=True, read_only=True)
    try:
        return [str(x or "").strip() for x in wb.sheetnames if str(x or "").strip()]
    finally:
        wb.close()


def _read_uploaded_full_tc_sheet_rows(sheet_name: str, max_rows: int) -> list[list[str]]:
    if not UPLOADED_FULL_TC_FILE.exists():
        return []
    wb = load_workbook(str(UPLOADED_FULL_TC_FILE), data_only=True, read_only=True)
    try:
        if sheet_name not in wb.sheetnames:
            return []
        ws = wb[sheet_name]
        out: list[list[str]] = []
        row_limit = max(1, int(max_rows))
        for idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
            if idx > row_limit:
                break
            cells = ["" if val is None else str(val).strip() for val in list(row)]
            while cells and not cells[-1]:
                cells.pop()
            if any(cells):
                out.append(cells)
        return out
    finally:
        wb.close()


def _reset_defect_source_caches() -> None:
    global GOOGLE_DEFECT_CACHE_TS, GOOGLE_DEFECT_CACHE_DATA
    global COMPANY_DEFECT_CACHE_TS, COMPANY_DEFECT_CACHE_DATA
    global RAW_DEFECT_ISSUES_CACHE_TS, RAW_DEFECT_ISSUES_CACHE_DATA

    with GOOGLE_DEFECT_CACHE_LOCK:
        GOOGLE_DEFECT_CACHE_TS = 0.0
        GOOGLE_DEFECT_CACHE_DATA = {}
    with COMPANY_DEFECT_CACHE_LOCK:
        COMPANY_DEFECT_CACHE_TS = 0.0
        COMPANY_DEFECT_CACHE_DATA = {}
    with RAW_DEFECT_ISSUES_CACHE_LOCK:
        RAW_DEFECT_ISSUES_CACHE_TS = 0.0
        RAW_DEFECT_ISSUES_CACHE_DATA = {}


def _reset_full_tc_caches() -> None:
    with FULL_TC_CACHE_LOCK:
        FULL_TC_SHEET_LIST_CACHE["ts"] = 0.0
        FULL_TC_SHEET_LIST_CACHE["data"] = None
        FULL_TC_SHEET_DATA_CACHE.clear()


def _load_defect_raw_upload_history() -> list[dict]:
    if not DEFECT_RAW_UPLOAD_HISTORY_FILE.exists():
        return []
    try:
        with DEFECT_RAW_UPLOAD_HISTORY_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _append_defect_raw_upload_history(
    uploader_name: str,
    uploader_email: str,
    original_filename: str,
    defect_total_rows: int,
    raw_issue_total_rows: int,
) -> None:
    entry = {
        "uploaded_at": datetime.now().isoformat(timespec="seconds"),
        "uploader_name": str(uploader_name or ""),
        "uploader_email": str(uploader_email or ""),
        "original_filename": str(original_filename or ""),
        "defect_total_rows": int(defect_total_rows or 0),
        "raw_issue_total_rows": int(raw_issue_total_rows or 0),
    }
    with DEFECT_RAW_UPLOAD_HISTORY_LOCK:
        history = _load_defect_raw_upload_history()
        history.insert(0, entry)
        history = history[:MAX_DEFECT_RAW_UPLOAD_HISTORY]
        try:
            with DEFECT_RAW_UPLOAD_HISTORY_FILE.open("w", encoding="utf-8") as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
        except Exception:
            pass


def _fetch_google_sheet_rows(range_ref: str) -> list[list[str]]:
    sheet_id = _extract_google_sheet_id(GOOGLE_DEFECT_SHEET_URL)
    if not sheet_id:
        return []

    text_ref = str(range_ref or "").strip()
    sheet_name = GOOGLE_DEFECT_SHEET_NAME
    cell_range = GOOGLE_DEFECT_SHEET_RANGE
    if "!" in text_ref:
        maybe_sheet, maybe_range = text_ref.split("!", 1)
        parsed_sheet = str(maybe_sheet or "").strip().strip("'").strip('"')
        parsed_range = str(maybe_range or "").strip()
        if parsed_sheet:
            sheet_name = parsed_sheet
        if parsed_range:
            cell_range = parsed_range
    elif text_ref:
        cell_range = text_ref

    uploaded_rows = _fetch_uploaded_defect_rows_if_available(sheet_name, cell_range)
    if uploaded_rows is not None:
        return uploaded_rows

    a1_range = f"{sheet_name}!{cell_range}"

    try:
        if GOOGLE_DEFECT_API_KEY:
            encoded_range = quote(a1_range, safe="")
            api_url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{encoded_range}"
            r = requests.get(api_url, params={"key": GOOGLE_DEFECT_API_KEY}, timeout=8)
            if r.status_code == 200:
                values = (r.json() or {}).get("values") or []
                return [[str(x).strip() for x in row] for row in values]

        gviz_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
        r = requests.get(
            gviz_url,
            params={"tqx": "out:json", "sheet": sheet_name, "range": cell_range},
            timeout=8,
        )
        if r.status_code != 200:
            return []
        return _parse_gviz_json_rows(r.text)
    except Exception:
        return []


def _fetch_google_defect_rows() -> list[list[str]]:
    return _fetch_google_sheet_rows(f"{GOOGLE_DEFECT_SHEET_NAME}!{GOOGLE_DEFECT_SHEET_RANGE}")


def _fetch_google_defectlist_header_rows() -> list[list[str]]:
    return _fetch_google_sheet_rows(f"{GOOGLE_DEFECTLIST_SHEET_NAME}!{GOOGLE_DEFECTLIST_HEADER_RANGE}")


def _fetch_google_defectlist_rows() -> list[list[str]]:
    return _fetch_google_sheet_rows(f"{GOOGLE_DEFECTLIST_SHEET_NAME}!{GOOGLE_DEFECTLIST_DATA_RANGE}")


def _sheet_col_index_to_letter(col_idx_from_b: int) -> str:
    # col_idx_from_b=0 means sheet column B.
    return get_column_letter(2 + int(col_idx_from_b))


def _update_google_sheet_cells(sheet_name: str, updates: list[dict]) -> tuple[bool, str]:
    if not updates:
        return False, "updates is empty"
    sheet_id = _extract_google_sheet_id(GOOGLE_DEFECT_SHEET_URL)
    if not sheet_id:
        return False, "google sheet id missing"
    if not GOOGLE_SERVICE_ACCOUNT_FILE:
        return False, "GOOGLE_SERVICE_ACCOUNT_FILE not configured"
    cred_path = Path(GOOGLE_SERVICE_ACCOUNT_FILE)
    if not cred_path.exists():
        return False, f"service account file not found: {cred_path}"

    try:
        service_account_mod = importlib.import_module("google.oauth2.service_account")
        discovery_mod = importlib.import_module("googleapiclient.discovery")
        Credentials = getattr(service_account_mod, "Credentials", None)
        build = getattr(discovery_mod, "build", None)
    except Exception:
        return False, "google api client not installed"
    if Credentials is None or build is None:
        return False, "google api client not installed"

    try:
        creds = Credentials.from_service_account_file(
            str(cred_path),
            scopes=["https://www.googleapis.com/auth/spreadsheets"],
        )
        service = build("sheets", "v4", credentials=creds, cache_discovery=False)
        body = {
            "valueInputOption": "USER_ENTERED",
            "data": [
                {
                    "range": f"{sheet_name}!{str(item.get('a1', '')).strip()}",
                    "values": [[str(item.get("value", ""))]],
                }
                for item in updates
                if str(item.get("a1", "")).strip()
            ],
        }
        if not body["data"]:
            return False, "no valid A1 ranges"
        service.spreadsheets().values().batchUpdate(spreadsheetId=sheet_id, body=body).execute()
        return True, "ok"
    except Exception as e:
        return False, str(e)

def _get_cached_defectlist_rows(force: bool = False) -> tuple[list, list]:
    """DefectList 헤더·데이터 행을 캐시하여 반환. thundering herd 보호 포함."""
    global DEFECTLIST_ROWS_CACHE_TS, DEFECTLIST_ROWS_CACHE_DATA, DEFECTLIST_ROWS_CACHE_FETCHING
    now = time.monotonic()
    with DEFECTLIST_ROWS_CACHE_LOCK:
        if (not force) and DEFECTLIST_ROWS_CACHE_DATA.get("data") is not None and (now - DEFECTLIST_ROWS_CACHE_TS) < GOOGLE_DEFECT_CACHE_TTL_SEC:
            d = DEFECTLIST_ROWS_CACHE_DATA
            return d.get("header", []), d.get("data", [])
        if (not force) and DEFECTLIST_ROWS_CACHE_FETCHING and DEFECTLIST_ROWS_CACHE_DATA.get("data") is not None:
            d = DEFECTLIST_ROWS_CACHE_DATA
            return d.get("header", []), d.get("data", [])
        DEFECTLIST_ROWS_CACHE_FETCHING = True

    header_rows_fetched, data_rows_fetched = None, None
    try:
        header_rows_fetched = _fetch_google_defectlist_header_rows()
        data_rows_fetched = _fetch_google_defectlist_rows()
    except Exception:
        pass
    finally:
        with DEFECTLIST_ROWS_CACHE_LOCK:
            DEFECTLIST_ROWS_CACHE_FETCHING = False

    if data_rows_fetched is not None:
        with DEFECTLIST_ROWS_CACHE_LOCK:
            DEFECTLIST_ROWS_CACHE_DATA = {"header": header_rows_fetched or [], "data": data_rows_fetched}
            DEFECTLIST_ROWS_CACHE_TS = time.monotonic()

    with DEFECTLIST_ROWS_CACHE_LOCK:
        d = DEFECTLIST_ROWS_CACHE_DATA
    return d.get("header", []), d.get("data", [])


def _build_qa_defectlist_editor_data(force: bool = False) -> dict:
    header_rows, rows = _get_cached_defectlist_rows(force=bool(force))
    raw_headers = header_rows[0] if header_rows and isinstance(header_rows[0], list) else []
    headers = [str(x or "").strip() for x in raw_headers]
    if not headers:
        headers = [f"Column {get_column_letter(i)}" for i in range(2, 27)]
    width = max(len(headers), max((len(r) for r in rows), default=0), 25)
    if len(headers) < width:
        headers = headers + [f"Column {get_column_letter(i)}" for i in range(2 + len(headers), 2 + width)]

    company = _get_cached_company_defect_stats(force=bool(force))
    raw_issue_by_key = {}
    for item in company.get("issues", []):
        k = str(item.get("key", "")).strip()
        if k and k not in raw_issue_by_key:
            raw_issue_by_key[k] = item

    records = []
    dropdown_options = {str(i): [] for i in range(8)}  # B~I
    options_seen = {str(i): set() for i in range(8)}

    for offset, row in enumerate(rows):
        padded = [str(x or "").strip() for x in row] + [""] * max(0, width - len(row))
        padded = padded[:width]
        sheet_row = 18 + offset
        key = str(padded[1] if len(padded) > 1 else "").strip()  # C column in B~Z slice

        for i in range(8):
            val = str(padded[i] if i < len(padded) else "").strip()
            if val and val not in options_seen[str(i)]:
                options_seen[str(i)].add(val)
                dropdown_options[str(i)].append(val)

        raw_item = raw_issue_by_key.get(key) if key else None
        records.append(
            {
                "sheet_row": sheet_row,
                "key": key,
                "values": padded,
                "raw_ref": {
                    "status": str((raw_item or {}).get("status", "")).strip(),
                    "priority": str((raw_item or {}).get("priority", "")).strip(),
                    "reporter": str((raw_item or {}).get("reporter", "")).strip(),
                    "fix_versions": str((raw_item or {}).get("fix_versions", "")).strip(),
                    "labels": str((raw_item or {}).get("labels", "")).strip(),
                },
            }
        )

    return {
        "ok": True,
        "sheet": GOOGLE_DEFECTLIST_SHEET_NAME,
        "header_range": GOOGLE_DEFECTLIST_HEADER_RANGE,
        "data_range": GOOGLE_DEFECTLIST_DATA_RANGE,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "headers": headers,
        "rows": records,
        "dropdown_columns": list(range(0, 8)),
        "dropdown_options": dropdown_options,
        "memo_column": 5,  # G column in B~Z slice
        "raw_sheet": GOOGLE_DEFECT_SHEET_NAME,
        "raw_updated_at": company.get("updated_at", ""),
    }


@app.get("/api/qa/defectlist/editor-data")
def qa_defectlist_editor_data(force: bool = False):
    return _build_qa_defectlist_editor_data(force=bool(force))


@app.post("/api/qa/defectlist/update-row")
def qa_defectlist_update_row(sheet_row: int = Form(...), updates_json: str = Form("{}")):
    row_num = int(sheet_row or 0)
    if row_num < 18:
        raise HTTPException(status_code=400, detail="sheet_row must be >= 18")

    try:
        updates = json.loads(str(updates_json or "{}"))
    except Exception:
        raise HTTPException(status_code=400, detail="updates_json must be valid json")
    if not isinstance(updates, dict):
        raise HTTPException(status_code=400, detail="updates_json must be object")

    payload = []
    for k, v in updates.items():
        try:
            col_idx = int(k)
        except Exception:
            continue
        if col_idx < 0 or col_idx > 24:  # B~Z
            continue
        a1 = f"{_sheet_col_index_to_letter(col_idx)}{row_num}"
        payload.append({"a1": a1, "value": str(v or "")})

    if not payload:
        raise HTTPException(status_code=400, detail="no valid updates")

    ok, detail = _update_google_sheet_cells(GOOGLE_DEFECTLIST_SHEET_NAME, payload)
    if not ok:
        raise HTTPException(status_code=503, detail=f"DefectList update failed: {detail}")

    return {
        "ok": True,
        "sheet": GOOGLE_DEFECTLIST_SHEET_NAME,
        "sheet_row": row_num,
        "updated": len(payload),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }


def _call_full_tc_apps_script(params: dict) -> tuple[dict, str]:
    urls: list[str] = []
    primary = str(FULL_TC_APPS_SCRIPT_URL or "").strip()
    if primary:
        urls.append(primary)
    if FULL_TC_APPS_SCRIPT_ID:
        fallback_exec = f"https://script.google.com/macros/s/{FULL_TC_APPS_SCRIPT_ID}/exec"
        if fallback_exec not in urls:
            urls.append(fallback_exec)
    if not urls:
        return {}, "apps_script_url_missing"

    errors: list[str] = []
    for url in urls:
        try:
            r = requests.get(url, params=params, timeout=12)
            if r.status_code != 200:
                errors.append(f"apps_script_http_{r.status_code}")
                continue
            content_type = str(r.headers.get("content-type") or "").lower()
            body_text = str(r.text or "")
            lowered = body_text.lower()
            if "text/html" in content_type or "servicelogin" in lowered or "accounts.google.com" in lowered:
                errors.append("apps_script_login_required_or_public_access_disabled")
                continue
            try:
                parsed = r.json()
            except Exception:
                errors.append("apps_script_invalid_json_response")
                continue
            if not isinstance(parsed, dict):
                errors.append("apps_script_non_object_json")
                continue
            return parsed, ""
        except requests.Timeout:
            errors.append("apps_script_timeout")
        except requests.RequestException:
            errors.append("apps_script_request_failed")
        except Exception:
            errors.append("apps_script_unknown_error")

    if errors:
        return {}, errors[-1]
    return {}, "apps_script_unknown_error"


def _list_full_tc_sheet_names_from_script() -> tuple[list[str], str]:
    payload, err = _call_full_tc_apps_script({"action": "list_sheets"})
    if not payload:
        payload, err2 = _call_full_tc_apps_script({"action": "sheets"})
        if err2:
            err = err2
    names = payload.get("sheets") if isinstance(payload, dict) else []
    if not isinstance(names, list):
        return [], err or "apps_script_payload_missing_sheets"
    return _dedupe_names([str(x or "").strip() for x in names]), err


def _fetch_full_tc_sheet_rows_from_script(sheet_name: str, max_rows: int) -> tuple[list[list[str]], str]:
    if not sheet_name:
        return [], "sheet_name_missing"
    payload, err = _call_full_tc_apps_script(
        {"action": "sheet_data", "sheet": str(sheet_name), "max_rows": str(max_rows)}
    )
    if not payload:
        payload, err2 = _call_full_tc_apps_script({"action": "get_sheet", "sheet": str(sheet_name), "limit": str(max_rows)})
        if err2:
            err = err2
    rows = payload.get("rows") if isinstance(payload, dict) else []
    headers = payload.get("headers") if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        return [], err or "apps_script_payload_missing_rows"
    out: list[list[str]] = []
    if isinstance(headers, list) and headers:
        out.append([str(x or "").strip() for x in headers])
    for row in rows:
        if isinstance(row, list):
            out.append([str(x or "").strip() for x in row])
        elif isinstance(row, dict):
            if isinstance(headers, list) and headers:
                out.append([str(row.get(str(h), "") or "").strip() for h in headers])
            else:
                # Convert object row to value list by key order.
                out.append([str(v or "").strip() for _, v in row.items()])
    if not out:
        return [], err or "apps_script_empty_rows"
    return out, err


def _dedupe_names(names: list[str]) -> list[str]:
    out = []
    seen = set()
    for n in names:
        t = str(n or "").strip()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def _get_full_tc_sheet_list(force: bool = False) -> dict:
    now = time.monotonic()
    with FULL_TC_CACHE_LOCK:
        cached = FULL_TC_SHEET_LIST_CACHE.get("data")
        ts = float(FULL_TC_SHEET_LIST_CACHE.get("ts") or 0.0)
        if not force and cached and (now - ts) < FULL_TC_SHEET_LIST_TTL_SEC:
            return cached

    script_error = ""
    source = "apps_script"
    using_fallback = False
    if UPLOADED_FULL_TC_FILE.exists():
        names = _read_uploaded_full_tc_sheet_names()
        source = "uploaded_excel"
    else:
        names, script_error = _list_full_tc_sheet_names_from_script()
        if not names:
            names = FULL_TC_FALLBACK_SHEETS[:]
            using_fallback = True
            source = "fallback"
    names = _dedupe_names(names)

    data = {
        "ok": True,
        "source": UPLOADED_FULL_TC_FILE.name if source == "uploaded_excel" else FULL_TC_APPS_SCRIPT_URL,
        "sheet_count": len(names),
        "sheets": names,
        "realtime_sheets": sorted([x for x in names if x in FULL_TC_REALTIME_SHEETS]),
        "using_fallback": using_fallback,
        "source_type": source,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "detail": (
            "uploaded_excel"
            if source == "uploaded_excel"
            else (script_error if (using_fallback and script_error) else ("apps_script_or_sheet_access_unavailable" if using_fallback else "ok"))
        ),
    }

    with FULL_TC_CACHE_LOCK:
        FULL_TC_SHEET_LIST_CACHE["data"] = data
        FULL_TC_SHEET_LIST_CACHE["ts"] = time.monotonic()
    return data


def _normalize_sheet_grid(raw_rows: list[list[str]]) -> tuple[list[str], list[list[str]]]:
    rows = [[str(x or "").strip() for x in row] for row in (raw_rows or [])]
    rows = [r for r in rows if any(str(c or "").strip() for c in r)]
    if not rows:
        return [], []

    width = max((len(r) for r in rows), default=0)
    if width <= 0:
        return [], []

    padded = [r + [""] * (width - len(r)) for r in rows]
    raw_header = padded[0]
    headers = []
    used = set()
    for i, name in enumerate(raw_header, start=1):
        base = str(name or "").strip() or f"Column {i}"
        candidate = base
        n = 2
        while candidate in used:
            candidate = f"{base} ({n})"
            n += 1
        used.add(candidate)
        headers.append(candidate)

    return headers, padded[1:]


def _get_full_tc_sheet_data(sheet: str, max_rows: int = 350, force: bool = False) -> dict:
    target = str(sheet or "").strip()
    if not target:
        return {"ok": False, "detail": "sheet is required", "headers": [], "rows": [], "count": 0}

    max_rows = max(20, min(1200, int(max_rows or 350)))
    is_realtime = target in FULL_TC_REALTIME_SHEETS
    ttl = FULL_TC_REALTIME_CACHE_TTL_SEC if is_realtime else FULL_TC_NORMAL_CACHE_TTL_SEC
    cache_key = f"{target}::{max_rows}"
    now = time.monotonic()

    with FULL_TC_CACHE_LOCK:
        c = FULL_TC_SHEET_DATA_CACHE.get(cache_key)
        if c and not force and (now - float(c.get("ts") or 0.0)) < ttl:
            return c.get("data") or {}

    if UPLOADED_FULL_TC_FILE.exists():
        raw_rows = _read_uploaded_full_tc_sheet_rows(target, max_rows + 1)
        script_error = ""
        source_type = "uploaded_excel"
    else:
        raw_rows, script_error = _fetch_full_tc_sheet_rows_from_script(target, max_rows + 1)
        source_type = "apps_script"
    headers, data_rows = _normalize_sheet_grid(raw_rows)
    ok = bool(headers)
    detail_text = "ok"
    if not ok:
        detail_text = script_error or "apps_script_unreachable_or_invalid_response"

    data = {
        "ok": ok,
        "sheet": target,
        "headers": headers,
        "rows": data_rows,
        "count": len(data_rows),
        "realtime": is_realtime,
        "source_type": source_type,
        "max_rows": max_rows,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "detail": detail_text,
    }

    with FULL_TC_CACHE_LOCK:
        FULL_TC_SHEET_DATA_CACHE[cache_key] = {"ts": time.monotonic(), "data": data}
    return data


@app.get("/api/fulltc/sheets")
def full_tc_sheets(force: bool = False):
    return _get_full_tc_sheet_list(force=bool(force))


@app.get("/api/fulltc/sheet-data")
def full_tc_sheet_data(sheet: str, max_rows: int = 350, force: bool = False):
    target = str(sheet or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="sheet is required")
    return _get_full_tc_sheet_data(sheet=target, max_rows=max_rows, force=bool(force))


def _looks_like_header(row: list[str]) -> bool:
    if not row:
        return False
    text_cells = 0
    for v in row:
        s = str(v or "").strip()
        if not s:
            continue
        if re.search(r"[A-Za-z가-힣]", s):
            text_cells += 1
    return text_cells >= max(2, len(row) // 3)


def _find_col_index(headers: list[str], candidates: list[str]) -> int:
    lowers = [str(x or "").strip().lower() for x in headers]
    for c in candidates:
        key = c.lower()
        for i, h in enumerate(lowers):
            if key in h:
                return i
    return -1


def _build_google_defect_stats(rows: list[list[str]]) -> dict:
    now = datetime.now().isoformat(timespec="seconds")
    source_type, source_value = _current_defect_source_info()
    uploaded_at = _uploaded_file_datetime_text(UPLOADED_DEFECT_RAW_FILE)
    if not rows:
        return {
            "ok": False,
            "source": source_value,
            "source_type": source_type,
            "uploaded_at": uploaded_at,
            "sheet": GOOGLE_DEFECT_SHEET_NAME,
            "range": GOOGLE_DEFECT_SHEET_RANGE,
            "updated_at": now,
            "total_rows": 0,
            "status_top": [],
            "severity_top": [],
            "assignee_top": [],
            "detail": "sheet fetch failed or empty",
        }

    headers = []
    data_rows = rows
    if _looks_like_header(rows[0]):
        headers = rows[0]
        data_rows = rows[1:]

    valid_rows = []
    for row in data_rows:
        cells = [str(x or "").strip() for x in row]
        if not any(cells):
            continue
        joined = " ".join(cells).lower()
        if "better excel exporter" in joined or joined.startswith("help") or "created at" in joined:
            continue
        valid_rows.append(row)

    status_idx = _find_col_index(headers, ["status", "state", "결함상태", "진행상태"])
    severity_idx = _find_col_index(headers, ["severity", "priority", "심각도", "우선순위"])
    assignee_idx = _find_col_index(headers, ["assignee", "owner", "담당", "담당자"])

    # DefectList_Raw sheet layout (B:R) is stable in this project:
    # C=Key, D=Status, F=Priority, O=Assignee.
    # Prefer fixed indexes first to avoid accidental summary-column mapping.
    sheet_name_norm = str(GOOGLE_DEFECT_SHEET_NAME or "").strip().lower()
    if sheet_name_norm == "defectlist_raw":
        status_idx = 2
        severity_idx = 4
        assignee_idx = 13

    def guess_categorical_cols(limit: int = 3) -> list[int]:
        if not valid_rows:
            return []
        width = max((len(r) for r in valid_rows), default=0)
        scored = []
        for idx in range(width):
            vals = []
            for row in valid_rows:
                if idx >= len(row):
                    continue
                s = str(row[idx] or "").strip()
                if s:
                    vals.append(s)
            filled = len(vals)
            if filled < 20:
                continue
            uniq = len(set(vals))
            if uniq < 2 or uniq > 100:
                continue
            # Prefer categorical columns with enough repetition and not too many unique values.
            score = (filled * 2) - (uniq * 5) + idx
            scored.append((score, idx))

        scored.sort(reverse=True)
        out = []
        for _, idx in scored:
            out.append(idx)
            if len(out) >= limit:
                break
        return out

    def keyword_score(idx: int, keywords: list[str]) -> int:
        if idx < 0:
            return -1
        score = 0
        seen = 0
        for row in valid_rows[:500]:
            if idx >= len(row):
                continue
            s = str(row[idx] or "").strip().lower()
            if not s:
                continue
            seen += 1
            for kw in keywords:
                if kw in s:
                    score += 1
                    break
        if seen == 0:
            return -1
        return score

    def counter_top(idx: int) -> list[dict]:
        if idx < 0:
            return []
        c = Counter()
        for row in valid_rows:
            if idx >= len(row):
                continue
            key = str(row[idx] or "").strip()
            if key:
                lowered = key.lower()
                if "better excel exporter" in lowered or "created at" in lowered or lowered.startswith("help"):
                    continue
                c[key] += 1
        return [{"name": k, "count": v} for k, v in c.most_common(8)]

    guessed = guess_categorical_cols(limit=4)
    status_keywords = ["open", "closed", "resolved", "reopen", "progress", "done", "new", "fixed", "pending"]
    severity_keywords = ["highest", "critical", "blocker", "high", "medium", "low", "lowest", "major", "minor"]

    if status_idx < 0 and guessed:
        status_idx = max(guessed, key=lambda x: keyword_score(x, status_keywords))
    if severity_idx < 0 and guessed:
        severity_idx = max(guessed, key=lambda x: keyword_score(x, severity_keywords))
        if severity_idx == status_idx and len(guessed) > 1:
            for x in guessed:
                if x != status_idx:
                    severity_idx = x
                    break
    if assignee_idx < 0 and len(guessed) > 2:
        assignee_idx = guessed[2]

    status_top = counter_top(status_idx)
    severity_top = counter_top(severity_idx)
    assignee_top = counter_top(assignee_idx)

    # Additional guard: if status candidates look like long summary texts,
    # force the known DefectList_Raw status/priority columns.
    def _looks_like_summary_bucket(items: list[dict]) -> bool:
        if not items:
            return False
        long_items = 0
        for it in items[:5]:
            name = str((it or {}).get("name", "")).strip()
            if len(name) >= 40 or ("[" in name and "]" in name):
                long_items += 1
        return long_items >= 2

    if sheet_name_norm == "defectlist_raw" and _looks_like_summary_bucket(status_top):
        status_idx = 2
        severity_idx = 4
        assignee_idx = 13
        status_top = counter_top(status_idx)
        severity_top = counter_top(severity_idx)
        assignee_top = counter_top(assignee_idx)

    return {
        "ok": True,
        "source": source_value,
        "source_type": source_type,
        "uploaded_at": uploaded_at,
        "sheet": GOOGLE_DEFECT_SHEET_NAME,
        "range": GOOGLE_DEFECT_SHEET_RANGE,
        "updated_at": now,
        "headers": headers,
        "total_rows": len(valid_rows),
        "status_top": status_top,
        "severity_top": severity_top,
        "assignee_top": assignee_top,
    }


def _get_cached_google_defect_stats(force: bool = False) -> dict:
    global GOOGLE_DEFECT_CACHE_TS, GOOGLE_DEFECT_CACHE_DATA, GOOGLE_DEFECT_CACHE_FETCHING
    now = time.monotonic()
    with GOOGLE_DEFECT_CACHE_LOCK:
        if (not force) and GOOGLE_DEFECT_CACHE_DATA and (now - GOOGLE_DEFECT_CACHE_TS) < GOOGLE_DEFECT_CACHE_TTL_SEC:
            return GOOGLE_DEFECT_CACHE_DATA
        # 다른 스레드가 이미 fetch 중이면 stale 데이터 즉시 반환 (thundering herd 방지)
        if (not force) and GOOGLE_DEFECT_CACHE_FETCHING and GOOGLE_DEFECT_CACHE_DATA:
            return GOOGLE_DEFECT_CACHE_DATA
        GOOGLE_DEFECT_CACHE_FETCHING = True

    stats = None
    try:
        rows = _fetch_google_defect_rows()
        stats = _build_google_defect_stats(rows)
    except Exception:
        pass
    finally:
        with GOOGLE_DEFECT_CACHE_LOCK:
            GOOGLE_DEFECT_CACHE_FETCHING = False

    if stats:
        with GOOGLE_DEFECT_CACHE_LOCK:
            GOOGLE_DEFECT_CACHE_DATA = stats
            GOOGLE_DEFECT_CACHE_TS = time.monotonic()

    return stats or GOOGLE_DEFECT_CACHE_DATA or _build_google_defect_stats([])


def _ensure_company_members_file() -> None:
    if COMPANY_MEMBERS_FILE.exists():
        return
    COMPANY_MEMBERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    COMPANY_MEMBERS_FILE.write_text(json.dumps(COMPANY_DEFAULT_MEMBERS, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_company_members() -> list[str]:
    _ensure_company_members_file()
    try:
        data = json.loads(COMPANY_MEMBERS_FILE.read_text(encoding="utf-8"))
    except Exception:
        data = COMPANY_DEFAULT_MEMBERS[:]
    if not isinstance(data, list):
        data = COMPANY_DEFAULT_MEMBERS[:]
    out = []
    seen = set()
    for item in data:
        name = str(item or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    if not out:
        out = COMPANY_DEFAULT_MEMBERS[:]
    return out


def _save_company_members(members: list[str]) -> None:
    COMPANY_MEMBERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    COMPANY_MEMBERS_FILE.write_text(json.dumps(members, ensure_ascii=False, indent=2), encoding="utf-8")


def _is_duplicate_issue(resolution: str, issue_type: str) -> bool:
    t = str(issue_type or "").lower()
    r = str(resolution or "").lower()
    return "duplicate" in r or "중복" in r or "duplicate" in t or "중복" in t


def _is_not_a_bug(resolution: str, issue_type: str) -> bool:
    t = str(issue_type or "").lower()
    r = str(resolution or "").lower()
    return ("not a bug" in r) or ("notabug" in r) or ("not a bug" in t) or ("notabug" in t)


def _severity_bucket(priority: str) -> str:
    p = str(priority or "").strip().lower()
    if p in SEVERITY_SCORE:
        return p
    return ""


def _extract_created_date(v: str) -> date | None:
    s = str(v or "").strip()
    if not s:
        return None
    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if not m:
        m2 = re.search(r"Date\((\d{4}),(\d{1,2}),(\d{1,2})\)", s)
        if m2:
            try:
                yy = int(m2.group(1))
                mm0 = int(m2.group(2))
                dd = int(m2.group(3))
                # Google Visualization Date literal uses 0-based month.
                return date(yy, mm0 + 1, dd)
            except Exception:
                return None
    else:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except Exception:
            pass

    for pattern in [
        r"(\d{4})[./]\s*(\d{1,2})[./]\s*(\d{1,2})",
        r"(\d{1,2})/(\d{1,2})/(\d{4})",
        r"(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일",
    ]:
        m3 = re.search(pattern, s)
        if not m3:
            continue
        try:
            if pattern in {
                r"(\d{4})[./]\s*(\d{1,2})[./]\s*(\d{1,2})",
                r"(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일",
            }:
                yy = int(m3.group(1))
                mm = int(m3.group(2))
                dd = int(m3.group(3))
            else:
                mm = int(m3.group(1))
                dd = int(m3.group(2))
                yy = int(m3.group(3))
            return date(yy, mm, dd)
        except Exception:
            continue
    return None


def _parse_date_param(v: str | None) -> date | None:
    s = str(v or "").strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except Exception:
        return None


def _filter_issue_rows_by_date(rows: list[dict], start_date: str | None, end_date: str | None) -> list[dict]:
    sd = _parse_date_param(start_date)
    ed = _parse_date_param(end_date)
    if sd is None and ed is None:
        return rows

    out = []
    for row in rows:
        d = _extract_created_date(str(row.get("created", "")))
        if d is None:
            continue
        if sd and d < sd:
            continue
        if ed and d > ed:
            continue
        out.append(row)
    return out


def _normalize_defect_status(v: str) -> str:
    text = re.sub(r"\s+", " ", str(v or "").strip())
    if not text:
        return ""

    key = re.sub(r"[-_/]+", " ", text).strip().lower()
    alias_map = {
        "close": "Close",
        "closed": "Close",
        "open": "Open",
        "opened": "Open",
        "resolved": "Resolved",
        "resolve": "Resolved",
        "fixed": "Resolved",
        "pending": "Pending",
        "on hold": "Pending",
        "hold": "Pending",
        "in progress": "In Progress",
        "progress": "In Progress",
        "processing": "In Progress",
        "reopened": "Reopened",
        "reopen": "Reopened",
        "re opened": "Reopened",
        "re open": "Reopened",
    }
    if key in alias_map:
        return alias_map[key]
    return text.title()


def _build_defect_issue_rows(rows: list[list[str]], members: list[str] | None = None) -> list[dict]:
    member_set = {str(x or "").strip() for x in (members or []) if str(x or "").strip()}
    member_filter_enabled = bool(member_set)

    issue_rows = []
    for row in rows:
        # B2:R range (17 columns: Key, Status, Resolution, Priority, Region, OS, Components, ...)
        if len(row) < 12:
            continue

        def _cell(idx: int) -> str:
            return str(row[idx] or "").strip() if idx < len(row) else ""

        # B2:R range mapping (data starts from B2):
        # B=Key, C=Status, D=Resolution, E=Priority, F=Region, G=OS,
        # H=Components (정기배포), I=Brand, J=Summary, K=Affects Version/s,
        # L=Fix Version/s, M=Reporter, N=Assignee, O=Created, P=Labels, Q=비고, R=Links
        key = _cell(0)             # B: Key
        status = _cell(1)          # C: Status
        resolution = _cell(2)      # D: Resolution
        priority = _cell(3)        # E: Priority
        reporter = _cell(11)       # M: Reporter
        if not key:
            continue
        if member_filter_enabled and reporter not in member_set:
            continue

        issue_rows.append(
            {
                "type": "",                           # A열 (Type) - 별도 처리 필요시
                "key": key,                          # B: Key
                "status": status,                    # C: Status
                "resolution": resolution,            # D: Resolution
                "priority": priority,                # E: Priority
                "region": _cell(4),                 # F: Region
                "os": _cell(5),                     # G: OS
                "components": _cell(6),            # H: Components (정기배포)
                "brand": _cell(7),                  # I: Brand
                "summary": _cell(8),               # J: Summary
                "affects_versions": _cell(9),      # K: Affects Version/s
                "fix_versions": _cell(10),         # L: Fix Version/s
                "reporter": reporter,               # M: Reporter
                "assignee": _cell(12),             # N: Assignee
                "created": _cell(13),              # O: Created
                "labels": _cell(14),               # P: Labels
                "links": _cell(16),                # R: Links
            }
        )
    return issue_rows


def _build_member_summary_from_issue_rows(issue_rows: list[dict], members: list[str]) -> list[dict]:
    stats_by_member: dict[str, dict] = {}
    for name in members:
        stats_by_member[name] = {
            "name": name,
            "total_issue": 0,
            "duplicate": 0,
            "not_a_bug": 0,
            "definite_problem": 0,
            "mistake_rate": 0.0,
            "highest": 0.0,
            "high": 0.0,
            "medium": 0.0,
            "low": 0.0,
            "lowest": 0.0,
            "score": 0.0,
            "rank": 0,
        }

    member_set = set(members)
    for row in issue_rows:
        reporter = str(row.get("reporter", "")).strip()
        if reporter not in member_set:
            continue
        issue_type = str(row.get("type", "")).strip()
        resolution = str(row.get("resolution", "")).strip()
        priority = str(row.get("priority", "")).strip()
        rec = stats_by_member[reporter]
        rec["total_issue"] += 1
        if _is_duplicate_issue(resolution, issue_type):
            rec["duplicate"] += 1
        elif _is_not_a_bug(resolution, issue_type):
            rec["not_a_bug"] += 1

        sev = _severity_bucket(priority)
        if sev:
            rec[sev] += float(SEVERITY_SCORE[sev])

    for name in members:
        rec = stats_by_member[name]
        rec["definite_problem"] = max(0, rec["total_issue"] - rec["duplicate"] - rec["not_a_bug"])
        rec["mistake_rate"] = round((rec["duplicate"] / rec["total_issue"]) * 100.0, 1) if rec["total_issue"] else 0.0
        sev_sum = rec["highest"] + rec["high"] + rec["medium"] + rec["low"] + rec["lowest"]
        rec["score"] = round(sev_sum - rec["duplicate"], 1)

    ranked = sorted(stats_by_member.values(), key=lambda x: (-x["score"], -x["definite_problem"], x["name"]))
    for i, rec in enumerate(ranked, start=1):
        rec["rank"] = i
    return ranked


def _calc_company_defect_stats(rows: list[list[str]], members: list[str]) -> dict:
    source_type, source_value = _current_defect_source_info()
    uploaded_at = _uploaded_file_datetime_text(UPLOADED_DEFECT_RAW_FILE)
    all_issue_rows = _build_defect_issue_rows(rows)
    issue_rows = _build_defect_issue_rows(rows, members)
    ranked = _build_member_summary_from_issue_rows(issue_rows, members)
    fingerprint_src = json.dumps(issue_rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha1(fingerprint_src.encode("utf-8")).hexdigest()

    return {
        "ok": True,
        "source": source_value,
        "source_type": source_type,
        "uploaded_at": uploaded_at,
        "sheet": GOOGLE_DEFECT_SHEET_NAME,
        "range": GOOGLE_TEAM_DEFECT_RANGE,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "total_rows": len(issue_rows),
        "all_total_rows": len(all_issue_rows),
        "fingerprint": fingerprint,
        "members": ranked,
        "all_issues": all_issue_rows,
        "issues": issue_rows,
    }


def _get_cached_raw_defect_issue_stats(force: bool = False) -> dict:
    global RAW_DEFECT_ISSUES_CACHE_TS, RAW_DEFECT_ISSUES_CACHE_DATA, RAW_DEFECT_ISSUES_CACHE_FETCHING
    now = time.monotonic()
    with RAW_DEFECT_ISSUES_CACHE_LOCK:
        if (not force) and RAW_DEFECT_ISSUES_CACHE_DATA and (now - RAW_DEFECT_ISSUES_CACHE_TS) < GOOGLE_DEFECT_CACHE_TTL_SEC:
            return RAW_DEFECT_ISSUES_CACHE_DATA
        if (not force) and RAW_DEFECT_ISSUES_CACHE_FETCHING and RAW_DEFECT_ISSUES_CACHE_DATA:
            return RAW_DEFECT_ISSUES_CACHE_DATA
        RAW_DEFECT_ISSUES_CACHE_FETCHING = True

    stats = None
    source_type, source_value = _current_defect_source_info()
    uploaded_at = _uploaded_file_datetime_text(UPLOADED_DEFECT_RAW_FILE)
    try:
        rows = _fetch_google_sheet_rows(f"{GOOGLE_DEFECT_SHEET_NAME}!{GOOGLE_RAW_STATUS_RANGE}")
        issues = _build_defect_issue_rows(rows)
        raw_fingerprint_src = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        stats = {
            "ok": True,
            "source": source_value,
            "source_type": source_type,
            "uploaded_at": uploaded_at,
            "sheet": GOOGLE_DEFECT_SHEET_NAME,
            "range": GOOGLE_RAW_STATUS_RANGE,
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "total_rows": len(issues),
            "source_fingerprint": hashlib.sha1(raw_fingerprint_src.encode("utf-8")).hexdigest(),
            "issues": issues,
        }
    except Exception:
        pass
    finally:
        with RAW_DEFECT_ISSUES_CACHE_LOCK:
            RAW_DEFECT_ISSUES_CACHE_FETCHING = False

    if stats:
        with RAW_DEFECT_ISSUES_CACHE_LOCK:
            RAW_DEFECT_ISSUES_CACHE_DATA = stats
            RAW_DEFECT_ISSUES_CACHE_TS = time.monotonic()

    return RAW_DEFECT_ISSUES_CACHE_DATA or {
        "ok": False,
        "source": source_value,
        "source_type": source_type,
        "uploaded_at": uploaded_at,
        "sheet": GOOGLE_DEFECT_SHEET_NAME,
        "range": GOOGLE_TEAM_DEFECT_RANGE,
        "updated_at": "",
        "total_rows": 0,
        "issues": [],
    }


def _split_release_versions(*values: str) -> list[str]:
    out = []
    seen = set()
    for raw in values:
        text = str(raw or "").strip()
        if not text:
            continue
        for token in re.split(r"[,/|\s]+", text):
            t = str(token or "").strip()
            if not t:
                continue
            if len(t) > 18:
                continue
            if t in seen:
                continue
            seen.add(t)
            out.append(t)
    return out


def _extract_release_tags_from_i_column(value: str) -> list[str]:
    text = str(value or "").strip()
    if not text or "정기배포" not in text:
        return []
    tags = []
    seen = set()
    # Accept styles like '2507정기배포', '2507 정기배포', or plain '정기배포'.
    for m in re.finditer(r"(\d{4})\s*정기배포", text):
        tag = f"{m.group(1)}정기배포"
        if tag not in seen:
            seen.add(tag)
            tags.append(tag)
    if not tags:
        tags.append("정기배포")
    return tags


def _build_regular_release_stats(issue_rows: list[dict]) -> dict:
    release_rows = []
    for row in issue_rows:
        region_text = str(row.get("region", "")).strip()
        if "eu" not in region_text.lower():
            continue
        # Regular release marker comes from I column (mapped as components).
        release_tags = _extract_release_tags_from_i_column(str(row.get("components", "")))
        if not release_tags:
            continue
        created = _extract_created_date(str(row.get("created", "")))
        created_text = created.isoformat() if created else "-"
        labels_text = str(row.get("labels", "")).strip().lower()
        full_tc = "전수평가tc" in labels_text
        release_rows.append(
            {
                "region": region_text or "기타",
                "reporter": str(row.get("reporter", "")).strip() or "미지정",
                "created": created_text,
                "versions": release_tags,
                "full_tc": full_tc,
            }
        )

    version_counter = Counter()
    for r in release_rows:
        for v in r["versions"]:
            version_counter[v] += 1

    versions_sorted = [v for v, _ in version_counter.most_common(18)]

    # region -> reporter -> date aggregation
    grouped: dict[str, dict[str, dict[str, dict]]]= {}
    for r in release_rows:
        region = r["region"]
        reporter = r["reporter"]
        day = r["created"]
        grouped.setdefault(region, {}).setdefault(reporter, {}).setdefault(
            day,
            {"sum": 0, "full_tc": 0, "versions": Counter()},
        )
        rec = grouped[region][reporter][day]
        rec["sum"] += 1
        if bool(r.get("full_tc", False)):
            rec["full_tc"] += 1
        for v in r["versions"]:
            if v in versions_sorted:
                rec["versions"][v] += 1

    region_rows = []
    for region in sorted(grouped.keys()):
        members = []
        for reporter in sorted(grouped[region].keys()):
            date_items = []
            member_total = 0
            member_full_tc = 0
            member_by_version = Counter()
            for day in sorted(grouped[region][reporter].keys()):
                row_rec = grouped[region][reporter][day]
                member_total += int(row_rec["sum"])
                member_full_tc += int(row_rec.get("full_tc", 0))
                member_by_version.update(row_rec["versions"])
                date_items.append(
                    {
                        "date": day,
                        "sum": int(row_rec["sum"]),
                        "full_tc": int(row_rec.get("full_tc", 0)),
                        "versions": {v: int(row_rec["versions"].get(v, 0)) for v in versions_sorted},
                    }
                )
            members.append(
                {
                    "name": reporter,
                    "sum": member_total,
                    "full_tc": member_full_tc,
                    "versions": {v: int(member_by_version.get(v, 0)) for v in versions_sorted},
                    "dates": date_items,
                }
            )
        region_rows.append({"region": region, "members": members})

    full_tc_total = sum(1 for r in release_rows if bool(r.get("full_tc", False)))

    return {
        "ok": True,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "total_rows": len(release_rows),
        "full_tc_total": int(full_tc_total),
        "versions": versions_sorted,
        "summary_by_version": [{"name": v, "count": int(version_counter.get(v, 0))} for v in versions_sorted],
        "regions": region_rows,
    }


def _extract_closing_cycles(*values: str) -> list[str]:
    out = []
    seen = set()

    def _add(token: str) -> None:
        t = str(token or "").strip()
        if not re.fullmatch(r"\d{4}", t):
            return
        if t in seen:
            return
        seen.add(t)
        out.append(t)

    for raw in values:
        text = str(raw or "").strip()
        if not text:
            continue
        for m in re.finditer(r"(\d{4})\s*정기배포", text):
            _add(m.group(1))
        for token in re.split(r"[,/|\s]+", text):
            _add(token)

    return out


def _build_closing_summary_stats(issue_rows: list[dict], selected_cycle: str = "") -> dict:
    wanted_cycle = str(selected_cycle or "").strip()
    groups = ["KOA", "HOA", "GOA"]

    # Build tab candidates first from DefectList_Raw derived rows.
    cycle_counter = Counter()
    for row in issue_rows:
        brand_text = str(row.get("brand", "")).upper()
        if not any(g in brand_text for g in groups):
            continue
        cycles = _extract_closing_cycles(
            str(row.get("fix_versions", "")),
            str(row.get("affects_versions", "")),
            str(row.get("components", "")),
        )
        for c in cycles:
            cycle_counter[c] += 1

    cycles_sorted = sorted(cycle_counter.keys())
    if wanted_cycle and wanted_cycle not in cycle_counter:
        cycles_sorted.append(wanted_cycle)
        cycles_sorted = sorted(set(cycles_sorted))

    def _norm_status(v: str) -> str:
        return re.sub(r"\s+", " ", str(v or "").strip().lower())

    base_status_keys = ["open", "in progress", "resolved", "closed", "reopened", "pending", "done", "new"]
    processed_statuses = {"resolved", "closed", "done"}
    remaining_statuses = {"open", "in progress", "reopened", "pending", "new"}
    base_priority_keys = ["highest", "high", "medium", "low", "lowest"]

    def _norm_priority(v: str) -> str:
        t = str(v or "").strip().lower()
        return t if t in set(base_priority_keys) else ""

    group_rows = []
    totals_status = Counter()
    totals_priority = Counter()
    totals_rows = 0
    phase_rows = []
    phase_totals_map = {
        "occurred": Counter(),
        "processed": Counter(),
        "remaining": Counter(),
    }

    for group in groups:
        status_counter = Counter()
        priority_counter = Counter()
        group_total = 0
        occurred_counter = Counter()
        processed_counter = Counter()
        remaining_counter = Counter()

        for row in issue_rows:
            brand_text = str(row.get("brand", "")).upper()
            if group not in brand_text:
                continue
            cycles = _extract_closing_cycles(
                str(row.get("fix_versions", "")),
                str(row.get("affects_versions", "")),
                str(row.get("components", "")),
            )
            if wanted_cycle and wanted_cycle not in cycles:
                continue

            group_total += 1
            status = _norm_status(str(row.get("status", "")))
            priority = _norm_priority(str(row.get("priority", "")))
            if status:
                status_counter[status] += 1
                totals_status[status] += 1
            if priority:
                priority_counter[priority] += 1
                totals_priority[priority] += 1
                occurred_counter[priority] += 1
                phase_totals_map["occurred"][priority] += 1
                if status in processed_statuses:
                    processed_counter[priority] += 1
                    phase_totals_map["processed"][priority] += 1
                if status in remaining_statuses:
                    remaining_counter[priority] += 1
                    phase_totals_map["remaining"][priority] += 1

        totals_rows += group_total
        group_rows.append(
            {
                "name": group,
                "total": int(group_total),
                "status": {k: int(status_counter.get(k, 0)) for k in base_status_keys},
                "status_other": int(
                    sum(v for k, v in status_counter.items() if k not in set(base_status_keys))
                ),
                "priority": {
                    "highest": int(priority_counter.get("highest", 0)),
                    "high": int(priority_counter.get("high", 0)),
                    "medium": int(priority_counter.get("medium", 0)),
                    "low": int(priority_counter.get("low", 0)),
                    "lowest": int(priority_counter.get("lowest", 0)),
                },
            }
        )

        for phase_key, phase_label, counter in [
            ("occurred", "발생 이슈", occurred_counter),
            ("processed", "처리 이슈", processed_counter),
            ("remaining", "잔여 이슈", remaining_counter),
        ]:
            phase_rows.append(
                {
                    "phase": phase_key,
                    "phase_label": phase_label,
                    "group": group,
                    "priority": {k: int(counter.get(k, 0)) for k in base_priority_keys},
                    "total": int(sum(counter.values())),
                }
            )

    phase_totals = {}
    for key in ["occurred", "processed", "remaining"]:
        c = phase_totals_map[key]
        phase_totals[key] = {
            "priority": {k: int(c.get(k, 0)) for k in base_priority_keys},
            "total": int(sum(c.values())),
        }

    return {
        "ok": True,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "selected_cycle": wanted_cycle,
        "cycles": cycles_sorted,
        "total_rows": int(totals_rows),
        "groups": group_rows,
        "phase_rows": phase_rows,
        "phase_totals": phase_totals,
        "totals": {
            "status": {k: int(totals_status.get(k, 0)) for k in base_status_keys},
            "status_other": int(sum(v for k, v in totals_status.items() if k not in set(base_status_keys))),
            "priority": {
                "highest": int(totals_priority.get("highest", 0)),
                "high": int(totals_priority.get("high", 0)),
                "medium": int(totals_priority.get("medium", 0)),
                "low": int(totals_priority.get("low", 0)),
                "lowest": int(totals_priority.get("lowest", 0)),
            },
        },
    }


def _get_cached_company_defect_stats(force: bool = False) -> dict:
    global COMPANY_DEFECT_CACHE_TS, COMPANY_DEFECT_CACHE_DATA, COMPANY_DEFECT_CACHE_FETCHING
    now = time.monotonic()
    with COMPANY_DEFECT_CACHE_LOCK:
        if (not force) and COMPANY_DEFECT_CACHE_DATA and (now - COMPANY_DEFECT_CACHE_TS) < GOOGLE_DEFECT_CACHE_TTL_SEC:
            return COMPANY_DEFECT_CACHE_DATA
        if (not force) and COMPANY_DEFECT_CACHE_FETCHING and COMPANY_DEFECT_CACHE_DATA:
            return COMPANY_DEFECT_CACHE_DATA
        COMPANY_DEFECT_CACHE_FETCHING = True

    stats = None
    try:
        members = _load_company_members()
        rows = _fetch_google_sheet_rows(f"{GOOGLE_DEFECT_SHEET_NAME}!{GOOGLE_TEAM_DEFECT_RANGE}")
        stats = _calc_company_defect_stats(rows, members)
        raw_fingerprint_src = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        stats["source_fingerprint"] = hashlib.sha1(raw_fingerprint_src.encode("utf-8")).hexdigest()
        _record_defectlist_refresh_update(stats)
    except Exception:
        pass
    finally:
        with COMPANY_DEFECT_CACHE_LOCK:
            COMPANY_DEFECT_CACHE_FETCHING = False

    if stats:
        with COMPANY_DEFECT_CACHE_LOCK:
            COMPANY_DEFECT_CACHE_DATA = stats
            COMPANY_DEFECT_CACHE_TS = time.monotonic()

    return stats or COMPANY_DEFECT_CACHE_DATA or _calc_company_defect_stats([], [])


@app.get("/api/stats/defects")
def defect_stats(force: bool = False):
    return _get_cached_google_defect_stats(force=bool(force))


@app.post("/api/stats/defects/refresh")
def refresh_defect_stats_now():
    defect = _get_cached_google_defect_stats(force=True)
    company = _get_cached_company_defect_stats(force=True)
    raw_issues = _get_cached_raw_defect_issue_stats(force=True)
    header_rows, defectlist_rows = _get_cached_defectlist_rows(force=True)
    regular = _build_regular_release_stats(company.get("issues", []))
    return {
        "ok": True,
        "detail": "defectlist_raw_refreshed",
        "defect_updated_at": defect.get("updated_at", ""),
        "company_updated_at": company.get("updated_at", ""),
        "raw_issue_updated_at": raw_issues.get("updated_at", ""),
        "defectlist_rows_updated_at": datetime.now().isoformat(timespec="seconds"),
        "regular_updated_at": regular.get("updated_at", ""),
        "defect_total_rows": int(defect.get("total_rows", 0) or 0),
        "company_total_rows": int(company.get("total_rows", 0) or 0),
        "raw_issue_total_rows": int(raw_issues.get("total_rows", 0) or 0),
        "defectlist_header_rows": int(len(header_rows or [])),
        "defectlist_data_rows": int(len(defectlist_rows or [])),
        "regular_total_rows": int(regular.get("total_rows", 0) or 0),
    }


@app.get("/api/company-members")
def company_members():
    return {"ok": True, "members": _load_company_members()}


@app.post("/api/company-members/add")
def add_company_member(name: str = Form(...)):
    member = str(name or "").strip()
    if not member:
        raise HTTPException(status_code=400, detail="name is required")
    members = _load_company_members()
    if member in members:
        return {"ok": True, "added": False, "name": member, "members": members}
    members.append(member)
    _save_company_members(members)
    with COMPANY_DEFECT_CACHE_LOCK:
        # force recompute on next request
        global COMPANY_DEFECT_CACHE_TS
        COMPANY_DEFECT_CACHE_TS = 0.0
    return {"ok": True, "added": True, "name": member, "members": members}


@app.post("/api/company-members/remove")
def remove_company_member(name: str = Form(...)):
    member = str(name or "").strip()
    if not member:
        raise HTTPException(status_code=400, detail="name is required")
    members = _load_company_members()
    if member not in members:
        return {"ok": True, "removed": False, "name": member, "members": members}
    if len(members) <= 1:
        raise HTTPException(status_code=400, detail="at least one member must remain")
    members = [x for x in members if x != member]
    _save_company_members(members)
    with COMPANY_DEFECT_CACHE_LOCK:
        global COMPANY_DEFECT_CACHE_TS
        COMPANY_DEFECT_CACHE_TS = 0.0
    return {"ok": True, "removed": True, "name": member, "members": members}


@app.get("/api/stats/company-defects")
def company_defect_stats(force: bool = False, start_date: str = "", end_date: str = ""):
    data = _get_cached_company_defect_stats(force=bool(force))
    members = _load_company_members()
    filtered_rows = _filter_issue_rows_by_date(data.get("issues", []), start_date=start_date, end_date=end_date)
    ranked = _build_member_summary_from_issue_rows(filtered_rows, members)
    return {
        "ok": True,
        "sheet": data.get("sheet"),
        "range": data.get("range"),
        "updated_at": data.get("updated_at"),
        "start_date": start_date or "",
        "end_date": end_date or "",
        "total_rows": len(filtered_rows),
        "members": ranked,
    }


@app.get("/api/stats/company-defects/detail")
def company_defect_detail(name: str, force: bool = False, start_date: str = "", end_date: str = ""):
    target = str(name or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="name is required")
    data = _get_cached_company_defect_stats(force=bool(force))
    filtered = _filter_issue_rows_by_date(data.get("issues", []), start_date=start_date, end_date=end_date)
    rows = [x for x in filtered if str(x.get("reporter", "")).strip() == target]
    return {
        "ok": True,
        "name": target,
        "count": len(rows),
        "rows": rows,
        "start_date": start_date or "",
        "end_date": end_date or "",
        "sheet": data.get("sheet"),
        "range": data.get("range"),
        "updated_at": data.get("updated_at"),
    }


@app.get("/api/stats/company-defects/by-status")
def company_defect_by_status(status: str, groups: str = "", regions: str = "", force: bool = False, start_date: str = "", end_date: str = ""):
    target = str(status or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="status is required")

    def _norm(v: str) -> str:
        return re.sub(r"\s+", " ", str(v or "").strip().lower())

    data = _get_cached_company_defect_stats(force=bool(force))
    filtered = _filter_issue_rows_by_date(data.get("issues", []), start_date=start_date, end_date=end_date)
    wanted = _norm(target)
    group_list = [str(x or "").strip().upper() for x in str(groups or "").split(",") if str(x or "").strip()]
    group_set = set(group_list)
    region_list = [str(x or "").strip().upper() for x in str(regions or "").split(",") if str(x or "").strip()]
    region_set = set(region_list)
    rows = []
    for x in filtered:
        if _norm(str(x.get("status", ""))) != wanted:
            continue
        region_text = str(x.get("region", "")).upper()
        if region_set and not any(r in region_text for r in region_set):
            continue
        if group_set:
            brand_text = str(x.get("brand", "")).upper()
            if not any(g in brand_text for g in group_set):
                continue
        rows.append(x)
    return {
        "ok": True,
        "status": target,
        "groups": sorted(group_set),
        "count": len(rows),
        "rows": rows,
        "start_date": start_date or "",
        "end_date": end_date or "",
        "sheet": data.get("sheet"),
        "range": data.get("range"),
        "updated_at": data.get("updated_at"),
    }


@app.get("/api/stats/company-defects/status-summary")
def company_defect_status_summary(days: int = 30, force: bool = False):
    data = _get_cached_raw_defect_issue_stats(force=bool(force))
    raw_rows = data.get("issues", [])

    req_days = int(days or 0)
    if req_days <= 0:
        window_days = 0
        filtered = list(raw_rows)
        start_text = ""
        end_text = ""
    else:
        window_days = max(1, min(365, req_days))
        end_d = date.today()
        start_d = end_d - timedelta(days=window_days - 1)
        filtered = _filter_issue_rows_by_date(
            raw_rows,
            start_date=start_d.isoformat(),
            end_date=end_d.isoformat(),
        )
        start_text = start_d.isoformat()
        end_text = end_d.isoformat()

    counter = Counter()
    for row in filtered:
        status_name = _normalize_defect_status(str(row.get("status", "")))
        if not status_name:
            continue
        counter[status_name] += 1

    status_top = [
        {"name": k, "count": int(v)}
        for k, v in counter.most_common(12)
    ]

    return {
        "ok": True,
        "days": window_days,
        "start_date": start_text,
        "end_date": end_text,
        "updated_at": data.get("updated_at", ""),
        "total_rows": int(sum(counter.values())),
        "sheet": data.get("sheet", GOOGLE_DEFECT_SHEET_NAME),
        "range": data.get("range", GOOGLE_TEAM_DEFECT_RANGE),
        "status_top": status_top,
    }


@app.get("/api/stats/closing-summary/cycle-counts")
def closing_summary_cycle_counts(force: bool = False):
    data = _get_cached_company_defect_stats(force=bool(force))
    rows = data.get("issues", [])

    cycle_counter = Counter()
    for row in rows:
        cycles = _extract_closing_cycles(
            str(row.get("fix_versions", "")),
            str(row.get("affects_versions", "")),
            str(row.get("components", "")),
        )
        for c in cycles:
            cycle_counter[c] += 1

    cycles_sorted = sorted(cycle_counter.keys(), key=lambda x: int(x), reverse=True)
    cycle_counts = [
        {"name": c, "count": int(cycle_counter.get(c, 0))}
        for c in cycles_sorted
    ]

    return {
        "ok": True,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "total_rows": int(sum(cycle_counter.values())),
        "cycle_counts": cycle_counts,
    }


@app.get("/api/stats/regular-release")
def regular_release_stats(force: bool = False):
    # Use shared cache by default to keep page interactions responsive.
    data = _get_cached_company_defect_stats(force=bool(force))
    return _build_regular_release_stats(data.get("issues", []))


@app.get("/api/stats/regular-release/detail")
def regular_release_detail(version: str = "", date: str = "", full_tc_only: bool = False, force: bool = False):
    target_version = str(version or "").strip()
    target_date = str(date or "").strip()
    data = _get_cached_company_defect_stats(force=bool(force))
    rows = []
    for x in data.get("issues", []):
        region_text = str(x.get("region", "")).upper()
        if "EU" not in region_text:
            continue
        tags = _extract_release_tags_from_i_column(str(x.get("components", "")))
        if not tags:
            continue
        if target_version and target_version not in tags:
            continue
        created = _extract_created_date(str(x.get("created", "")))
        created_text = created.isoformat() if created else "-"
        if target_date and created_text != target_date:
            continue
        labels_text = str(x.get("labels", "")).strip().lower()
        if bool(full_tc_only) and "전수평가tc" not in labels_text:
            continue
        rows.append(x)

    return {
        "ok": True,
        "version": target_version,
        "date": target_date,
        "full_tc_only": bool(full_tc_only),
        "count": len(rows),
        "rows": rows,
        "updated_at": data.get("updated_at", ""),
    }


@app.get("/api/stats/closing-summary")
def closing_summary_stats(cycle: str = "", force: bool = False):
    data = _get_cached_company_defect_stats(force=bool(force))
    return _build_closing_summary_stats(data.get("issues", []), selected_cycle=cycle)


@app.get("/api/stats/closing-summary/detail")
def closing_summary_detail(
    cycle: str = "",
    phase: str = "",
    group: str = "",
    severity: str = "",
    force: bool = False,
):
    selected_cycle = str(cycle or "").strip()
    selected_phase = str(phase or "").strip().lower()
    selected_group = str(group or "").strip().upper()
    selected_severity = str(severity or "").strip().lower()

    processed_statuses = {"resolved", "closed", "done"}
    remaining_statuses = {"open", "in progress", "reopened", "pending", "new"}

    def _norm_status(v: str) -> str:
        return re.sub(r"\s+", " ", str(v or "").strip().lower())

    def _norm_priority(v: str) -> str:
        p = str(v or "").strip().lower()
        if p in {"highest", "high", "medium", "low", "lowest"}:
            return p
        return ""

    data = _get_cached_company_defect_stats(force=bool(force))
    out_rows = []
    for row in data.get("issues", []):
        brand_text = str(row.get("brand", "")).upper()
        if selected_group and selected_group not in brand_text:
            continue
        if selected_group == "":
            if not any(g in brand_text for g in ["KOA", "HOA", "GOA"]):
                continue

        cycles = _extract_closing_cycles(
            str(row.get("fix_versions", "")),
            str(row.get("affects_versions", "")),
            str(row.get("components", "")),
        )
        if selected_cycle and selected_cycle not in cycles:
            continue

        status = _norm_status(str(row.get("status", "")))
        if selected_phase == "processed" and status not in processed_statuses:
            continue
        if selected_phase == "remaining" and status not in remaining_statuses:
            continue
        # occurred means all rows for the selected cycle/group.

        priority = _norm_priority(str(row.get("priority", "")))
        if selected_severity == "lowlowest":
            if priority not in {"low", "lowest"}:
                continue
        elif selected_severity in {"highest", "high", "medium", "low", "lowest"}:
            if priority != selected_severity:
                continue

        out_rows.append(row)

    return {
        "ok": True,
        "cycle": selected_cycle,
        "phase": selected_phase,
        "group": selected_group,
        "severity": selected_severity,
        "count": len(out_rows),
        "rows": out_rows,
        "updated_at": data.get("updated_at", ""),
    }


def _detect_lan_ip() -> str:
    # Best-effort LAN IP detection for share links.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and ip != "127.0.0.1":
                return ip
    except Exception:
        return ""
    return ""


def _build_android_config_by_udid() -> dict[str, dict]:
    if not DEVICE_CONFIG_FILE.exists():
        return {}
    try:
        rows = json.loads(DEVICE_CONFIG_FILE.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            return {}
    except Exception:
        return {}

    out: dict[str, dict] = {}
    for item in rows:
        if not isinstance(item, dict):
            continue
        if str(item.get("platform", "")).lower() != "android":
            continue
        udid = str(item.get("udid", "")).strip()
        if not udid:
            continue
        out[udid] = item
    return out


def _memory_key(platform: str, udid: str, device_id: str = "") -> str:
    p = str(platform).strip().lower() or "unknown"
    u = str(udid).strip()
    d = str(device_id).strip()
    return f"{p}:{u or d}"


def _load_device_memory_cache() -> None:
    global DEVICE_MEMORY_LOADED, DEVICE_MEMORY_CACHE
    with DEVICE_MEMORY_LOCK:
        if DEVICE_MEMORY_LOADED:
            return
        if not DEVICE_MEMORY_FILE.exists():
            DEVICE_MEMORY_CACHE = {}
            DEVICE_MEMORY_LOADED = True
            return
        try:
            raw = json.loads(DEVICE_MEMORY_FILE.read_text(encoding="utf-8"))
            DEVICE_MEMORY_CACHE = raw if isinstance(raw, dict) else {}
        except Exception:
            DEVICE_MEMORY_CACHE = {}
        DEVICE_MEMORY_LOADED = True


def _flush_device_memory_cache() -> None:
    DEVICE_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    DEVICE_MEMORY_FILE.write_text(
        json.dumps(DEVICE_MEMORY_CACHE, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _remember_device_profile(platform: str, udid: str, device_id: str, name: str) -> None:
    _load_device_memory_cache()
    key = _memory_key(platform, udid, device_id)
    now = datetime.utcnow().isoformat(timespec="seconds")
    with DEVICE_MEMORY_LOCK:
        old = DEVICE_MEMORY_CACHE.get(key, {})
        new_item = {
            "platform": str(platform).strip().lower(),
            "udid": str(udid).strip(),
            "device_id": str(device_id).strip(),
            "name": str(name).strip() or str(old.get("name", "")).strip() or str(device_id).strip(),
            "updated_at": now,
            "created_at": str(old.get("created_at", now)),
        }
        if old == new_item:
            return
        DEVICE_MEMORY_CACHE[key] = new_item
        _flush_device_memory_cache()


def _get_remembered_name(platform: str, udid: str, device_id: str = "") -> str:
    _load_device_memory_cache()
    key = _memory_key(platform, udid, device_id)
    with DEVICE_MEMORY_LOCK:
        row = DEVICE_MEMORY_CACHE.get(key, {})
        return str(row.get("name", "")).strip()


def _build_ios_config_by_id() -> dict[str, dict]:
    if not DEVICE_CONFIG_FILE.exists():
        return {}
    try:
        rows = json.loads(DEVICE_CONFIG_FILE.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            return {}
    except Exception:
        return {}

    out: dict[str, dict] = {}
    for item in rows:
        if not isinstance(item, dict):
            continue
        if str(item.get("platform", "")).lower() != "ios":
            continue
        if not bool(item.get("enabled", False)):
            continue
        device_id = str(item.get("deviceId", "")).strip()
        if not device_id:
            continue
        out[device_id] = item
    return out


def _sync_ios_devices_from_config() -> None:
    ios_cfg = _build_ios_config_by_id()
    if not ios_cfg:
        return

    snapshot = orchestrator.get_dashboard_data()
    existing = {str(d.device_id): d for d in snapshot.get("devices", []) if str(d.platform).lower() == "ios"}

    for device_id, cfg in ios_cfg.items():
        cfg_name = str(cfg.get("name", device_id)).strip() or device_id
        remembered_name = _get_remembered_name("ios", str(cfg.get("udid", device_id)).strip() or device_id, device_id)
        name = remembered_name or cfg_name
        udid = str(cfg.get("udid", device_id)).strip() or device_id
        appium_url = str(cfg.get("appiumUrl", "")).strip()
        if not appium_url and cfg.get("appiumPort"):
            appium_url = f"http://127.0.0.1:{int(cfg.get('appiumPort'))}"
        if not appium_url:
            appium_url = "http://127.0.0.1:4725"

        if device_id in existing:
            if remembered_name and str(existing[device_id].name) != remembered_name:
                orchestrator.rename_device(device_id, remembered_name)
            orchestrator.heartbeat(device_id)
            continue

        orchestrator.register_device(
            Device(
                device_id=device_id,
                name=name,
                platform="ios",
                appium_url=appium_url,
                udid=udid,
            )
        )
        _remember_device_profile("ios", udid, device_id, name)


def _run_adb(target: Device, args: list[str], timeout_sec: int = 5) -> subprocess.CompletedProcess:
    adb_exe = _resolve_adb_executable()
    return subprocess.run([adb_exe, "-s", target.udid] + args, capture_output=True, timeout=timeout_sec, check=False)


def _lock_android(target: Device) -> None:
    proc = _run_adb(target, ["shell", "input", "keyevent", "26"], timeout_sec=5)
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="ignore")[:200]
        raise HTTPException(status_code=503, detail=f"adb lock failed: {err}")


def _wake_android_screen(target: Device) -> None:
    # Wake with conditional POWER to avoid blind toggling.
    try:
        p = _run_adb(target, ["shell", "dumpsys", "power"], timeout_sec=5)
        txt = (p.stdout or b"").decode("utf-8", errors="ignore").lower() if p.returncode == 0 else ""
        if "mwakefulness=asleep" in txt or "display power: state=off" in txt:
            _run_adb(target, ["shell", "input", "keyevent", "26"], timeout_sec=5)
            time.sleep(0.10)
    except Exception:
        pass

    _run_adb(target, ["shell", "input", "keyevent", "224"], timeout_sec=5)
    _run_adb(target, ["shell", "input", "keyevent", "224"], timeout_sec=5)
    time.sleep(0.08)


def _is_android_locked(target: Device) -> bool | None:
    # Returns True/False when detectable, otherwise None.
    try:
        trust = _run_adb(target, ["shell", "dumpsys", "trust"], timeout_sec=5)
        if trust.returncode == 0:
            text = (trust.stdout or b"").decode("utf-8", errors="ignore").lower()
            if "devicelocked=1" in text or "devicelocked=true" in text:
                return True
            if "devicelocked=0" in text or "devicelocked=false" in text:
                return False
    except Exception:
        pass

    try:
        proc = _run_adb(target, ["shell", "dumpsys", "window", "policy"], timeout_sec=5)
    except Exception:
        return None
    if proc.returncode != 0:
        return None

    text = (proc.stdout or b"").decode("utf-8", errors="ignore").lower()
    locked_markers = [
        "mshowinglockscreen=true",
        "isstatusbarkeyguard=true",
        "mkeyguardshowing=true",
        "keyguardshowing=true",
    ]
    unlocked_markers = [
        "mshowinglockscreen=false",
        "isstatusbarkeyguard=false",
        "mkeyguardshowing=false",
        "keyguardshowing=false",
    ]

    for token in locked_markers:
        if token in text:
            return True
    for token in unlocked_markers:
        if token in text:
            return False
    return None


def _unlock_android_pattern(target: Device, pattern: str = "1,2,3,6,9") -> None:
    size_proc = _run_adb(target, ["shell", "wm", "size"], timeout_sec=5)
    w, h = 1080, 2400
    if size_proc.returncode == 0:
        text = (size_proc.stdout or b"").decode("utf-8", errors="ignore")
        try:
            token = text.split(":")[-1].strip().split()[0]
            w, h = [int(x) for x in token.split("x")]
        except Exception:
            pass

    digits_raw = [d.strip() for d in str(pattern).split(",") if d.strip() in {"1", "2", "3", "4", "5", "6", "7", "8", "9"}]
    digits = digits_raw[:]
    if len(digits) < 2:
        raise HTTPException(status_code=400, detail="Invalid pattern format")

    def _pos_for_profile(x_ratio: float, y_top: float, y_mid: float, y_bot: float) -> dict[str, tuple[int, int]]:
        x1, x2, x3 = int(w * (0.5 - x_ratio)), int(w * 0.5), int(w * (0.5 + x_ratio))
        y1, y2, y3 = int(h * y_top), int(h * y_mid), int(h * y_bot)
        return {
            "1": (x1, y1), "2": (x2, y1), "3": (x3, y1),
            "4": (x1, y2), "5": (x2, y2), "6": (x3, y2),
            "7": (x1, y3), "8": (x2, y3), "9": (x3, y3),
        }

    def _draw_pattern_once(pos: dict[str, tuple[int, int]]) -> bool:
        first = pos[digits[0]]
        _run_adb(target, ["shell", "input", "tap", str(first[0]), str(first[1])], timeout_sec=5)
        time.sleep(0.08)
        down = _run_adb(target, ["shell", "input", "motionevent", "DOWN", str(first[0]), str(first[1])], timeout_sec=5)
        if down.returncode == 0:
            time.sleep(0.07)
            ok = True
            for key in digits[1:]:
                x, y = pos[key]
                mv = _run_adb(target, ["shell", "input", "motionevent", "MOVE", str(x), str(y)], timeout_sec=5)
                if mv.returncode != 0:
                    ok = False
                    break
                time.sleep(0.07)
            end = pos[digits[-1]]
            _run_adb(target, ["shell", "input", "motionevent", "UP", str(end[0]), str(end[1])], timeout_sec=5)
            if ok:
                return True

        for i in range(len(digits) - 1):
            a = pos[digits[i]]
            b = pos[digits[i + 1]]
            proc = _run_adb(
                target,
                ["shell", "input", "swipe", str(a[0]), str(a[1]), str(b[0]), str(b[1]), "180"],
                timeout_sec=5,
            )
            if proc.returncode != 0:
                return False
        return True

    # Retry sequence: wake -> drag into lock credential screen -> draw pattern -> verify unlocked.
    drag_variants = [
        (0.50, 0.90, 0.50, 0.30),
        (0.62, 0.88, 0.42, 0.32),
        (0.38, 0.87, 0.58, 0.34),
        (0.52, 0.86, 0.52, 0.28),
        (0.74, 0.90, 0.30, 0.34),
        (0.28, 0.90, 0.70, 0.36),
    ]
    pattern_profiles = [
        (0.30, 0.34, 0.50, 0.66),
        (0.28, 0.32, 0.50, 0.68),
        (0.32, 0.36, 0.53, 0.70),
        (0.26, 0.30, 0.48, 0.66),
        (0.34, 0.40, 0.56, 0.72),
    ]

    last_lock_state: bool | None = None
    for i in range(len(drag_variants)):
        _wake_android_screen(target)
        _run_adb(target, ["shell", "input", "keyevent", "82"], timeout_sec=5)
        time.sleep(0.12)
        sxr, syr, exr, eyr = drag_variants[i]
        _run_adb(
            target,
            [
                "shell",
                "input",
                "swipe",
                str(int(w * sxr)),
                str(int(h * syr)),
                str(int(w * exr)),
                str(int(h * eyr)),
                "260",
            ],
            timeout_sec=5,
        )
        time.sleep(0.20)
        for p in pattern_profiles:
            pos = _pos_for_profile(*p)
            drew = _draw_pattern_once(pos)
            if not drew:
                continue
            time.sleep(0.32)
            last_lock_state = _is_android_locked(target)
            if last_lock_state is False:
                return

    detail = "unlock not verified"
    if last_lock_state is True:
        detail = "device still locked after retries"
    raise HTTPException(status_code=503, detail=detail)


def _capture_android_png(target: Device) -> bytes | None:
    try:
        proc = _run_adb(target, ["exec-out", "screencap", "-p"], timeout_sec=LIVE_SHOT_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        return None
    if proc.returncode != 0:
        return None
    png = proc.stdout or b""
    sig_index = png.find(PNG_SIGNATURE)
    if sig_index > 0:
        png = png[sig_index:]
    if len(png) < 100 or not png.startswith(PNG_SIGNATURE):
        return None
    return png


def _live_shot_worker(device_id: str) -> None:
    while True:
        data = orchestrator.get_dashboard_data()
        target = next((d for d in data.get("devices", []) if d.device_id == device_id and d.platform == "android"), None)
        if target is None:
            with LIVE_SHOT_LOCK:
                LIVE_SHOT_WORKERS.discard(device_id)
            return

        png = _capture_android_png(target)
        if png:
            with LIVE_SHOT_LOCK:
                LIVE_SHOT_CACHE[device_id] = png
                LIVE_SHOT_CACHE_TS[device_id] = time.monotonic()

        time.sleep(LIVE_SHOT_BG_INTERVAL_SEC)


def _ensure_live_shot_worker(device_id: str) -> None:
    with LIVE_SHOT_LOCK:
        if device_id in LIVE_SHOT_WORKERS:
            return
        LIVE_SHOT_WORKERS.add(device_id)
    threading.Thread(target=_live_shot_worker, args=(device_id,), daemon=True).start()


def _resolve_adb_executable() -> str:
    # Try explicit env-based SDK first, then PATH, then common Windows SDK path.
    sdk_candidates = []
    if os.getenv("ANDROID_SDK_ROOT"):
        sdk_candidates.append(Path(os.getenv("ANDROID_SDK_ROOT", "")) / "platform-tools" / "adb.exe")
    if os.getenv("ANDROID_HOME"):
        sdk_candidates.append(Path(os.getenv("ANDROID_HOME", "")) / "platform-tools" / "adb.exe")

    local_app_data = os.getenv("LOCALAPPDATA", "")
    if local_app_data:
        sdk_candidates.append(Path(local_app_data) / "Android" / "Sdk" / "platform-tools" / "adb.exe")

    for p in sdk_candidates:
        try:
            if p and p.exists():
                return str(p)
        except Exception:
            pass

    adb_cmd = shutil.which("adb")
    if adb_cmd:
        return adb_cmd
    return "adb"


def _sync_android_devices_from_adb(force: bool = False) -> None:
    global ADB_LAST_SYNC_TS, ADB_LAST_USED_PATH, ADB_LAST_ERROR
    now = time.monotonic()
    if not force and (now - ADB_LAST_SYNC_TS) < ADB_SYNC_MIN_INTERVAL_SEC:
        return

    with ADB_SYNC_LOCK:
        now2 = time.monotonic()
        if not force and (now2 - ADB_LAST_SYNC_TS) < ADB_SYNC_MIN_INTERVAL_SEC:
            return

        adb_exe = _resolve_adb_executable()
        ADB_LAST_USED_PATH = adb_exe
        try:
            proc = subprocess.run([adb_exe, "devices", "-l"], capture_output=True, timeout=4, check=False)
        except Exception as e:
            ADB_LAST_ERROR = f"adb exec error: {e}"
            ADB_LAST_SYNC_TS = time.monotonic()
            return

        if proc.returncode != 0:
            err = (proc.stderr or b"").decode("utf-8", errors="ignore")[:300]
            ADB_LAST_ERROR = f"adb returncode={proc.returncode} {err}"
            ADB_LAST_SYNC_TS = time.monotonic()
            return
        ADB_LAST_ERROR = ""

        lines = (proc.stdout or b"").decode("utf-8", errors="ignore").splitlines()
        config_by_udid = _build_android_config_by_udid()
        snapshot = orchestrator.get_dashboard_data()
        existing = snapshot.get("devices", [])
        by_udid = {str(d.udid): d for d in existing}
        used_ids = {str(d.device_id) for d in existing}
        connected_serials: set[str] = set()

        for raw in lines:
            line = raw.strip()
            if not line or line.startswith("List of devices attached"):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            serial = parts[0].strip()
            state = parts[1].strip().lower()
            if state != "device":
                continue
            connected_serials.add(serial)

            known = by_udid.get(serial)
            if known:
                remembered_name = _get_remembered_name("android", serial, known.device_id)
                if remembered_name and str(known.name) != remembered_name:
                    orchestrator.rename_device(known.device_id, remembered_name)
                orchestrator.heartbeat(known.device_id)
                continue

            mapped = config_by_udid.get(serial, {})
            mapped_id = str(mapped.get("deviceId", "")).strip()
            mapped_name = str(mapped.get("name", "")).strip()

            appium_url = ""
            if mapped.get("appiumUrl"):
                appium_url = str(mapped.get("appiumUrl")).strip()
            elif mapped.get("appiumPort"):
                appium_url = f"http://127.0.0.1:{int(mapped.get('appiumPort'))}"

            base_id = mapped_id or f"adb_{''.join(ch for ch in serial.lower() if ch.isalnum())[:8]}"
            new_id = base_id
            n = 2
            while new_id in used_ids:
                new_id = f"{base_id}_{n}"
                n += 1
            used_ids.add(new_id)

            remembered_name = _get_remembered_name("android", serial, mapped_id or base_id)
            parsed_model = ""
            if "model:" in line:
                try:
                    parsed_model = line.split("model:", 1)[1].split()[0].strip()
                except Exception:
                    pass
            model_name = remembered_name or mapped_name or parsed_model or serial

            orchestrator.register_device(
                Device(
                    device_id=new_id,
                    name=model_name,
                    platform="android",
                    appium_url=appium_url or "http://127.0.0.1:4723",
                    udid=serial,
                )
            )
            _remember_device_profile("android", serial, new_id, model_name)

        # Remove Android devices that are no longer connected at adb level.
        for d in existing:
            if str(d.platform).lower() != "android":
                continue
            if str(d.udid) in connected_serials:
                continue
            orchestrator.unregister_device(d.device_id)

        # Deduplicate same connected Android device registered with multiple IDs.
        latest = orchestrator.get_dashboard_data().get("devices", [])
        by_udid_live: dict[str, list] = {}
        for d in latest:
            if str(d.platform).lower() != "android":
                continue
            by_udid_live.setdefault(str(d.udid), []).append(d)

        for udid, items in by_udid_live.items():
            if len(items) <= 1:
                continue

            mapped = config_by_udid.get(udid, {})
            mapped_id = str(mapped.get("deviceId", "")).strip()
            keep_id = ""
            if mapped_id and any(str(x.device_id) == mapped_id for x in items):
                keep_id = mapped_id
            else:
                # Prefer non-adb generated IDs.
                non_adb = [x for x in items if not str(x.device_id).startswith("adb_")]
                keep_id = str((non_adb[0] if non_adb else items[0]).device_id)

            for x in items:
                if str(x.device_id) == keep_id:
                    continue
                orchestrator.unregister_device(str(x.device_id))

        ADB_LAST_SYNC_TS = time.monotonic()

    _sync_ios_devices_from_config()


@app.get("/api/share-info")
def share_info(request: Request):
    host = request.url.hostname or "127.0.0.1"
    port = request.url.port or (443 if request.url.scheme == "https" else 80)
    scheme = request.url.scheme or "http"

    local_url = f"http://127.0.0.1:{port}"
    lan_ip = _detect_lan_ip()
    lan_url = f"http://{lan_ip}:{port}" if lan_ip else ""

    public_base = (os.getenv("PUBLIC_BASE_URL") or "").strip() or DEFAULT_PUBLIC_SHARE_URL
    public_url = f"{public_base.rstrip('/')}/" if public_base else ""

    current_base = f"{scheme}://{host}:{port}" if port not in (80, 443) else f"{scheme}://{host}"
    share_url = public_url or lan_url or current_base

    is_localhost_request = host in ("127.0.0.1", "localhost")
    share_mode = "public" if public_url else ("lan" if lan_url else "local")
    note = "고정 외부 URL을 우선 공유합니다. 환경변수 PUBLIC_BASE_URL 로 다른 URL 지정 가능."
    if is_localhost_request:
      note = "현재 localhost로 접속 중입니다. 다른 사람이 보려면 서버를 0.0.0.0으로 실행하고 LAN URL을 공유하세요."

    launch_shared_cmd = f"python -m uvicorn server.app.main:app --host 0.0.0.0 --port {port}"
    firewall_cmd = (
        f"netsh advfirewall firewall add rule name=\"CCI-Automation-{port}\" "
        f"dir=in action=allow protocol=TCP localport={port}"
    )

    return {
        "ok": True,
        "share_mode": share_mode,
        "share_url": share_url,
        "local_url": local_url,
        "lan_url": lan_url,
        "public_url": public_url,
        "launch_shared_cmd": launch_shared_cmd,
        "firewall_cmd": firewall_cmd,
        "note": note,
    }


@app.get("/api/devices/validate")
def validate_devices(stale_sec: int = 15, live_view_sec: int = 45):
    _sync_android_devices_from_adb()
    data = orchestrator.get_dashboard_data()
    now = datetime.utcnow()

    results = []
    android_ready = 0
    ios_ready = 0

    state_map = data.get("device_states", {})
    for d in data.get("devices", []):
        age_sec = int((now - d.last_seen).total_seconds())
        online = age_sec <= max(3, stale_sec)

        state = state_map.get(d.device_id, {})
        has_snapshot = bool(state.get("snapshot_path"))
        state_time_raw = str(state.get("time", ""))
        state_age_sec = 10**9
        if state_time_raw:
            try:
                state_time = datetime.fromisoformat(state_time_raw)
                state_age_sec = int((now - state_time).total_seconds())
            except Exception:
                state_age_sec = 10**9

        live_view_ready = has_snapshot and state_age_sec <= max(5, live_view_sec)
        runner_ready = online
        if runner_ready:
            if d.platform == "android":
                android_ready += 1
            if d.platform == "ios":
                ios_ready += 1

        results.append(
            {
                "device_id": d.device_id,
                "name": d.name,
                "platform": d.platform,
                "udid": d.udid,
                "last_seen_age_sec": age_sec,
                "online": online,
                "runner_ready": runner_ready,
                "live_view_ready": live_view_ready,
                "snapshot_path": state.get("snapshot_path", ""),
            }
        )

    return {
        "ok": True,
        "checked_at": now.isoformat(timespec="seconds"),
        "devices": results,
        "summary": {
            "connected": len(results),
            "android_ready": android_ready,
            "ios_ready": ios_ready,
            "ready_for_android_run": android_ready > 0,
            "ready_for_ios_run": ios_ready > 0,
        },
        "adb_sync": {
            "last_used_path": ADB_LAST_USED_PATH,
            "last_error": ADB_LAST_ERROR,
            "last_sync_monotonic": ADB_LAST_SYNC_TS,
        },
    }


@app.post("/api/devices/resync")
def resync_devices():
    _sync_android_devices_from_adb(force=True)
    data = orchestrator.get_dashboard_data()
    return {
        "ok": True,
        "device_count": len(data.get("devices", [])),
        "device_ids": [d.device_id for d in data.get("devices", [])],
        "adb_sync": {
            "last_used_path": ADB_LAST_USED_PATH,
            "last_error": ADB_LAST_ERROR,
        },
    }


def _run_upload_job(job_id: str, source_file: Path) -> None:
    global LAST_UPLOADED_EXCEL, LAST_CONVERTED_EXCEL, LATEST_EXCEL_HEADERS, LATEST_EXCEL_ROWS
    try:
        with UPLOAD_LOCK:
            UPLOAD_JOBS[job_id]["status"] = "converting"

        LAST_UPLOADED_EXCEL = source_file
        converted = UPLOAD_DIR / f"converted_{source_file.stem}.xlsx"

        try:
            rows, unresolved, note_count, executable_count = convert_control_excel_to_structured(
                source_excel=str(source_file),
                output_excel=str(converted),
                rule_file=str(RULE_FILE),
            )
        except Exception:
            rows, unresolved, note_count = convert_matrix_excel_to_structured(
                source_excel=str(source_file),
                output_excel=str(converted),
                rule_file=str(RULE_FILE),
            )
            executable_count = rows - note_count

        LAST_CONVERTED_EXCEL = converted
        testcases = parse_excel_to_testcases(str(converted))
        testcase_count = orchestrator.set_testcases(testcases)

        headers, preview_rows = parse_control_sheet_full_rows(str(source_file), limit=1200)
        LATEST_EXCEL_HEADERS = headers
        LATEST_EXCEL_ROWS = preview_rows

        auto_run = {
            "started": False,
            "run_id": "",
            "task_count": 0,
            "detail": "",
        }
        try:
            run = orchestrator.create_run(repeat_count=1, target_platforms=["android"])
            auto_run.update(
                {
                    "started": True,
                    "run_id": run.run_id,
                    "task_count": len(run.task_ids),
                    "detail": "uploaded excel auto-run started on android",
                }
            )
        except ValueError as run_error:
            auto_run["detail"] = str(run_error)
        except Exception as run_error:
            auto_run["detail"] = f"auto-run failed: {run_error}"

        with UPLOAD_LOCK:
            UPLOAD_JOBS[job_id].update(
                {
                    "status": "completed",
                    "testcase_count": testcase_count,
                    "rows": rows,
                    "unresolved": unresolved,
                    "note_count": note_count,
                    "executable_count": executable_count,
                    "source_file": source_file.name,
                    "converted_file": converted.name,
                    "download_link": f"/uploads/{converted.name}",
                    "auto_run": auto_run,
                }
            )
    except Exception as e:
        with UPLOAD_LOCK:
            UPLOAD_JOBS[job_id].update({"status": "failed", "error": str(e)})


@app.get("/api/testcases/preview")
def testcase_preview(limit: int = 200):
    return {"rows": orchestrator.get_testcase_preview(limit=limit)}


@app.post("/api/testcases/load-builtin")
def load_builtin_cases():
    testcases = load_builtin_testcases()
    count = orchestrator.set_testcases(testcases)
    return {"ok": True, "source": "builtin", "testcase_count": count}


@app.post("/api/demo/quick-run")
def quick_demo_run(repeat_count: int = Form(1), run_android: bool = Form(True), run_ios: bool = Form(False)):
    testcases = load_builtin_testcases()
    orchestrator.set_testcases(testcases)

    platforms = []
    if run_android:
        platforms.append("android")
    if run_ios:
        platforms.append("ios")
    if not platforms:
        raise HTTPException(status_code=400, detail="Select at least one platform")

    try:
        run = orchestrator.create_run(repeat_count=repeat_count, target_platforms=platforms)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"ok": True, "mode": "quick-demo", "run_id": run.run_id, "task_count": len(run.task_ids)}


@app.post("/api/devices/register")
def register_device(
    device_id: str = Form(...),
    name: str = Form(...),
    platform: str = Form(...),
    appium_url: str = Form(...),
    udid: str = Form(...),
):
    device = Device(
        device_id=device_id,
        name=name,
        platform=platform.lower(),
        appium_url=appium_url,
        udid=udid,
    )
    orchestrator.register_device(device)
    _remember_device_profile(device.platform, device.udid, device.device_id, device.name)
    return {"ok": True, "device": device}


@app.post("/api/devices/{device_id}/rename")
def rename_device(device_id: str, name: str = Form(...)):
    data = orchestrator.get_dashboard_data()
    target = next((d for d in data.get("devices", []) if d.device_id == device_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Device not found")

    ok = orchestrator.rename_device(device_id, name)
    if not ok:
        raise HTTPException(status_code=404, detail="Device not found")
    _remember_device_profile(target.platform, target.udid, target.device_id, name)
    return {"ok": True, "device_id": device_id, "name": name}


@app.post("/api/compare/start")
def compare_start(device_ids: str = Form(""), cross_platform: bool = Form(True)):
    ids = [x.strip() for x in device_ids.split(",") if x.strip()]
    if not ids:
        # If not specified, default to all connected devices.
        dash = orchestrator.get_dashboard_data()
        ids = [d.device_id for d in dash["devices"]]
    try:
        cfg = orchestrator.start_compare(ids, cross_platform=cross_platform)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "compare": cfg}


@app.post("/api/compare/stop")
def compare_stop():
    cfg = orchestrator.stop_compare()
    return {"ok": True, "compare": cfg}


@app.post("/api/upload-testcases")
async def upload_testcases(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an Excel file")

    saved_path = UPLOAD_DIR / file.filename
    with saved_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    job_id = str(uuid.uuid4())
    with UPLOAD_LOCK:
        UPLOAD_JOBS[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "source_file": file.filename,
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
        }

    threading.Thread(target=_run_upload_job, args=(job_id, saved_path), daemon=True).start()
    return {"ok": True, "job_id": job_id, "status": "queued", "file": file.filename}


@app.get("/api/upload/source-status")
def upload_source_status(request: Request):
    _require_admin(request)
    defect_type, defect_source = _current_defect_source_info()
    return {
        "ok": True,
        "defect_raw": {
            "source_type": defect_type,
            "source": defect_source,
            "uploaded_at": _uploaded_file_datetime_text(UPLOADED_DEFECT_RAW_FILE),
            "exists": UPLOADED_DEFECT_RAW_FILE.exists(),
        },
        "full_tc": {
            "source_type": "uploaded_excel" if UPLOADED_FULL_TC_FILE.exists() else "apps_script",
            "source": UPLOADED_FULL_TC_FILE.name if UPLOADED_FULL_TC_FILE.exists() else FULL_TC_APPS_SCRIPT_URL,
            "uploaded_at": _uploaded_file_datetime_text(UPLOADED_FULL_TC_FILE),
            "exists": UPLOADED_FULL_TC_FILE.exists(),
        },
    }


@app.post("/api/upload/defectlist-raw")
async def upload_defectlist_raw_file(request: Request, file: UploadFile = File(...)):
    admin_user = _require_admin(request)
    filename = str(file.filename or "").strip()
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail=".xlsx 파일만 업로드할 수 있습니다.")

    temp_name = f"defectlist_raw_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    temp_path = UPLOAD_DIR / temp_name
    with temp_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    # 이전 파일 백업 후 새 파일로 교체 (이전 데이터 완전 삭제)
    shutil.copyfile(str(temp_path), str(UPLOADED_DEFECT_RAW_FILE))

    # 모든 관련 캐시 초기화 (이전 데이터 완전 제거)
    _reset_defect_source_caches()
    # DefectList 편집기용 캐시도 초기화
    with DEFECTLIST_ROWS_CACHE_LOCK:
        global DEFECTLIST_ROWS_CACHE_TS, DEFECTLIST_ROWS_CACHE_DATA
        DEFECTLIST_ROWS_CACHE_TS = 0.0
        DEFECTLIST_ROWS_CACHE_DATA = {}
    
    # 새 데이터 강제 로드
    defect = _get_cached_google_defect_stats(force=True)
    company = _get_cached_company_defect_stats(force=True)
    raw = _get_cached_raw_defect_issue_stats(force=True)

    defect_rows = int(defect.get("total_rows", 0) or 0)
    raw_rows = int(raw.get("total_rows", 0) or 0)

    _append_defect_raw_upload_history(
        uploader_name=str(admin_user.get("name", "") or admin_user.get("username", "") or ""),
        uploader_email=str(admin_user.get("email", "") or ""),
        original_filename=filename,
        defect_total_rows=defect_rows,
        raw_issue_total_rows=raw_rows,
    )

    return {
        "ok": True,
        "uploaded": filename,
        "stored_as": UPLOADED_DEFECT_RAW_FILE.name,
        "uploaded_at": _uploaded_file_datetime_text(UPLOADED_DEFECT_RAW_FILE),
        "defect_total_rows": defect_rows,
        "company_total_rows": int(company.get("total_rows", 0) or 0),
        "raw_issue_total_rows": raw_rows,
        "message": "이전 데이터 삭제 후 새로운 데이터로 완전 갱신되었습니다.",
    }


@app.get("/api/upload/defectlist-raw/history")
def upload_defectlist_raw_history(request: Request):
    _require_admin(request)
    return {
        "ok": True,
        "history": _load_defect_raw_upload_history(),
    }


@app.post("/api/upload/full-tc")
async def upload_full_tc_file(request: Request, file: UploadFile = File(...)):
    _require_admin(request)
    filename = str(file.filename or "").strip()
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail=".xlsx 파일만 업로드할 수 있습니다.")

    temp_name = f"full_tc_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    temp_path = UPLOAD_DIR / temp_name
    with temp_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    shutil.copyfile(str(temp_path), str(UPLOADED_FULL_TC_FILE))

    _reset_full_tc_caches()
    sheets_data = _get_full_tc_sheet_list(force=True)
    sheets = list(sheets_data.get("sheets") or [])

    return {
        "ok": True,
        "uploaded": filename,
        "stored_as": UPLOADED_FULL_TC_FILE.name,
        "uploaded_at": _uploaded_file_datetime_text(UPLOADED_FULL_TC_FILE),
        "sheet_count": len(sheets),
        "sheets": sheets[:60],
    }


@app.get("/api/upload-jobs/{job_id}")
def upload_job_status(job_id: str):
    with UPLOAD_LOCK:
        job = UPLOAD_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/excel/latest-preview")
def latest_excel_preview(limit: int = 300):
    return {
        "headers": LATEST_EXCEL_HEADERS,
        "rows": LATEST_EXCEL_ROWS[: max(1, limit)],
        "total_rows": len(LATEST_EXCEL_ROWS),
        "source": LAST_UPLOADED_EXCEL.name if LAST_UPLOADED_EXCEL else "",
    }


def _load_latest_converted_df() -> pd.DataFrame:
    if LAST_CONVERTED_EXCEL is None or not LAST_CONVERTED_EXCEL.exists():
        raise HTTPException(status_code=400, detail="No converted excel found. Convert first.")
    return pd.read_excel(str(LAST_CONVERTED_EXCEL))


@app.get("/api/converted/unresolved")
def converted_unresolved(limit: int = 300):
    df = _load_latest_converted_df()
    if "target" not in df.columns:
        return {"rows": [], "total": 0}

    unresolved = df[df["target"].astype(str).str.startswith("TODO_", na=False)]
    unresolved = unresolved.head(max(1, limit))
    rows = unresolved.fillna("").to_dict(orient="records")
    return {
        "rows": rows,
        "total": int(len(df[df["target"].astype(str).str.startswith("TODO_", na=False)])),
        "source": LAST_CONVERTED_EXCEL.name if LAST_CONVERTED_EXCEL else "",
    }


@app.get("/api/rules/suggest")
def suggest_rules(top_n: int = 30):
    df = _load_latest_converted_df()
    required_cols = ["action", "target", "source_row"]
    for col in required_cols:
        if col not in df.columns:
            return {"rules": []}

    unresolved = df[df["target"].astype(str).str.startswith("TODO_", na=False)].fillna("")
    if unresolved.empty:
        return {"rules": []}

    # Use target text/value metadata to extract frequent Korean/English keywords as draft rule keys.
    phrase_counter: Counter = Counter()
    for _, row in unresolved.iterrows():
        txt = f"{row.get('target', '')} {row.get('value', '')}"
        for token in str(txt).replace("\n", " ").split(" "):
            t = token.strip().lower()
            if len(t) < 2:
                continue
            if t.startswith("todo_"):
                continue
            phrase_counter[t] += 1

    rules = []
    action_default = {
        "TODO_NAVIGATION_TARGET": "click",
        "TODO_ASSERT_TARGET": "assert_contains",
        "TODO_TARGET": "click",
    }
    grouped = unresolved.groupby("target")
    for target_key, g in grouped:
        action = action_default.get(str(target_key), "click")
        sample_value = str(g.iloc[0].get("value", ""))[:120]
        rules.append(
            {
                "contains": "",
                "action": action,
                "target": str(target_key).replace("TODO_", "").lower(),
                "locator": "accessibility id",
                "value": sample_value,
                "todo_key": str(target_key),
                "count": int(len(g)),
            }
        )

    rules = sorted(rules, key=lambda x: x["count"], reverse=True)
    top_tokens = [{"token": k, "count": v} for k, v in phrase_counter.most_common(max(1, top_n))]
    return {"rules": rules[:top_n], "top_tokens": top_tokens}


@app.post("/api/load-default-testcases")
def load_default_testcases():
    global LAST_UPLOADED_EXCEL
    if not DEFAULT_EXCEL.exists():
        raise HTTPException(status_code=404, detail=f"Default excel not found: {DEFAULT_EXCEL}")

    LAST_UPLOADED_EXCEL = DEFAULT_EXCEL
    testcases = parse_excel_to_testcases(str(DEFAULT_EXCEL))
    count = orchestrator.set_testcases(testcases)
    return {"ok": True, "testcase_count": count, "file": DEFAULT_EXCEL.name}


@app.post("/api/convert-default-excel")
def convert_default_excel():
    global LAST_CONVERTED_EXCEL, LATEST_EXCEL_HEADERS, LATEST_EXCEL_ROWS
    if not DEFAULT_EXCEL.exists():
        raise HTTPException(status_code=404, detail=f"Default excel not found: {DEFAULT_EXCEL}")

    converted = UPLOAD_DIR / f"converted_{DEFAULT_EXCEL.stem}.xlsx"
    try:
        rows, unresolved, note_count, executable_count = convert_control_excel_to_structured(
            source_excel=str(DEFAULT_EXCEL),
            output_excel=str(converted),
            rule_file=str(RULE_FILE),
        )
    except Exception:
        rows, unresolved, note_count = convert_matrix_excel_to_structured(
            source_excel=str(DEFAULT_EXCEL),
            output_excel=str(converted),
            rule_file=str(RULE_FILE),
        )
        executable_count = rows - note_count

    testcases = parse_excel_to_testcases(str(converted))
    count = orchestrator.set_testcases(testcases)
    LAST_CONVERTED_EXCEL = converted
    headers, preview_rows = parse_control_sheet_full_rows(str(DEFAULT_EXCEL), limit=1200)
    LATEST_EXCEL_HEADERS = headers
    LATEST_EXCEL_ROWS = preview_rows
    return {
        "ok": True,
        "source": DEFAULT_EXCEL.name,
        "converted": converted.name,
        "rows": rows,
        "unresolved": unresolved,
        "note_count": note_count,
        "executable_count": executable_count,
        "testcase_count": count,
    }


@app.post("/api/convert-last-upload")
def convert_last_upload():
    global LAST_CONVERTED_EXCEL, LATEST_EXCEL_HEADERS, LATEST_EXCEL_ROWS
    if LAST_UPLOADED_EXCEL is None or not LAST_UPLOADED_EXCEL.exists():
        raise HTTPException(status_code=400, detail="No uploaded excel found. Upload file first.")

    converted = UPLOAD_DIR / f"converted_{LAST_UPLOADED_EXCEL.stem}.xlsx"
    try:
        rows, unresolved, note_count, executable_count = convert_control_excel_to_structured(
            source_excel=str(LAST_UPLOADED_EXCEL),
            output_excel=str(converted),
            rule_file=str(RULE_FILE),
        )
    except Exception:
        rows, unresolved, note_count = convert_matrix_excel_to_structured(
            source_excel=str(LAST_UPLOADED_EXCEL),
            output_excel=str(converted),
            rule_file=str(RULE_FILE),
        )
        executable_count = rows - note_count

    testcases = parse_excel_to_testcases(str(converted))
    count = orchestrator.set_testcases(testcases)
    LAST_CONVERTED_EXCEL = converted
    headers, preview_rows = parse_control_sheet_full_rows(str(LAST_UPLOADED_EXCEL), limit=1200)
    LATEST_EXCEL_HEADERS = headers
    LATEST_EXCEL_ROWS = preview_rows
    return {
        "ok": True,
        "source": LAST_UPLOADED_EXCEL.name,
        "converted": converted.name,
        "rows": rows,
        "unresolved": unresolved,
        "note_count": note_count,
        "executable_count": executable_count,
        "testcase_count": count,
    }


def _status_label(status: str | None) -> str:
    mapping = {
        "passed": "PASS",
        "failed": "FAIL",
        "nt": "",
        "running": "",
        "pending": "",
        None: "",
    }
    return mapping.get(status, "N/T")


def _autofit_and_wrap_worksheet(ws, min_col: int, max_col: int, min_row: int, max_row: int) -> None:
    # Keep line breaks visible and approximate Excel auto-fit behavior.
    for row in range(min_row, max_row + 1):
        max_lines = 1
        max_len = 0
        for col in range(min_col, max_col + 1):
            cell = ws.cell(row=row, column=col)
            value = "" if cell.value is None else str(cell.value)
            line_count = value.count("\n") + 1
            longest_line = max((len(x) for x in value.split("\n")), default=0)
            max_lines = max(max_lines, line_count)
            max_len = max(max_len, longest_line)
            cell.alignment = Alignment(wrap_text=True, vertical="top")

        # Approximate row height from number of wrapped lines.
        ws.row_dimensions[row].height = max(18, min(18 * max_lines, 220))

    # Approximate column width from maximum text length in each column.
    for col in range(min_col, max_col + 1):
        col_letter = get_column_letter(col)
        longest = 0
        for row in range(min_row, max_row + 1):
            value = ws.cell(row=row, column=col).value
            txt = "" if value is None else str(value)
            longest = max(longest, max((len(x) for x in txt.split("\n")), default=0))
        ws.column_dimensions[col_letter].width = max(10, min(longest + 2, 60))


@app.post("/api/results/export-default")
def export_default_results():
    if not DEFAULT_EXCEL.exists():
        raise HTTPException(status_code=404, detail=f"Default excel not found: {DEFAULT_EXCEL}")

    run_map = orchestrator.latest_run_result_map()
    if not run_map:
        raise HTTPException(status_code=400, detail="No run result found. Execute tests first.")

    source = LAST_UPLOADED_EXCEL if LAST_UPLOADED_EXCEL and LAST_UPLOADED_EXCEL.exists() else DEFAULT_EXCEL
    output = EXPORT_DIR / f"result_{source.stem}.xlsx"
    shutil.copyfile(source, output)

    wb = load_workbook(output)
    if CONTROL_SHEET_NAME not in wb.sheetnames:
        raise HTTPException(status_code=400, detail="Control sheet not found in excel")
    ws = wb[CONTROL_SHEET_NAME]

    # Optional reason headers.
    if not ws.cell(row=20, column=18).value:
        ws.cell(row=20, column=18).value = "Android Reason"
    if not ws.cell(row=20, column=19).value:
        ws.cell(row=20, column=19).value = "iOS Reason"

    rows = parse_control_sheet_rows(str(source))
    updated = 0
    for row in rows:
        excel_row = int(row["excel_row"])
        tc_id = row["tc_id"]
        if not tc_id:
            continue
        item = run_map.get(tc_id)
        if not item:
            continue

        a = item.get("android")
        i = item.get("ios")
        a_label = _status_label(a["status"] if a else None)
        i_label = _status_label(i["status"] if i else None)

        overall = ""
        labels = [x for x in [a_label, i_label] if x]
        if labels:
            if "FAIL" in labels:
                overall = "FAIL"
            elif all(v == "PASS" for v in labels):
                overall = "PASS"

        ws.cell(row=excel_row, column=15).value = overall  # O: two OS overall
        ws.cell(row=excel_row, column=16).value = a_label  # P: Android
        ws.cell(row=excel_row, column=17).value = i_label  # Q: iOS
        ws.cell(row=excel_row, column=18).value = (a or {}).get("issue", "") or ("동작 불가" if a and a_label == "" else "")
        ws.cell(row=excel_row, column=19).value = (i or {}).get("issue", "") or ("동작 불가" if i and i_label == "" else "")
        updated += 1

    # A~S range formatting (includes original columns and result/reason columns)
    _autofit_and_wrap_worksheet(
        ws=ws,
        min_col=1,
        max_col=19,
        min_row=20,
        max_row=max(20, ws.max_row),
    )

    wb.save(output)
    return {
        "ok": True,
        "file": output.name,
        "updated_rows": updated,
        "download_link": f"/exports/{output.name}",
    }


@app.post("/api/runs/start")
def start_run(repeat_count: int = Form(1), run_android: bool = Form(True), run_ios: bool = Form(True)):
    platforms = []
    if run_android:
        platforms.append("android")
    if run_ios:
        platforms.append("ios")
    if not platforms:
        raise HTTPException(status_code=400, detail="Select at least one platform")

    try:
        run = orchestrator.create_run(repeat_count=repeat_count, target_platforms=platforms)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"ok": True, "run_id": run.run_id, "task_count": len(run.task_ids)}


@app.post("/api/runs/start-latest-upload")
def start_latest_upload_run(
    repeat_count: int = Form(1),
    run_android: bool = Form(True),
    run_ios: bool = Form(False),
):
    if LAST_CONVERTED_EXCEL is None or not LAST_CONVERTED_EXCEL.exists():
        raise HTTPException(status_code=400, detail="No converted uploaded excel found. Upload/convert first.")

    # Reload latest converted file to guarantee live monitor runs the uploaded testcase set.
    testcases = parse_excel_to_testcases(str(LAST_CONVERTED_EXCEL))
    orchestrator.set_testcases(testcases)

    platforms = []
    if run_android:
        platforms.append("android")
    if run_ios:
        platforms.append("ios")
    if not platforms:
        raise HTTPException(status_code=400, detail="Select at least one platform")

    try:
        run = orchestrator.create_run(repeat_count=repeat_count, target_platforms=platforms)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "ok": True,
        "source": LAST_CONVERTED_EXCEL.name,
        "run_id": run.run_id,
        "task_count": len(run.task_ids),
    }


@app.get("/api/agents/{device_id}/next-task")
def next_task(device_id: str):
    task = orchestrator.next_task_for_device(device_id)
    if not task:
        return JSONResponse({"has_task": False})

    return {
        "has_task": True,
        "task": {
            "task_id": task.task_id,
            "run_id": task.run_id,
            "testcase_id": task.testcase_id,
            "iteration": task.iteration,
            "steps": [
                {
                    "step_no": s.step_no,
                    "action": s.action,
                    "target": s.target,
                    "value": s.value,
                    "locator": s.locator,
                    "timeout_sec": s.timeout_sec,
                    "retry_count": s.retry_count,
                }
                for s in task.steps
            ],
        },
    }


@app.post("/api/agents/{device_id}/task-result")
def task_result(
    device_id: str,
    task_id: str = Form(...),
    status: str = Form(...),
    issue: str = Form(""),
    screenshot_path: str = Form(""),
):
    orchestrator.heartbeat(device_id)
    orchestrator.complete_task(
        task_id=task_id,
        status=status.lower(),
        issue=issue,
        screenshot_path=screenshot_path or None,
    )
    return {"ok": True}


@app.post("/api/agents/{device_id}/state")
def agent_state(device_id: str, state_hash: str = Form(""), snapshot_path: str = Form("")):
    if not state_hash:
        return {"ok": False, "detail": "state_hash is empty"}
    orchestrator.update_device_state(device_id=device_id, state_hash=state_hash, snapshot_path=snapshot_path)
    return {"ok": True}
