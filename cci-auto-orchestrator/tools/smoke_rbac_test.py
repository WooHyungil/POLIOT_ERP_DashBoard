import json
import time
import urllib.error
import urllib.parse
import urllib.request
import http.cookiejar

BASE = "http://127.0.0.1:8010"
ADMIN_EMAIL = "sue@poliot.co.kr"
ADMIN_PASS = "Poliot12!@"
USER_EMAIL = f"smoke.user.{int(time.time())}@example.com"
USER_PASS = "SmokeUser12!"


def make_client():
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    return opener


def post_form(opener, path, data):
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=encoded, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with opener.open(req, timeout=20) as r:
            return r.getcode(), r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def get(opener, path):
    req = urllib.request.Request(BASE + path, method="GET")
    try:
        with opener.open(req, timeout=20) as r:
            return r.getcode(), r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


admin = make_client()
user = make_client()

admin_login_status, _ = post_form(admin, "/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASS, "next": "/"})
admin_me_status, admin_me_body = get(admin, "/api/auth/me")
admin_role = None
if admin_me_status == 200:
    admin_role = json.loads(admin_me_body).get("user", {}).get("role")
admin_manage_status, _ = get(admin, "/manage")
admin_api_status, _ = get(admin, "/api/admin/employees")

register_status, _ = post_form(user, "/auth/register", {"email": USER_EMAIL, "password": USER_PASS, "name": "Smoke User", "next": "/"})
user_me_status, user_me_body = get(user, "/api/auth/me")
user_role = None
if user_me_status == 200:
    user_role = json.loads(user_me_body).get("user", {}).get("role")
user_manage_status, _ = get(user, "/manage")
user_api_status, _ = get(user, "/api/admin/employees")

print(f"ADMIN_LOGIN={admin_login_status}")
print(f"ADMIN_ME={admin_me_status}")
print(f"ADMIN_ROLE={admin_role}")
print(f"ADMIN_MANAGE={admin_manage_status}")
print(f"ADMIN_API={admin_api_status}")
print(f"REGISTER={register_status}")
print(f"USER_EMAIL={USER_EMAIL}")
print(f"USER_ME={user_me_status}")
print(f"USER_ROLE={user_role}")
print(f"USER_MANAGE={user_manage_status}")
print(f"USER_API={user_api_status}")
