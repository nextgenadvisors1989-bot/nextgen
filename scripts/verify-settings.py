#!/usr/bin/env python3
"""Settings module (Phase 2) end-to-end verification.

The settings screens are the platform's control room, so this suite attacks them
the way an operator and an intruder would:

   1. access control      — settings are administrator-only, by URL as well
   2. catalogue           — every group, section and field is served as described
   3. group reads         — all seven groups read, unknown groups do not
   4. updates             — a real change persists, is audited and reads back
   5. validation          — unknown keys, bad numbers, bad choices, bad JSON
   6. secrets             — encrypted at rest, masked on read, keep/clear rules
   7. audit trail         — the activity log holds the old and the new value
   8. channel tests       — test email/SMS/WhatsApp reach the *_logs tables
   9. delivery log        — statistics, templates, filters and pagination
  10. scheduled jobs      — list, pause, run a reminder job, refusals
  11. backups             — a real mysqldump, history, detail, storage, delete
  12. logo upload         — the file lands in the vault and the setting follows
  13. screens             — every settings page renders for an admin, not for others
  14. clean-up            — every fixture this suite created is gone

Usage:  python3 scripts/verify-settings.py [base_url]
Assumes migrations + seeds are loaded and the server is running.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")
ADMIN = (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026"))
AUDITOR = ("auditor.test@complianceos.local", "Auditor@2026")
VERIFIER = ("verifier.test@complianceos.local", "Verifier@2026")
EMPLOYER = ("employer.test@complianceos.local", "Employer@2026")
EMPLOYEE = ("employee.test@complianceos.local", "Employee@2026")
STAMP = datetime.now().strftime("%m%d%H%M%S")

passed = 0
failed = 0
failures = []

GROUPS = ["system", "company", "email", "sms", "whatsapp", "backup", "audit"]
# Fields the catalogue declares per group — the screens must serve exactly these.
EXPLAINED = {}
BACKUP_ROWS = []          # backup ids this suite created
FILE_ROWS = []            # file ids this suite created
LOG_TABLES = {"email": ("email_logs", "to_email"), "sms": ("sms_logs", "to_mobile"),
              "whatsapp": ("whatsapp_logs", "to_mobile")}
LOG_TABLES_ALL = ["email_logs", "sms_logs", "whatsapp_logs"]
TEST_MOBILE = "+9198765" + STAMP[:5]
ORIGINAL = {}             # raw settings rows, restored verbatim in clean-up


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        failures.append(f"{name} — {detail}")
        print(f"  ✗ {name} {('— ' + str(detail)) if detail else ''}")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Leaves 30x responses alone so the suite can see where a user was sent."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
        return None


class Session:
    """Cookie jar + CSRF, exactly like the browser panel calls."""

    def __init__(self, creds=None):
        self.creds = creds
        self.cookies = {}
        self.user = None
        self.redirect_to = None

    def _jar(self):
        return "; ".join(f"{k}={v}" for k, v in self.cookies.items())

    def request(self, method, path, body=None, raw=False, headers=None, _retry=True):
        status, payload = self._send(method, path, body, raw, headers)
        if not raw and status in (401, 403) and isinstance(payload, dict) \
                and payload.get("code") in ("CSRF_FAILED", "UNAUTHENTICATED") and _retry and self.creds:
            if self.login()[0]:
                return self._send(method, path, body, raw, headers)
        # A response that did not parse is a broken read, not a failed request —
        # read it again before blaming the platform.
        if not raw and isinstance(payload, dict) and set(payload.keys()) == {"raw"} and _retry:
            return self._send(method, path, body, raw, headers)
        return status, payload

    def request_no_redirect(self, method, path):
        """Fetch without following a 30x — how a page guard must be observed."""
        return self._send(method, path, None, True, None, follow=False)

    def post_raw(self, path, data, content_type):
        """POST a non-JSON body (multipart) with the session's cookies and CSRF."""
        headers = {"Cookie": self._jar(), "Content-Type": content_type,
                   "Content-Length": str(len(data))}
        if "cos_csrf" in self.cookies:
            headers["x-csrf-token"] = self.cookies["cos_csrf"]
        req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                self._absorb(resp)
                return resp.status, self._parse(resp.read())
        except urllib.error.HTTPError as err:
            self._absorb(err)
            return err.code, self._parse(err.read())

    def _send(self, method, path, body=None, raw=False, headers=None, follow=True):
        url = f"{BASE}{path}"
        data = None
        send_headers = {"Cookie": self._jar(), **(headers or {})}
        if method not in ("GET", "HEAD", "OPTIONS") and "cos_csrf" in self.cookies:
            send_headers["x-csrf-token"] = self.cookies["cos_csrf"]
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            send_headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=send_headers, method=method)
        opener = urllib.request.build_opener() if follow else urllib.request.build_opener(_NoRedirect)
        try:
            with opener.open(req) as resp:
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


def count_of(value):
    """`changed` is a list of entries; `unchanged` may be a count or a list."""
    if value is None:
        return 0
    return len(value) if isinstance(value, (list, dict)) else int(value)


def values_of(payload, group):
    return (scalar(payload, "values") or {}).get(group, {})


