#!/usr/bin/env python3
"""Phase 2 (users, roles & permissions) end-to-end verification.

Proves the access model works from every direction:

   1. access control      — the register is administrator-only
   2. register            — search, every filter, sorting and pagination
   3. provisioning        — a new login, its credentials, email and activation
   4. account lifecycle   — detail, edit, status, lockout, sessions, resets
   5. portal binding      — linking a login to an employer/auditor/employee
   6. RBAC enforcement    — a role without a permission gets 403 even by URL
   7. roles               — CRUD, guard rails, clone, members, delete rules
   8. permission matrix   — read, bulk save, defaults, super-admin protection
   9. screens             — all nine administration pages render
  10. clean-up            — fixtures removed

Usage:  python3 scripts/verify-users.py [base_url]
Assumes migrations + seeds are loaded and the server is running.
"""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")
ADMIN = (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026"))
EMPLOYER = ("employer.test@complianceos.local", "Employer@2026")
STAMP = datetime.now().strftime("%m%d%H%M%S")

passed = 0
failed = 0
failures = []


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        failures.append(f"{name} — {detail}")
        print(f"  ✗ {name} {('— ' + str(detail)) if detail else ''}")


class Session:
    """Cookie jar + CSRF, exactly like the browser panel calls."""

    def __init__(self, creds=None):
        self.creds = creds
        self.cookies = {}
        self.user = None
        self.redirect_to = None

    def _jar(self):
        return "; ".join(f"{k}={v}" for k, v in self.cookies.items())

    def request(self, method, path, body=None, raw=False, _retry=True):
        status, payload = self._send(method, path, body, raw)
        # A rotated CSRF token or an expired jar shows up as CSRF_FAILED /
        # UNAUTHENTICATED — sign in again and repeat the call once.
        if not raw and status in (401, 403) and isinstance(payload, dict) \
                and payload.get("code") in ("CSRF_FAILED", "UNAUTHENTICATED") and _retry and self.creds:
            if self.login()[0]:
                return self._send(method, path, body, raw)
        return status, payload

    def _send(self, method, path, body=None, raw=False):
        url = f"{BASE}{path}"
        data = None
        headers = {"Cookie": self._jar()}
        if method not in ("GET", "HEAD", "OPTIONS") and "cos_csrf" in self.cookies:
            headers["x-csrf-token"] = self.cookies["cos_csrf"]
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                self._absorb(resp)
                text = resp.read()
                return resp.status, (text if raw else self._parse(text))
        except urllib.error.HTTPError as err:
            self._absorb(err)
            text = err.read()
            return err.code, (text if raw else self._parse(text))

    def _absorb(self, response):
        for header in response.headers.get_all("Set-Cookie") or []:
            pair = header.split(";")[0]
            if "=" in pair:
                key, value = pair.split("=", 1)
                self.cookies[key] = value

    @staticmethod
    def _parse(text):
        try:
            return json.loads(text.decode("utf-8", "replace"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {"raw": text.decode("utf-8", "replace")}

    def login(self, creds=None):
        if creds:
            self.creds = creds
        status, body = self._send("POST", "/api/auth/login", {
            "identifier": self.creds[0], "password": self.creds[1],
        })
        if status not in (200, 201):
            return False, f"login {status}: {body}"
        self.user = body.get("data", {}).get("user") or body.get("user")
        self.redirect_to = body.get("redirectTo")
        return True, ""

    def sign_out(self):
        self.request("POST", "/api/auth/logout")
        self.cookies = {}
        self.user = None


def db(statement):
    creds = {}
    with open(".env", encoding="utf-8") as handle:
        for line in handle:
            match = re.match(r"^DB_(\w+)=(.*)$", line.strip())
            if match:
                creds[match.group(1)] = match.group(2).strip().strip('"').strip("'")
    out = subprocess.run(
        ["mysql", "--default-character-set=utf8mb4", "-u", creds["USER"], f"-p{creds['PASSWORD']}",
         creds["NAME"], "-N", "-B", "-e", statement],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(f"mysql failed: {out.stderr.strip()}")
    return [line.split("\t") for line in out.stdout.splitlines() if line.strip()]


def scalar(payload, key, default=None):
    if isinstance(payload, dict):
        return payload.get(key, default)
    return default


def rows_of(payload):
    data = scalar(payload, "data")
    return data if isinstance(data, list) else []


def find_user(payload, email):
    for row in rows_of(payload):
        if row.get("email") == email:
            return row
    return None


def sweep():
    """Remove every fixture this suite created, in dependency order."""
    email_prefix = f"cosfix{STAMP}"
    role_prefix = f"Cosfix {STAMP}"
    ids = ",".join(row[0] for row in db(
        f"SELECT id FROM users WHERE email LIKE '{email_prefix}%' OR username LIKE '{email_prefix}%';"
    )) or "0"
    db(f"DELETE FROM sessions WHERE user_id IN ({ids});")
    db(f"DELETE FROM password_reset_tokens WHERE user_id IN ({ids});")
    db(f"DELETE FROM user_roles WHERE user_id IN ({ids});")
    db(f"UPDATE auditors SET user_id = NULL WHERE user_id IN ({ids});")
    db(f"UPDATE employees SET user_id = NULL WHERE user_id IN ({ids});")
    db(f"DELETE FROM employer_users WHERE user_id IN ({ids});")
    db(f"DELETE FROM activity_logs WHERE entity_label LIKE '%{STAMP}%' OR description LIKE '%{STAMP}%';")
    db(f"DELETE FROM audit_trails WHERE record_id IN ({ids}) OR reason LIKE '%{STAMP}%';")
    db(f"DELETE FROM users WHERE id IN ({ids});")

    role_ids = ",".join(row[0] for row in db(
        f"SELECT id FROM roles WHERE name LIKE '{role_prefix}%' OR slug LIKE 'cosfix{STAMP}%';"
    )) or "0"
    db(f"DELETE FROM user_roles WHERE role_id IN ({role_ids});")
    db(f"DELETE FROM role_permissions WHERE role_id IN ({role_ids});")
    db(f"DELETE FROM roles WHERE id IN ({role_ids});")
    db(f"DELETE FROM employer_users WHERE employer_id IN "
       f"(SELECT id FROM employers WHERE employer_code = 'COSFIX{STAMP}');")
    db(f"DELETE FROM employers WHERE employer_code = 'COSFIX{STAMP}';")


def main():
    print(f"\nUsers & Roles verification — fixtures stamped {STAMP}\n")

    admin = Session(ADMIN)
    ok_login, detail = admin.login()
    if not ok_login:
        print(f"cannot sign in as administrator: {detail}")
        return 1
    admin_id = admin.user["id"]

    # ── 1. access control ────────────────────────────────────────────────
    print("1. access control")
    anon = Session()
    for path in ("/api/admin/users", "/api/admin/roles", "/api/admin/permissions"):
        status, _ = anon.request("GET", path)
        check(f"anonymous GET {path} → 401", status == 401, status)

    employer = Session(EMPLOYER)
    employer.login()
    status, body = employer.request("GET", "/api/admin/users")
    check("employer session cannot read the register (403)", status == 403, f"{status} {body}")
    status, body = employer.request("GET", "/api/admin/permissions")
    check("employer session cannot read the matrix (403)", status == 403, status)
    status, body = employer.request("POST", "/api/admin/users", {"first_name": "No", "last_name": "Way",
                                                                "email": f"nope{STAMP}@x.com", "role_slugs": ["admin"]})
    check("employer session cannot create logins (403)", status == 403, status)

    # ── 2. register ──────────────────────────────────────────────────────
    print("\n2. register")
    status, body = admin.request("GET", "/api/admin/users?page=1&limit=5")
    check("register lists accounts", status == 200 and len(rows_of(body)) > 0, status)
    stats = body.get("stats", {})
    check("register carries statistics", isinstance(stats, dict) and "total" in stats, stats)
    check("statistics include live session count", "sessions" in stats, list(stats))
    by_role = body.get("byRole", [])
    check("register carries the role breakdown", len(by_role) >= 6, len(by_role))
    check("role breakdown reports grants", all("permissions" in row for row in by_role[:3]), by_role[:1])
    pending = body.get("pendingActivation", [])
    check("register carries the activation queue", isinstance(pending, list), type(pending).__name__)
    check("register carries live sessions", isinstance(body.get("sessions"), list))

    rows = rows_of(body)
    check("rows expose derived portal", all("portal" in row for row in rows), rows[:1])
    check("rows expose role slugs", all("role_slugs" in row for row in rows), rows[:1])
    check("rows expose effective permission count", all("permission_count" in row for row in rows))
    check("rows expose the lock state", all("is_locked" in row for row in rows))
    check("rows expose live session counts", all("active_sessions" in row for row in rows))

    status, body = admin.request("GET", "/api/admin/users?page=1&limit=2")
    pagination = scalar(body, "pagination") or {}
    check("pagination is honoured", len(rows_of(body)) <= 2 and pagination.get("limit") == 2, pagination)
    check("pagination counts entries", pagination.get("total", 0) >= 4, pagination)

    status, body = admin.request("GET", "/api/admin/users?sortBy=last_name&sortDir=asc&limit=100")
    names = [row["last_name"].lower() for row in rows_of(body)]
    check("sorting by last name works", names == sorted(names), names[:5])

    status, body = admin.request("GET", "/api/admin/users?search=admin&limit=50")
    check("search matches the administrator", any("admin" in row["email"] for row in rows_of(body)), status)

    status, body = admin.request("GET", "/api/admin/users?portal=admin&limit=50")
    check("portal filter returns admin logins only",
          all(row["portal"] == "admin" for row in rows_of(body)) and rows_of(body), status)

    status, body = admin.request("GET", "/api/admin/users?role=employer&limit=50")
    check("role filter returns employers only",
          all("employer" in (row["role_slugs"] or "") for row in rows_of(body)) and rows_of(body), status)

    status, body = admin.request("GET", "/api/admin/users?locked=true&limit=50")
    check("locked filter returns only locked accounts",
          all(bool(row["is_locked"]) for row in rows_of(body)), status)

    status, body = admin.request("GET", "/api/admin/users?pending_activation=true&limit=50")
    check("activation filter returns only pending accounts",
          all(bool(row["is_first_login"]) for row in rows_of(body)), status)

    status, body = admin.request("GET", "/api/admin/users?status=suspended&limit=50")
    check("status filter accepts suspended", status == 200, status)

    status, body = admin.request("GET", "/api/admin/users?page=abc")
    check("bad pagination input is rejected (422)", status == 422, status)

    # ── 3. provisioning ──────────────────────────────────────────────────
    print("\n3. provisioning")
    email = f"cosfix{STAMP}.officer@complianceos.local"
    status, body = admin.request("POST", "/api/admin/users", {
        "first_name": "Cosfix", "last_name": f"Officer{STAMP}", "email": email,
        "role_slugs": ["employee"], "send_credentials": True,
    })
    check("login is created (201)", status == 201, f"{status} {body}")
    created = body
    user_id = created.get("userId")
    credentials = created.get("credentials") or {}
    check("create returns the generated username", bool(credentials.get("username")), credentials)
    check("create returns a temporary password", bool(credentials.get("temporaryPassword")), credentials)
    check("create reports the activation email", (created.get("activation") or {}).get("sent") is True, created.get("activation"))

    db_rows = db(f"SELECT id, status, is_first_login FROM users WHERE id = {user_id};")
    check("user row was written", len(db_rows) == 1 and db_rows[0][1] == "active", db_rows)
    check("user starts as first-login", db_rows and db_rows[0][2] == "1", db_rows)
    role_rows = db(f"SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = {user_id};")
    check("the role was attached", role_rows and role_rows[0][0] == "employee", role_rows)
    token_rows = db(f"SELECT COUNT(*) FROM password_reset_tokens WHERE user_id = {user_id} AND used_at IS NULL;")
    check("an activation token was issued", token_rows and int(token_rows[0][0]) >= 1, token_rows)
    mail_rows = db(f"SELECT template_code, status FROM email_logs WHERE to_email = '{email}' ORDER BY id DESC LIMIT 1;")
    check("the credential email was logged", mail_rows and mail_rows[0][0] == "welcome.credentials", mail_rows)

    status, body = admin.request("POST", "/api/admin/users", {
        "first_name": "Dup", "last_name": "Licat", "email": email, "role_slugs": ["employee"],
    })
    check("duplicate email is refused (409)", status == 409, f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/users", {
        "first_name": "No", "last_name": "Roles", "email": f"cosfix{STAMP}.noroles@complianceos.local",
    })
    check("a login without roles is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/users", {
        "first_name": "Bad", "last_name": "Role", "email": f"cosfix{STAMP}.badrole@complianceos.local",
        "role_slugs": ["does_not_exist"],
    })
    check("an unknown role is refused", status in (400, 422) and body.get("code") == "INVALID_REFERENCE", f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/users", {
        "first_name": "Weak", "last_name": "Password", "email": f"cosfix{STAMP}.weak@complianceos.local",
        "role_slugs": ["employee"], "password": "weak", "send_credentials": False,
    })
    check("a policy-breaking password is refused (422)", status == 422, f"{status} {body}")

    fresh = Session()
    ok_login, _ = fresh.login((credentials.get("username"), credentials.get("temporaryPassword")))
    check("the new login works with its temporary password", ok_login)
    check("a first sign-in is routed to change-password",
          (fresh.redirect_to or "").endswith("/change-password"), fresh.redirect_to)

    # ── 4. account lifecycle ─────────────────────────────────────────────
    print("\n4. account lifecycle")
    status, body = admin.request("GET", f"/api/admin/users/{user_id}")
    detail_data = body
    check("detail returns the account", status == 200 and (detail_data.get("user") or {}).get("id") == user_id, status)
    check("detail lists the roles held", len(detail_data.get("roles", [])) == 1, detail_data.get("roles"))
    check("detail resolves effective permissions", len(detail_data.get("permissions", [])) > 0, len(detail_data.get("permissions", [])))
    check("detail lists sessions", isinstance(detail_data.get("sessions"), list))
    check("detail lists portal links", isinstance(detail_data.get("links"), list))
    check("detail summarises activity", "actions" in (detail_data.get("activity") or {}), detail_data.get("activity"))
    check("detail offers link candidates",
          set((detail_data.get("candidates") or {}).keys()) == {"employers", "auditors", "employees"},
          list(detail_data.get("candidates") or {}))

    status, body = admin.request("GET", "/api/admin/users/99999999")
    check("unknown account → 404", status == 404, status)

    status, body = admin.request("PATCH", f"/api/admin/users/{user_id}", {"first_name": "CosfixRenamed"})
    check("account is updated (200)", status == 200, f"{status} {body}")
    audit_rows = db(f"SELECT field_name, old_value, new_value FROM audit_trails WHERE table_name = 'users' AND record_id = {user_id} AND field_name = 'first_name';")
    check("the edit wrote a field-level audit trail", audit_rows and audit_rows[0][2] == "CosfixRenamed", audit_rows)
    activity_rows = db(f"SELECT action, module FROM activity_logs WHERE module = 'user' AND entity_id = {user_id} ORDER BY id DESC LIMIT 5;")
    check("the edit wrote an activity log", any(row[0] == "updated" for row in activity_rows), activity_rows)

    status, body = admin.request("PATCH", f"/api/admin/users/{user_id}", {"status": "banana"})
    check("an invalid status is refused (422)", status == 422, status)

    status, body = admin.request("PATCH", f"/api/admin/users/{user_id}", {"email": "admin@complianceos.local"})
    check("taking an existing email is refused (409)", status == 409, f"{status} {body}")

    status, body = admin.request("PATCH", f"/api/admin/users/{user_id}", {})
    check("an empty edit is refused (409 NO_CHANGE)", status == 409, f"{status} {body}")

    status, body = admin.request("DELETE", f"/api/admin/users/{admin_id}")
    check("an administrator cannot archive their own account (409)", status == 409, f"{status} {body}")

    db(f"UPDATE users SET locked_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE), failed_login_count = 5 WHERE id = {user_id};")
    status, body = admin.request("POST", f"/api/admin/users/{user_id}/unlock")
    check("a locked account can be unlocked (200)", status == 200, f"{status} {body}")
    unlocked = db(f"SELECT locked_until, failed_login_count FROM users WHERE id = {user_id};")
    check("unlock clears the lock and the counter",
          unlocked and unlocked[0][0] == "NULL" and unlocked[0][1] == "0", unlocked)
    status, body = admin.request("POST", f"/api/admin/users/{user_id}/unlock")
    check("unlocking an unlocked account is refused (409)", status == 409, f"{status} {body}")

    locked = Session()
    locked.login((credentials.get("username"), credentials.get("temporaryPassword")))
    status, body = admin.request("GET", f"/api/admin/users/{user_id}/sessions")
    check("sessions endpoint lists sign-ins", status == 200 and len(rows_of(body)) >= 1, status)
    status, body = admin.request("DELETE", f"/api/admin/users/{user_id}/sessions")
    check("sessions can be revoked (200)", status == 200 and body.get("revoked", 0) >= 1, f"{status} {body}")
    status, body = locked.request("GET", "/api/notifications?limit=1")
    check("a revoked session can no longer read (401)", status == 401, status)

    status, body = admin.request("POST", f"/api/admin/users/{user_id}/reset-password")
    check("a password reset link can be sent (200)", status == 200, f"{status} {body}")
    reset_mail = db(f"SELECT template_code FROM email_logs WHERE to_email = '{email}' AND template_code = 'auth.password_reset' ORDER BY id DESC LIMIT 1;")
    check("the reset email was logged", bool(reset_mail), reset_mail)
    reset_rows = db(f"SELECT COUNT(*) FROM password_reset_tokens WHERE user_id = {user_id} AND used_at IS NULL;")
    check("a reset token was issued", int(reset_rows[0][0]) >= 2, reset_rows)

    status, body = admin.request("POST", f"/api/admin/users/{user_id}/resend-activation")
    check("activation credentials can be re-sent (200)", status == 200, f"{status} {body}")
    resent = body.get("credentials") or {}
    check("re-send returns a fresh password",
          bool(resent.get("temporaryPassword")) and resent.get("temporaryPassword") != credentials.get("temporaryPassword"),
          resent)

    stale = Session()
    ok_stale, _ = stale.login((credentials.get("username"), credentials.get("temporaryPassword")))
    check("the previous temporary password stops working", not ok_stale)
    renewed = Session()
    ok_new, _ = renewed.login((credentials.get("username"), resent.get("temporaryPassword")))
    check("the re-issued password works", ok_new)

    status, body = admin.request("DELETE", f"/api/admin/users/{user_id}")
    check("the account can be archived (200)", status == 200, f"{status} {body}")
    archived_row = db(f"SELECT deleted_at IS NOT NULL, status FROM users WHERE id = {user_id};")
    check("archive is a soft delete", archived_row and archived_row[0][0] == "1", archived_row)
    blocked = Session()
    ok_blocked, _ = blocked.login((credentials.get("username"), resent.get("temporaryPassword")))
    check("an archived account cannot sign in", not ok_blocked)

    status, body = admin.request("GET", "/api/admin/users?archived=true&limit=100")
    check("archived accounts appear in the archive view", find_user(body, email) is not None, status)
    status, body = admin.request("GET", "/api/admin/users?limit=100")
    check("archived accounts are hidden from the live register", find_user(body, email) is None, status)

    status, body = admin.request("POST", f"/api/admin/users/{user_id}/restore")
    check("the account can be restored (200)", status == 200, f"{status} {body}")
    status, body = admin.request("POST", f"/api/admin/users/{user_id}/restore")
    check("restoring a live account is refused (409)", status == 409, f"{status} {body}")
    revived = Session()
    ok_revived, _ = revived.login((credentials.get("username"), resent.get("temporaryPassword")))
    check("a restored account signs in again", ok_revived)

    # ── 5. portal binding ────────────────────────────────────────────────
    print("\n5. portal binding")
    db(
        "INSERT INTO employers (uuid, company_name, employer_code, status, created_at) "
        f"VALUES (UUID(), 'Cosfix Employer {STAMP}', 'COSFIX{STAMP}', 'active', NOW());"
    )
    employer_id = int(db(f"SELECT id FROM employers WHERE employer_code = 'COSFIX{STAMP}';")[0][0])
    status, body = admin.request("POST", f"/api/admin/users/{user_id}/link", {"employer_id": employer_id})
    check("a login can be linked to an employer record", status == 200, f"{status} {body}")
    link_rows = db(f"SELECT COUNT(*) FROM employer_users WHERE user_id = {user_id} AND employer_id = {employer_id};")
    check("the employer link row exists", link_rows and int(link_rows[0][0]) == 1, link_rows)
    status, body = admin.request("GET", f"/api/admin/users/{user_id}")
    links = body.get("links", [])
    check("the link shows on the account detail", any(row.get("kind") == "employer" for row in links), links)
    status, body = admin.request("POST", f"/api/admin/users/{user_id}/link", {})
    check("linking without a target is refused (422)", status == 422, f"{status} {body}")

    # ── 6. RBAC enforcement ──────────────────────────────────────────────
    print("\n6. RBAC enforcement")
    limited_slug = f"cosfix{STAMP}_limited"
    status, body = admin.request("POST", "/api/admin/roles", {
        "name": f"Cosfix {STAMP} Limited", "slug": limited_slug,
        "permissions": ["dashboard.read"],
    })
    check("a narrow role can be created for the probe (201)", status == 201, f"{status} {body}")
    limited_role_id = body.get("roleId")

    probe_email = f"cosfix{STAMP}.probe@complianceos.local"
    status, body = admin.request("POST", "/api/admin/users", {
        "first_name": "Cosfix", "last_name": f"Probe{STAMP}", "email": probe_email,
        "role_slugs": [limited_slug], "status": "active",
    })
    check("the probe login is created (201)", status == 201, f"{status} {body}")
    probe = body
    probe_id = probe.get("userId")
    probe_creds = probe.get("credentials") or {}

    probe_session = Session()
    ok_probe, detail = probe_session.login((probe_creds.get("username"), probe_creds.get("temporaryPassword")))
    check("the probe login signs in", ok_probe, detail)
    status, body = probe_session.request("GET", "/api/admin/users")
    check("a role without user.read is refused by URL (403)", status == 403, f"{status} {body}")
    status, body = probe_session.request("POST", "/api/admin/users", {
        "first_name": "Esca", "last_name": "Late", "email": f"cosfix{STAMP}.escape@complianceos.local",
        "role_slugs": ["admin"],
    })
    check("a role without user.create cannot provision (403)", status == 403, f"{status} {body}")
    status, body = probe_session.request("GET", "/api/admin/permissions")
    check("a role without permission.read cannot read the matrix (403)", status == 403, status)
    status, body = probe_session.request("PUT", f"/api/admin/roles/{limited_role_id}/permissions", {"permissions": ["user.read"]})
    check("a role without role.update cannot grant itself anything (403)", status == 403, status)
    granted = db(f"SELECT COUNT(*) FROM role_permissions WHERE role_id = {limited_role_id};")
    check("the probe role still holds exactly its one grant", int(granted[0][0]) == 1, granted)

    # ── 7. roles ─────────────────────────────────────────────────────────
    print("\n7. roles")
    status, body = admin.request("GET", "/api/admin/roles?page=1&limit=50")
    check("the role register lists roles", status == 200 and len(rows_of(body)) >= 6, status)
    role_stats = body.get("stats", {})
    check("role statistics are returned",
          {"total", "systemRoles", "customRoles", "grants", "permissions"} <= set(role_stats), role_stats)
    check("the matrix column data rides along", len(body.get("matrixRoles", [])) >= 6)

    status, body = admin.request("GET", "/api/admin/roles?kind=system&limit=50")
    check("system roles can be isolated", all(bool(row["is_system_role"]) for row in rows_of(body)) and rows_of(body), status)
    status, body = admin.request("GET", "/api/admin/roles?search=Auditor&limit=50")
    check("roles are searchable", any("auditor" in row["slug"] for row in rows_of(body)), status)

    status, body = admin.request("POST", "/api/admin/roles", {
        "name": f"Cosfix {STAMP} Limited", "slug": limited_slug, "permissions": ["dashboard.read"],
    })
    check("a duplicate slug is refused (409)", status == 409, f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/roles", {
        "name": f"Cosfix {STAMP} Bad", "permissions": ["not.a.permission"],
    })
    check("an unknown permission is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/roles", {
        "name": f"Cosfix {STAMP} Clone", "clone_from": "no_such_role",
    })
    check("cloning an unknown role is refused", status in (400, 422) and body.get("code") == "INVALID_REFERENCE",
          f"{status} {body}")

    employer_grants = int(db("SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.slug = 'employer';")[0][0])
    status, body = admin.request("POST", "/api/admin/roles", {
        "name": f"Cosfix {STAMP} Clone", "clone_from": "employer",
    })
    check("a role can be cloned (201)", status == 201, f"{status} {body}")
    clone_id = body.get("roleId")
    clone_grants = int(db(f"SELECT COUNT(*) FROM role_permissions WHERE role_id = {clone_id};")[0][0])
    check("the clone carries the source grants", clone_grants == employer_grants, f"{clone_grants} vs {employer_grants}")

    status, body = admin.request("GET", f"/api/admin/roles/{limited_role_id}")
    role_detail = body
    check("role detail returns the grant set", status == 200 and (role_detail.get("permissionNames") or []) == ["dashboard.read"],
          role_detail.get("permissionNames"))
    check("role detail returns the catalogue", len(role_detail.get("catalogue", [])) > 400, len(role_detail.get("catalogue", [])))
    check("role detail lists members", isinstance(role_detail.get("members"), list))

    status, body = admin.request("GET", "/api/admin/roles/99999999")
    check("unknown role → 404", status == 404, status)

    status, body = admin.request("PATCH", f"/api/admin/roles/{limited_role_id}", {"description": f"Cosfix {STAMP} probe role"})
    check("a custom role can be edited (200)", status == 200, f"{status} {body}")
    status, body = admin.request("PATCH", f"/api/admin/roles/{limited_role_id}", {"description": f"Cosfix {STAMP} probe role"})
    check("an unchanged role edit is refused (409)", status == 409, f"{status} {body}")

    system_role_id = db("SELECT id FROM roles WHERE slug = 'auditor';")[0][0]
    status, body = admin.request("PATCH", f"/api/admin/roles/{system_role_id}", {"name": "Renamed Auditor"})
    check("a system role cannot be renamed", status in (409, 422), f"{status} {body}")
    status, body = admin.request("DELETE", f"/api/admin/roles/{system_role_id}")
    check("a system role cannot be deleted", status in (409, 422), f"{status} {body}")

    status, body = admin.request("PUT", f"/api/admin/roles/{limited_role_id}/permissions", {"permissions": ["dashboard.read"]})
    check("re-saving an identical grant set is refused (409)", status == 409, f"{status} {body}")

    status, body = admin.request("PUT", f"/api/admin/roles/{limited_role_id}/permissions",
                                 {"permissions": ["dashboard.read", "user.read", "user.export"]})
    check("a grant set can be replaced (200)", status == 200, f"{status} {body}")
    saved = body
    check("the change reports what was granted", saved.get("granted") == 2 and saved.get("total") == 3, saved)
    grant_rows = db(f"SELECT COUNT(*) FROM role_permissions WHERE role_id = {limited_role_id};")
    check("the database holds the new set", int(grant_rows[0][0]) == 3, grant_rows)

    status, body = probe_session.request("GET", "/api/admin/users?limit=1")
    check("changing a role signs its holders out (401)", status == 401, f"{status} {body}")
    probe_session = Session()
    probe_session.login((probe_creds.get("username"), probe_creds.get("temporaryPassword")))
    status, body = probe_session.request("GET", "/api/admin/users?limit=1")
    check("granting a permission never grants another panel (403)",
          status == 403 and body.get("code") == "FORBIDDEN", f"{status} {body}")
    status, body = probe_session.request("GET", "/api/notifications?limit=1")
    check("the probe still reaches the shared authenticated endpoints (200)", status == 200, status)

    status, body = admin.request("DELETE", f"/api/admin/roles/{limited_role_id}")
    check("a role that is still held cannot be deleted (409 IN_USE)", status == 409, f"{status} {body}")
    admin.request("PATCH", f"/api/admin/users/{probe_id}/roles", {"role_slugs": ["employee"], "reason": f"Cosfix {STAMP} teardown"})
    status, body = admin.request("DELETE", f"/api/admin/roles/{limited_role_id}")
    check("an unheld custom role can be deleted (200)", status == 200, f"{status} {body}")
    gone = db(f"SELECT deleted_at IS NOT NULL FROM roles WHERE id = {limited_role_id};")
    check("role deletion is a soft delete", gone and gone[0][0] == "1", gone)
    status, body = admin.request("DELETE", f"/api/admin/roles/{clone_id}")
    check("the cloned role can be deleted too (200)", status == 200, f"{status} {body}")

    # ── 8. permission matrix ─────────────────────────────────────────────
    print("\n8. permission matrix")
    status, body = admin.request("GET", "/api/admin/permissions")
    matrix = body
    check("the matrix loads (200)", status == 200, status)
    check("the matrix lists roles", len(matrix.get("roles", [])) >= 6, len(matrix.get("roles", [])))
    check("the matrix lists every module", len(matrix.get("modules", [])) >= 40, len(matrix.get("modules", [])))
    check("the matrix lists every grant",
          sum(len(names) for names in (matrix.get("grants") or {}).values()) > 400,
          sum(len(names) for names in (matrix.get("grants") or {}).values()))
    check("the matrix carries platform defaults", "admin" in (matrix.get("defaults") or {}), list(matrix.get("defaults") or {}))
    total_permissions = sum(len(module["permissions"]) for module in matrix.get("modules", []))
    check("the catalogue holds the seeded permissions", total_permissions >= 451, total_permissions)

    super_admin_id = db("SELECT id FROM roles WHERE slug = 'super_admin';")[0][0]
    status, body = admin.request("PUT", f"/api/admin/roles/{super_admin_id}/permissions", {"permissions": ["dashboard.read"]})
    check("the super administrator's grants are protected", status in (409, 422), f"{status} {body}")

    auditor_slug = "auditor"
    auditor_before = db(f"SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.slug = '{auditor_slug}';")
    status, body = admin.request("PUT", "/api/admin/permissions/matrix", {
        "roles": [{"role_slug": auditor_slug, "permissions": ["dashboard.read", "audit_report.read"]}],
    })
    check("the matrix saves a role in bulk (200)", status == 200, f"{status} {body}")
    bulk = body
    check("the bulk save reports per-role outcomes",
          (bulk.get("results") or [{}])[0].get("status") == "saved", bulk.get("results"))
    auditor_after = int(db(f"SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.slug = '{auditor_slug}';")[0][0])
    check("the auditor role now holds the requested grants", auditor_after == 2, auditor_after)
    check("the bulk save revoked the rest", auditor_after < int(auditor_before[0][0]), auditor_before)

    status, body = admin.request("PUT", "/api/admin/permissions/matrix", {
        "roles": [{"role_slug": auditor_slug, "permissions": ["dashboard.read", "audit_report.read"]}],
    })
    check("a matrix save with nothing to change is refused (409)", status == 409, f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/permissions/matrix", {"roles": [{"role_slug": "ghost_role", "permissions": []}]})
    check("the matrix reports an unknown role instead of failing the batch",
          (body.get("results") or [{}])[0].get("status") == "error", f"{status} {body}")

    # Restore the auditor role to its seeded grants so the rest of the platform
    # keeps behaving exactly as the seeds intend.
    auditor_defaults = (matrix.get("defaults") or {}).get(auditor_slug) or []
    resolved = []
    defaults_by_name = {permission["name"] for module in matrix.get("modules", []) for permission in module["permissions"]}
    for name in auditor_defaults:
        if name in defaults_by_name:
            resolved.append(name)
    status, body = admin.request("PUT", f"/api/admin/roles/{system_role_id}/permissions", {"permissions": resolved})
    check("the auditor role is restored to its defaults",
          status == 200 or (status == 409 and "already holds" in str(body)), f"{status} {body}")

    # ── 9. screens ───────────────────────────────────────────────────────
    print("\n9. screens")
    status, html = admin.request("GET", "/admin/users", raw=True)
    check("the register renders (200)", status == 200 and b"<html" in html.lower(), status)
    check("the register is titled", b"Users" in html, "")
    status, html = admin.request("GET", "/admin/users/create", raw=True)
    check("the create screen renders (200)", status == 200 and b"<html" in html.lower(), status)
    status, html = admin.request("GET", f"/admin/users/{user_id}", raw=True)
    check("the account detail renders (200)", status == 200 and b"<html" in html.lower(), status)
    status, html = admin.request("GET", f"/admin/users/{user_id}/edit", raw=True)
    check("the account edit screen renders (200)", status == 200 and b"<html" in html.lower(), status)
    status, html = admin.request("GET", "/admin/roles", raw=True)
    check("the role register renders (200)", status == 200 and b"<html" in html.lower(), status)
    status, html = admin.request("GET", "/admin/roles/create", raw=True)
    check("the create-role screen renders (200)", status == 200 and b"<html" in html.lower(), status)
    status, html = admin.request("GET", f"/admin/roles/{system_role_id}", raw=True)
    check("the role detail renders (200)", status == 200 and b"<html" in html.lower(), status)
    status, html = admin.request("GET", "/admin/roles/99999999", raw=True)
    check("an unknown role page is a 404", status == 404, status)
    status, html = admin.request("GET", "/admin/permissions", raw=True)
    check("the matrix renders (200)", status == 200 and b"<html" in html.lower(), status)

    # ── 10. clean-up ─────────────────────────────────────────────────────
    print("\n10. clean-up")
    sweep()
    leftover = db(f"SELECT COUNT(*) FROM users WHERE email LIKE 'cosfix{STAMP}%' OR username LIKE 'cosfix{STAMP}%';")
    check("fixture logins removed", int(leftover[0][0]) == 0, leftover)
    leftover_roles = db(f"SELECT COUNT(*) FROM roles WHERE name LIKE 'Cosfix {STAMP}%' OR slug LIKE 'cosfix{STAMP}%';")
    check("fixture roles removed", int(leftover_roles[0][0]) == 0, leftover_roles)

    print(f"\nRESULT {passed} passed, {failed} failed")
    if failures:
        print("FAILURES:")
        for failure in failures:
            print(f"  · {failure}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