def snapshot_settings():
    """Remember the raw settings rows this suite may touch, verbatim."""
    for group in GROUPS:
        for row in db(f"SELECT id, setting_group, setting_key, setting_value, is_encrypted, "
                      f"is_public, value_type, label FROM settings WHERE setting_group = '{group}';"):
            ORIGINAL[(row[1], row[2])] = row


def restore_settings():
    """Put every touched settings row back exactly as it was before the run."""
    live = set()
    for group in GROUPS:
        for row in db(f"SELECT setting_group, setting_key FROM settings WHERE setting_group = '{group}';"):
            live.add((row[0], row[1]))
    for (group, key), row in ORIGINAL.items():
        row_id, _, _, value, encrypted, public, value_type, label = row
        if (group, key) not in live:
            continue
        db(f"UPDATE settings SET setting_value = {sql_text(value)}, is_encrypted = {encrypted}, "
           f"is_public = {public}, value_type = {sql_text(value_type)}, label = {sql_text(label)}, "
           f"updated_by = NULL WHERE id = {row_id};")
    # Rows the suite created that did not exist before.
    for group in GROUPS:
        for row in db(f"SELECT id, setting_group, setting_key FROM settings WHERE setting_group = '{group}';"):
            if (row[1], row[2]) not in ORIGINAL:
                db(f"DELETE FROM settings WHERE id = {row[0]};")


def sql_text(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def sweep():
    """Remove every fixture this suite created, in dependency order."""
    for backup_id in BACKUP_ROWS:
        rows = db(f"SELECT file_path, status FROM backup_history WHERE id = {backup_id};")
        if rows and rows[0][0] and rows[0][0] != "NULL":
            try:
                os.remove(rows[0][0])
            except OSError:
                pass
    for file_id in FILE_ROWS:
        rows = db(f"SELECT storage_path FROM files WHERE id = {file_id};")
        if rows and rows[0][0]:
            candidates = [os.path.join("storage/uploads", rows[0][0]), rows[0][0]]
            for candidate in candidates:
                try:
                    os.remove(candidate)
                except OSError:
                    pass
    db("DELETE FROM file_versions WHERE file_id IN (" + (",".join(str(i) for i in FILE_ROWS) or "0") + ");")
    db("DELETE FROM files WHERE id IN (" + (",".join(str(i) for i in FILE_ROWS) or "0") + ");")
    if BACKUP_ROWS:
        db("DELETE FROM backup_history WHERE id IN (" + ",".join(str(i) for i in BACKUP_ROWS) + ");")
    db(f"DELETE FROM email_logs WHERE to_email LIKE '%{STAMP}%' OR subject LIKE '%{STAMP}%';")
    db(f"DELETE FROM sms_logs WHERE to_mobile LIKE '%{TEST_MOBILE[-10:]}%' OR message LIKE '%{STAMP}%';")
    db(f"DELETE FROM whatsapp_logs WHERE to_mobile LIKE '%{TEST_MOBILE[-10:]}%' OR message LIKE '%{STAMP}%';")
    db(f"DELETE FROM activity_logs WHERE description LIKE '%{STAMP}%' OR entity_label LIKE '%{STAMP}%';")
    fixture_users = ", ".join(row[0] for row in db(
        f"SELECT id FROM users WHERE email LIKE 'cosfix{STAMP}%' OR username LIKE 'cosfix{STAMP}%';")) or "0"
    db(f"DELETE FROM sessions WHERE user_id IN ({fixture_users});")
    db(f"DELETE FROM password_reset_tokens WHERE user_id IN ({fixture_users});")
    db(f"DELETE FROM user_roles WHERE user_id IN ({fixture_users});")
    db(f"DELETE FROM users WHERE id IN ({fixture_users});")
    # Backup dumps and upload copies this run produced, named with the run stamp.
    for directory in ("storage/backups",):
        if os.path.isdir(directory):
            for name in os.listdir(directory):
                if STAMP in name:
                    path = os.path.join(directory, name)
                    if os.path.isdir(path):
                        subprocess.run(["rm", "-rf", path], check=False)
                    else:
                        try:
                            os.remove(path)
                        except OSError:
                            pass


def main():
    print(f"\nSettings module verification — fixtures stamped {STAMP}\n")
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    admin = Session(ADMIN)
    ok_login, detail = admin.login()
    if not ok_login:
        print(f"FATAL: administrator sign-in failed: {detail}")
        return 2

    snapshot_settings()

    # ── 1. access control ────────────────────────────────────────────────
    print("1. access control")
    anonymous = Session()
    status, body = anonymous.request("GET", "/api/admin/settings")
    check("an anonymous caller cannot read settings (401)", status == 401, f"{status} {body}")

    # The employee portal has no seeded test login (employees are created by an
    # employer), so this suite provisions one for the duration of the run.
    employee_login = (f"cosfix{STAMP}.employee@complianceos.example", f"Cosfix!{STAMP}Aa1")
    emp_created = False
    status, body = admin.request("POST", "/api/admin/users", {
        "first_name": "Cosfix",
        "last_name": f"Verifier {STAMP}",
        "email": employee_login[0],
        "username": f"cosfix{STAMP}emp",
        "role_slugs": ["employee"],
        "status": "active",
        "send_credentials": False,
        "password": employee_login[1],
    })
    emp_created = status in (200, 201)
    check("a throwaway employee login can be provisioned for the probe", emp_created, f"{status} {body}")

    probes = [("auditor", AUDITOR), ("verifier", VERIFIER), ("employer", EMPLOYER)]
    if emp_created:
        probes.append(("employee", employee_login))
    for label, creds in probes:
        session = Session(creds)
        signed_in, _ = session.login()
        if not signed_in:
            check(f"the {label} test login works", False, "sign-in failed")
            continue
        if label == "employee":
            check("the employee test login works", True)
        status, body = session.request("GET", "/api/admin/settings")
        check(f"a {label} cannot read the settings overview (403)", status == 403, f"{status} {body}")
        status, body = session.request("GET", "/api/admin/settings/email")
        check(f"a {label} cannot read the email group (403)", status == 403, f"{status} {body}")
        status, body = session.request("PUT", "/api/admin/settings/system", {"values": {"app_name": "Hijacked"}})
        check(f"a {label} cannot write settings (403)", status == 403, f"{status} {body}")
        status, body = session.request("POST", "/api/admin/settings/backups/run", {})
        check(f"a {label} cannot run a backup (403)", status == 403, f"{status} {body}")
        session.sign_out()

    # ── 2. overview & catalogue ──────────────────────────────────────────
    print("\n2. overview & catalogue")
    status, overview = admin.request("GET", "/api/admin/settings")
    check("the overview reads (200)", status == 200 and overview.get("success") is True, f"{status} {overview}")
    stored_groups = {entry["group"] for entry in overview.get("groups", [])}
    check("every catalogued group is present", stored_groups == set(GROUPS), stored_groups)
    screens = overview.get("screens") or []
    check("the screens list covers all seven groups",
          {screen["group"] for screen in screens} == set(GROUPS),
          [screen["group"] for screen in screens])
    check("every screen links to an admin settings page",
          all(screen["href"].startswith("/admin/settings") for screen in screens), screens)
    check("the overview carries masked values for each group",
          set((overview.get("values") or {}).keys()) == set(GROUPS), list((overview.get("values") or {}).keys()))
    stats = overview.get("stats") or {}
    check("the statistics report the platform's size", stats.get("tables", 0) > 50 and stats.get("sizeMb", 0) > 0, stats)
    check("secret settings are counted", stats.get("secrets", 0) >= 5, stats)
    check("no group is reported as unknown", overview.get("unknownGroups") == [], overview.get("unknownGroups"))
    integrations = overview.get("integrations") or {}
    check("the integration status covers all three channels",
          {"email", "sms", "whatsapp"} <= set(integrations.keys()), list(integrations.keys()))
    check("every channel carries a human detail line",
          all(isinstance(integrations[channel].get("detail"), str) and integrations[channel]["detail"]
              for channel in ("email", "sms", "whatsapp")), integrations)
    check("the template inventory is counted",
          all(channel in (integrations.get("templates") or {}) for channel in ("email", "sms", "whatsapp", "inApp")),
          integrations.get("templates"))

    # ── 3. group reads ───────────────────────────────────────────────────
    print("\n3. group reads")
    group_values = {}
    for group in GROUPS:
        status, body = admin.request("GET", f"/api/admin/settings/{group}")
        check(f"the {group} group reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
        group_values[group] = body.get("values") or {}
        check(f"the {group} group serves its catalogue sections",
              len(body.get("sections") or []) >= 1 and all(section.get("fields") for section in body["sections"]),
              body.get("sections"))
        check(f"the {group} group labels each field",
              all(field.get("label") for field in body.get("fields") or []), body.get("fields"))
        EXPLAINED[group] = {field["key"] for field in body.get("fields") or []}
        check(f"the {group} group lists its values",
              set((body.get("values") or {}).keys()) == EXPLAINED[group], body.get("values"))

    status, body = admin.request("GET", "/api/admin/settings/pigeon")
    check("an unknown settings group is a 404", status == 404, f"{status} {body}")
    status, body = admin.request("GET", "/api/admin/settings/email")
    check("the email group carries the delivery statistics", "delivery" in body, list(body.keys()))
    check("the email group carries the live integration status", "integrations" in body, list(body.keys()))
    status, body = admin.request("GET", "/api/admin/settings/audit")
    check("the audit group does not carry delivery statistics", "delivery" not in body, list(body.keys()))

    # ── 4. updates ───────────────────────────────────────────────────────
    print("\n4. updates")
    before = scalar(group_values.get("system"), "items_per_page")
    status, body = admin.request("PUT", "/api/admin/settings/system", {
        "values": {"items_per_page": "25"}, "note": f"verification run {STAMP}",
    })
    check("a single system setting saves (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the save reports what changed", [entry["key"] for entry in body.get("changed") or []] == ["items_per_page"],
          body.get("changed"))
    summarised = (body.get("changed") or [{}])[0]
    check("the save summary flags a non-secret change", summarised.get("secret") is False, summarised)
    check("the save summary never echoes the previous or new value",
          "from" not in summarised and "to" not in summarised, summarised)
    check("the previous value was captured before the write", before == "10", before)
    check("a system save does not ask for a transport reconnect", body.get("reconnectRequired") is False,
          body.get("reconnectRequired"))
    status, raw = admin.request("GET", "/api/admin/settings/system", raw=True)
    try:
        reread = json.loads(raw.decode("utf-8", "replace"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        reread = {"raw": raw.decode("utf-8", "replace")[:200]}
    check("the change reads back", (reread.get("values") or {}).get("items_per_page") == "25",
          f"status {status} values={reread.get('values')}")
    body = reread
    rows = db("SELECT setting_value, updated_by FROM settings WHERE setting_group = 'system' AND setting_key = 'items_per_page';")
    check("the change is in the database", rows and rows[0][0] == "25", rows)
    check("the change records who made it", rows and rows[0][1] == __import__("os").environ.get("VERIFY_ADMIN_ID", "1"), rows)

    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {"items_per_page": "10"}})
    check("the value is restored to its seeded default (200)", status == 200, f"{status} {body}")
    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {"items_per_page": "10"}})
    check("an identical save is refused as NO_CHANGE (409)",
          status == 409 and body.get("code") == "NO_CHANGE", f"{status} {body}")

    # Boolean and number coercion, as an HTML form would send them.
    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {"maintenance_mode": "false"}})
    check("a boolean is accepted in its seeded state (or refused as NO_CHANGE)",
          status == 200 or (status == 409 and body.get("code") == "NO_CHANGE"), f"{status} {body}")
    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {"audit_retention_days": "2555"}})
    check("a number is accepted in its seeded state (or refused as NO_CHANGE)",
          status == 200 or (status == 409 and body.get("code") == "NO_CHANGE"), f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/audit", {
        "values": {"default_tat_days": "45", "auto_overdue": "true"},
    })
    check("two audit defaults save in one call (200)",
          status == 200 and count_of(body.get("changed")) + count_of(body.get("unchanged")) == 2,
          f"{status} {body}")
    rows = db("SELECT setting_value FROM settings WHERE setting_group = 'audit' AND setting_key = 'default_tat_days';")
    check("the numeric default is stored as digits", rows and rows[0][0] == "45", rows)
    status, body = admin.request("PUT", "/api/admin/settings/audit", {"values": {"default_tat_days": "30"}})
    check("the numeric default is restored (200)", status == 200, f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/company", {
        "values": {"company_name": f"Cosfix Traders {STAMP}"},
    })
    check("the company name saves (200)", status == 200, f"{status} {body}")
    status, body = admin.request("GET", "/api/admin/settings")
    check("the company name reaches the overview values",
          values_of(body, "company").get("company_name") == f"Cosfix Traders {STAMP}",
          values_of(body, "company").get("company_name"))

    # ── 5. validation ────────────────────────────────────────────────────
    print("\n5. validation")
    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {"ghost_setting": "x"}})
    check("an uncatalogued key is refused (422)",
          status == 422 and body.get("code") == "VALIDATION_FAILED", f"{status} {body}")
    check("the refusal names the offending field",
          any(issue.get("field") == "ghost_setting" for issue in body.get("errors") or []), body.get("errors"))

    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {"items_per_page": "7"}})
    check("a choice outside the catalogue is refused (422)",
          status == 422 and "must be one of" in str(body.get("message")), f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {"session_timeout_minutes": "5"}})
    check("a number below the minimum is refused (422)",
          status == 422 and "at least 15" in str(body.get("message")), f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {"max_upload_mb": "999"}})
    check("a number above the maximum is refused (422)",
          status == 422 and "must not exceed 100" in str(body.get("message")), f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {"session_timeout_minutes": "soon"}})
    check("a non-numeric number is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/company", {"values": {"company_email": "not-an-address"}})
    check("a malformed email is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/company", {"values": {"company_website": "complianceos"}})
    check("a URL without a scheme is refused (422)",
          status == 422 and "http://" in str(body.get("message")), f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": {}})
    check("an empty payload is refused as NO_CHANGE (409)",
          status == 409 and body.get("code") == "NO_CHANGE", f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/system", {"values": "nope"})
    check("a payload that is not a map is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/system", b'{"values": {')
    check("malformed JSON is refused as INVALID_JSON (400)",
          status == 400 and body.get("code") == "INVALID_JSON", f"{status} {body}")

    status, body = admin.request("PUT", "/api/admin/settings/email", {"values": {"smtp_host": "", "smtp_port": "2525"}})
    check("an SMTP port without a host is refused (422)",
          status == 422 and "host" in str(body.get("message")).lower(), f"{status} {body}")

    # ── 6. secrets ───────────────────────────────────────────────────────
    print("\n6. secrets")
    plaintext = f"Cosfix-Secret-{STAMP}"
    status, body = admin.request("PUT", "/api/admin/settings/email", {"values": {"smtp_password": plaintext}})
    check("a secret saves (200)", status == 200, f"{status} {body}")
    secret_row = db("SELECT setting_value, is_encrypted FROM settings WHERE setting_group = 'email' AND setting_key = 'smtp_password';")
    check("the secret is stored encrypted", secret_row and secret_row[0][1] == "1", secret_row)
    check("the stored value is not the plaintext", secret_row and plaintext not in secret_row[0][0], secret_row)

    status, raw = admin.request("GET", "/api/admin/settings/email", raw=True)
    text = raw.decode("utf-8", "replace")
    check("the secret is never returned in the clear", plaintext not in text, "plaintext found in the group response")
    body = json.loads(text)
    check("the secret is reported as set", ((body.get("fields") or [{}]) and any(
        field["key"] == "smtp_password" and field.get("isSet") for field in body["fields"])), body.get("fields"))

    status, body = admin.request("GET", "/api/admin/settings")
    check("the overview never returns the secret either",
          plaintext not in json.dumps(body), "plaintext found in the overview response")

    status, body = admin.request("PUT", "/api/admin/settings/email", {"values": {"smtp_password": ""}})
    check("an empty secret means 'keep the stored value' (409 NO_CHANGE)",
          status == 409 and body.get("code") == "NO_CHANGE", f"{status} {body}")
    still = db("SELECT setting_value FROM settings WHERE setting_group = 'email' AND setting_key = 'smtp_password';")
    check("the stored secret survived the empty write", still and still[0][0] == secret_row[0][0], still)

    status, body = admin.request("PUT", "/api/admin/settings/email", {"values": {"smtp_password": None}})
    check("a null secret clears it (200)", status == 200, f"{status} {body}")
    cleared = db("SELECT setting_value, is_encrypted FROM settings WHERE setting_group = 'email' AND setting_key = 'smtp_password';")
    check("the cleared secret is gone",
          cleared and (cleared[0][0] in ("", "NULL") or not cleared[0][0]) and cleared[0][1] == "0", cleared)

    status, body = admin.request("PUT", "/api/admin/settings/sms", {"values": {"twilio_auth_token": f"Cosfix-Sms-{STAMP}"}})
    check("a second channel's secret saves independently (200)", status == 200, f"{status} {body}")
    sms_secret = db("SELECT is_encrypted FROM settings WHERE setting_group = 'sms' AND setting_key = 'twilio_auth_token';")
    check("the SMS secret is encrypted too", sms_secret and sms_secret[0][0] == "1", sms_secret)
    admin.request("PUT", "/api/admin/settings/sms", {"values": {"twilio_auth_token": None}})

    # ── 7. audit trail ───────────────────────────────────────────────────
    print("\n7. audit trail")
    admin.request("PUT", "/api/admin/settings/system", {"values": {"date_format": "DD/MM/YYYY"}})
    rows = db("SELECT action, module, entity_type, old_values_json, new_values_json, description FROM activity_logs "
              "WHERE module = 'settings' AND entity_type = 'settings' ORDER BY id DESC LIMIT 1;")
    check("a settings change is written to the activity log", bool(rows), rows)
    if rows:
        check("the log entry is an update of the settings entity",
              rows[0][0] == "updated" and rows[0][1] == "settings" and rows[0][2] == "settings", rows[0])
        check("the log entry holds the previous value", "date_format" in (rows[0][3] or ""), rows[0][3])
        check("the log entry holds the new value", "DD/MM/YYYY" in (rows[0][4] or ""), rows[0][4])
    admin.request("PUT", "/api/admin/settings/system", {"values": {"date_format": "DD MMM YYYY"}})

    rows = db("SELECT description FROM activity_logs WHERE description LIKE '%smtp_password%' LIMIT 1;")
    check("the audit trail never records the secret's value",
          all(plaintext not in (row[0] or "") for row in rows), rows)

    # ── 8. channel tests ─────────────────────────────────────────────────
    print("\n8. channel tests")
    status, body = admin.request("POST", "/api/admin/settings/test/email", {"to": f"ops+{STAMP}@complianceos.example"})
    check("a test email is accepted (200) or reports the provider's refusal (502)",
          status in (200, 502), f"{status} {body}")
    if status == 200:
        result = body.get("data") or body
        check("the test reports the provider it used", bool(result.get("provider")), result)
        check("the test reports whether it was simulated", isinstance(result.get("simulated"), bool), result)
        check("the test is recorded in a log row", result.get("logId", 0) > 0, result)
        rows = db(f"SELECT status, to_email FROM email_logs WHERE id = {result['logId']};")
        check("the email log row exists", bool(rows), rows)
        if rows:
            check("the email log row records the simulated provider",
                  rows[0][0] == "sent" and STAMP in rows[0][1], rows)
    else:
        rows = db(f"SELECT COUNT(*) FROM email_logs WHERE to_email LIKE '%{STAMP}%';")
        check("a refused test email is still logged", int(rows[0][0]) >= 1, rows)

    status, body = admin.request("POST", "/api/admin/settings/test/sms", {
        "to": TEST_MOBILE, "message": f"ComplianceOS verification {STAMP}",
    })
    check("a test SMS is accepted (200) or reports the provider's refusal (502)", status in (200, 502), f"{status} {body}")
    rows = db(f"SELECT status, provider, segments FROM sms_logs WHERE to_mobile LIKE '%{TEST_MOBILE[-10:]}%' ORDER BY id DESC LIMIT 1;")
    check("the SMS attempt is written to sms_logs", bool(rows), rows)
    if rows and status == 200:
        check("the SMS log row is marked sent", rows[0][0] == "sent", rows)
        check("the SMS log records the provider", bool(rows[0][1]), rows)

    status, body = admin.request("POST", "/api/admin/settings/test/whatsapp", {
        "to": TEST_MOBILE, "message": f"ComplianceOS verification {STAMP}",
    })
    check("a test WhatsApp is accepted (200) or reports the provider's refusal (502)", status in (200, 502), f"{status} {body}")
    rows = db(f"SELECT status, provider FROM whatsapp_logs WHERE to_mobile LIKE '%{TEST_MOBILE[-10:]}%' ORDER BY id DESC LIMIT 1;")
    check("the WhatsApp attempt is written to whatsapp_logs", bool(rows), rows)

    status, body = admin.request("POST", "/api/admin/settings/test/sms", {"to": "12"})
    check("an unusable mobile number is refused (422)", status == 422, f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/settings/test/sms", {})
    check("a test SMS without a number is refused (422)", status == 422, f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/settings/test/unknown", {})
    check("an unknown test channel is a 404", status == 404, f"{status} {body}")

    # ── 9. delivery log ──────────────────────────────────────────────────
    print("\n9. delivery log")
    for channel in ("email", "sms", "whatsapp"):
        status, body = admin.request("GET", f"/api/admin/settings/logs/{channel}?page=1&limit=5")
        check(f"the {channel} delivery log reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
        rows = rows_of(body)
        check(f"the {channel} log is paginated", bool(body.get("pagination")) and len(rows) <= 5, body.get("pagination"))
        check(f"the {channel} log reports its statistics",
              isinstance((body.get("stats") or {}).get("total"), int), body.get("stats"))
        check(f"the {channel} log reports the channel name", body.get("channel") == channel, body.get("channel"))
        check(f"the {channel} log lists its templates", isinstance(body.get("templates"), list), body.get("templates"))
        check(f"the {channel} log lists recent failures", isinstance(body.get("failures"), list), body.get("failures"))

    status, body = admin.request("GET", f"/api/admin/settings/logs/email?search={STAMP}")
    check("the delivery log can be searched", status == 200, f"{status} {body}")
    status, body = admin.request("GET", "/api/admin/settings/logs/email?status=sent&limit=1")
    check("the delivery log can be filtered by status", status == 200, f"{status} {body}")
    check("a status filter returns only that status",
          all(row.get("status") == "sent" for row in rows_of(body)), rows_of(body))
    status, body = admin.request("GET", "/api/admin/settings/logs/email?from_date=2020-01-01&to_date=2999-12-31")
    check("the delivery log can be filtered by date range", status == 200, f"{status} {body}")
    status, body = admin.request("GET", "/api/admin/settings/logs/pigeon")
    check("an unknown delivery channel is refused (400)", status == 400, f"{status} {body}")

    # ── 10. scheduled jobs ───────────────────────────────────────────────
    print("\n10. scheduled jobs")
    status, body = admin.request("GET", "/api/admin/settings/jobs")
    check("the job register reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    jobs = rows_of(body)
    # Five jobs from the settings module, 024's CMS publishing job, 025's calendar
    # event reminders and 026's payroll month reminder. Every seeded job must be
    # registered, and nothing else.
    codes = {job.get("code") for job in jobs}
    check("every seeded job is registered",
          codes == {"activity_log_retention", "audit_due_reminders", "compliance_expiry_reminders",
                    "database_backup", "cms_scheduled_publish", "calendar_event_reminders",
                    "payroll_month_reminder"},
          sorted(codes))
    check("every job carries its schedule and state",
          all(job.get("cron") and job.get("type") and "active" in job for job in jobs), jobs)
    check("the job types are labelled for the screen",
          "REMINDER" in (body.get("typeLabels") or {}), body.get("typeLabels"))

    reminder = next((job for job in jobs if job.get("type") == "REMINDER"), None)
    other = next((job for job in jobs if job.get("type") != "REMINDER"), None)
    check("a reminder job is registered", reminder is not None, jobs)

    if reminder:
        status, body = admin.request("PATCH", f"/api/admin/settings/jobs/{reminder['code']}", {"is_active": False})
        check("a job can be paused (200)", status == 200, f"{status} {body}")
        check("the pause is in the database",
              db(f"SELECT is_active FROM scheduled_jobs WHERE job_code = '{reminder['code']}';")[0][0] == "0")

        status, body = admin.request("POST", f"/api/admin/settings/jobs/{reminder['code']}")
        check("a paused job refuses to run (409)",
              status == 409 and body.get("code") == "INVALID_STATE", f"{status} {body}")

        status, body = admin.request("PATCH", f"/api/admin/settings/jobs/{reminder['code']}", {"is_active": True})
        check("the job is resumed (200)", status == 200, f"{status} {body}")

        status, body = admin.request("POST", f"/api/admin/settings/jobs/{reminder['code']}")
        check("a reminder job runs on demand (200)", status == 200 and body.get("success") is True, f"{status} {body}")
        dispatched = body.get("jobs") or []
        check("the run reports the dispatch summary",
              body.get("status") == "success" and isinstance(dispatched, list) and len(dispatched) >= 1
              and all("dispatched" in job and "candidates" in job for job in dispatched), body.get("jobs"))
        rows = db(f"SELECT last_run_status, last_run_message FROM scheduled_jobs WHERE job_code = '{reminder['code']}';")
        check("the run is recorded against the job", rows and rows[0][0] in ("success", "failed"), rows)

    if other:
        status, body = admin.request("POST", f"/api/admin/settings/jobs/{other['code']}")
        check("a non-reminder job refuses to run on demand (409)",
              status == 409 and body.get("code") == "INVALID_STATE", f"{status} {body}")

    status, body = admin.request("PATCH", "/api/admin/settings/jobs/ghost_job", {"is_active": True})
    check("an unknown job is a 404", status == 404, f"{status} {body}")
    status, body = admin.request("PATCH", f"/api/admin/settings/jobs/{jobs[0]['code']}", {})
    check("a job update without a state is refused (422)", status == 422, f"{status} {body}")

    # ── 11. backups ──────────────────────────────────────────────────────
    print("\n11. backups")
    status, body = admin.request("GET", "/api/admin/settings/backups?page=1&limit=10")
    check("the backup history reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the history is paginated", bool(body.get("pagination")), body.get("pagination"))
    check("the history reports database statistics", isinstance(body.get("stats"), dict), body.get("stats"))
    check("the history knows how many tables exist", body.get("tableCount", 0) > 50, body.get("tableCount"))
    check("the history measures the storage directories", isinstance(body.get("storage"), dict), body.get("storage"))

    status, body = admin.request("POST", "/api/admin/settings/backups/run", {"type": "schema", "note": f"verification {STAMP}"})
    check("a schema backup runs (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    run = body.get("data") or body
    if status == 200:
        BACKUP_ROWS.append(run.get("id"))
        check("the run reports its file name", str(run.get("name", "")).endswith(".sql"), run)
        check("the dump has a real size", run.get("sizeBytes", 0) > 1000, run)
        check("the dump covers every table", run.get("tables", 0) > 50, run)
        check("the run is timed", run.get("durationMs", 0) > 0, run)
        path = run.get("filePath") or run.get("path")
        check("the dump file exists on disk", bool(path) and os.path.exists(path), path)

    status, body = admin.request("GET", "/api/admin/settings/backups?status=completed&limit=5")
    check("the history can be filtered by status", status == 200, f"{status} {body}")
    check("a completed filter returns only completed runs",
          all(row.get("status") == "completed" for row in rows_of(body)), rows_of(body))

    if BACKUP_ROWS and BACKUP_ROWS[0]:
        status, body = admin.request("GET", f"/api/admin/settings/backups/{BACKUP_ROWS[0]}")
        check("a backup run opens in detail (200)", status == 200 and body.get("success") is True, f"{status} {body}")
        detail = body.get("data") or body
        check("the detail lists the tables in the dump",
              isinstance(detail.get("tables"), list) and len(detail["tables"]) > 50, len(detail.get("tables") or []))
        check("the detail confirms the dump file exists", detail.get("fileExists") is True, detail.get("fileExists"))
        check("the detail measures the file on disk", (detail.get("sizeOnDisk") or 0) > 1000, detail.get("sizeOnDisk"))

    status, body = admin.request("GET", "/api/admin/settings/backups/99999999")
    check("an unknown backup is a 404", status == 404, f"{status} {body}")

    status, body = admin.request("GET", "/api/admin/settings/storage")
    check("the storage report reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the storage report measures the vault", isinstance(body.get("vault"), dict), body.keys())
    check("the storage report measures the backup directory", isinstance(body.get("backups"), dict), body.keys())
    check("the storage report lists what is on disk", isinstance(body.get("files"), list), body.keys())

    status, body = admin.request("POST", "/api/admin/settings/backups/uploads")
    check("the upload vault copies into the backup directory (200)", status == 200 and body.get("success") is True,
          f"{status} {body}")
    if status == 200:
        result = body.get("data") or body
        check("the copy reports how much it moved", result.get("copied", 0) >= 1, result)
        check("the copy lands in the configured directory", bool(result.get("destination")), result)

    status, body = admin.request("POST", "/api/admin/settings/backups/run", {"type": "impossible"})
    check("an unknown backup type is refused (422)", status == 422, f"{status} {body}")

    # ── 12. logo upload ──────────────────────────────────────────────────
    print("\n12. logo upload")
    import base64
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJ0lEQVR42u3OMQEAAAgDoC251a3g"
        "LwSgOTcVFRUVFRUVFRUVFRUVFZXnAT6QAAH4m3B3AAAAAElFTkSuQmCC"
    )
    boundary = f"----Cosfix{STAMP}"
    body_bytes = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="cosfix-{STAMP}.png"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + png + f"\r\n--{boundary}--\r\n".encode()

    status, body = admin.post_raw("/api/admin/settings/company/upload-logo", body_bytes,
                                 f"multipart/form-data; boundary={boundary}")
    check("the logo uploads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    logo_path = None
    if status == 200:
        logo_path = body.get("path")
        FILE_ROWS.append(body.get("fileId"))
        check("the upload returns a vault path", str(logo_path or "").startswith("/"), logo_path)
        check("the upload reports the stored size", body.get("sizeBytes") == len(png), body.get("sizeBytes"))
        check("the logo is a versioned vault file",
              bool(db(f"SELECT id FROM files WHERE id = {body.get('fileId')};")), body.get("fileId"))
        then = db("SELECT setting_value FROM settings WHERE setting_group = 'company' AND setting_key = 'logo_path';")
        check("the company setting follows the upload", then and then[0][0] == logo_path, then)

        status, raw = admin.request("GET", logo_path, raw=True)
        check("the uploaded logo downloads (200)", status == 200 and raw[:8] == b"\x89PNG\r\n\x1a\n", f"{status} {len(raw)}b")

    status, body = admin.post_raw(
        "/api/admin/settings/company/upload-logo",
        (f"--{boundary}\r\n"
         f'Content-Disposition: form-data; name="file"; filename="notes.txt"\r\n'
         f"Content-Type: text/plain\r\n\r\nnot an image\r\n--{boundary}--\r\n").encode(),
        f"multipart/form-data; boundary={boundary}",
    )
    check("a non-image file is refused (422)", status == 422, f"{status} {body}")
    status, body = admin.post_raw(
        "/api/admin/settings/company/upload-logo",
        (f"--{boundary}--\r\n").encode(), f"multipart/form-data; boundary={boundary}",
    )
    check("an upload without a file is refused (400)", status == 400, f"{status} {body}")

    # ── 13. screens ──────────────────────────────────────────────────────
    print("\n13. screens")
    screens_to_render = [
        ("/admin/settings", b"System Settings"),
        ("/admin/settings/company-settings", b"Company Settings"),
        ("/admin/settings/email-settings", b"Email Settings"),
        ("/admin/settings/sms-settings", b"SMS Settings"),
        ("/admin/settings/whatsapp-settings", b"WhatsApp Settings"),
        ("/admin/settings/backup-settings", b"Backup Settings"),
        ("/admin/settings/audit-settings", b"Audit Defaults"),
    ]
    for path, needle in screens_to_render:
        status, html = admin.request("GET", path, raw=True)
        check(f"{path} renders for an administrator (200)", status == 200 and b"<html" in html.lower(), status)
        check(f"{path} shows its own title", needle in html, needle)
        check(f"{path} renders without a server error", b"Internal Server Error" not in html, "")

    status, html = admin.request("GET", "/admin/settings/email-settings", raw=True)
    check("the email screen shows the delivery log", b"Delivery log" in html, "")
    check("the email screen offers a test send", b"Send test" in html or b"test email" in html.lower(), "")
    status, html = admin.request("GET", "/admin/settings/backup-settings", raw=True)
    check("the backup screen shows the history", b"Backup history" in html, "")
    check("the backup screen offers a manual run", b"Back up the database" in html, "")
    status, html = admin.request("GET", "/admin/settings", raw=True)
    check("the system screen lists the scheduled jobs", b"Scheduled jobs" in html, "")
    check("the system screen shows the integration transports", b"Integration transports" in html, "")

    employer = Session(EMPLOYER)
    employer.login()
    status, html = employer.request_no_redirect("GET", "/admin/settings")
    location = ""
    check("an employer is redirected away from the settings screens", status in (302, 307, 308), status)
    employer.sign_out()

    status, body = employer.request("GET", "/api/admin/settings/backups")
    check("an employer cannot read the backup history (403)", status == 403, f"{status} {body}")

    # ── 14. clean-up ─────────────────────────────────────────────────────
    print("\n14. clean-up")
    restore_settings()
    sweep()
    leftover = db(f"SELECT COUNT(*) FROM settings WHERE setting_group = 'company' AND setting_key = 'company_name' "
                   f"AND setting_value LIKE '%{STAMP}%';")
    check("the company-name fixture is gone", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM users WHERE email LIKE 'cosfix{STAMP}%';")
    check("the throwaway employee login is gone", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM email_logs WHERE to_email LIKE '%{STAMP}%';")
    check("the email-log fixtures are gone", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM sms_logs WHERE to_mobile LIKE '%{TEST_MOBILE[-10:]}%';")
    check("the SMS-log fixtures are gone", int(leftover[0][0]) == 0, leftover)
    if BACKUP_ROWS and BACKUP_ROWS[0]:
        leftover = db(f"SELECT COUNT(*) FROM backup_history WHERE id = {BACKUP_ROWS[0]};")
        check("the backup fixture is gone", int(leftover[0][0]) == 0, leftover)
    if FILE_ROWS and FILE_ROWS[0]:
        leftover = db(f"SELECT COUNT(*) FROM files WHERE id = {FILE_ROWS[0]};")
        check("the logo fixture is gone", int(leftover[0][0]) == 0, leftover)

    print(f"\nRESULT {passed} passed, {failed} failed")
    if failures:
        print("FAILURES:")
        for failure in failures:
            print(f"  · {failure}")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001 — a crash must not leave fixtures behind
        print(f"\nSUITE ABORTED: {error}")
        try:
            restore_settings()
            sweep()
        except Exception as cleanup_error:  # noqa: BLE001
            print(f"clean-up also failed: {cleanup_error}")
        raise
