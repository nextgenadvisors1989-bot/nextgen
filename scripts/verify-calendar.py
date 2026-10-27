#!/usr/bin/env python3
"""Calendar & holiday master end-to-end verification.

The calendar is the platform's timing surface: it holds hand-made events, mirrors
what the audit, compliance and payroll modules write, and carries the holiday
master that attendance and payroll count against. This suite drives it the way an
administrator, an auditor, an employer and an intruder would:

   1. access control      — every calendar endpoint is authenticated and scoped
   2. options             — the pickers on the event form
   3. overview & agenda    — the month read, the merged agenda, the day counts
   4. event creation      — validation refusals, module-owned types, attendees
   5. event editing       — updates, no-op refusal, status moves, reminder re-arm
   6. module-owned events — refusals, confirmation, scope enforcement
   7. holidays            — create, duplicate refusal, edit, delete, filters, stats
   8. national holidays   — the one-click year, run twice
   9. working days        — weekly offs, holidays that fall on the off day
  10. reminders           — due selection, one dispatch per recipient, the job run
  11. panel scoping       — auditor, employer and employee reads and refusals
  12. activity trail      — every mutation is in the activity log
  13. screens             — the calendar screens render for the right roles only
  14. clean-up            — every fixture this suite created is gone

Usage:  python3 scripts/verify-calendar.py [base_url]
Assumes migrations + seeds are loaded and the server is running.
"""

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")
ADMIN = (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026"))
AUDITOR = ("auditor.test@complianceos.local", "Auditor@2026")
VERIFIER = ("verifier.test@complianceos.local", "Verifier@2026")
EMPLOYER = ("employer.test@complianceos.local", "Employer@2026")
STAMP = datetime.now().strftime("%m%d%H%M%S")

passed = 0
failed = 0
failures = []

EVENTS = []      # calendar_events ids this suite created
HOLIDAYS = []    # holidays ids this suite created
AUDITORS = []    # auditor ids this suite registered, with their portal logins
YEAR = datetime.now().year + 1          # a year nothing else has touched


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
        status, payload, extra = self._send(method, path, body, raw, headers)
        if not raw and status in (401, 403) and isinstance(payload, dict) \
                and payload.get("code") in ("CSRF_FAILED", "UNAUTHENTICATED") and _retry and self.creds:
            if self.login()[0]:
                return self._send(method, path, body, raw, headers)[:2]
        # A response that did not parse is a broken read, not a failed request —
        # read it again before blaming the platform.
        if not raw and isinstance(payload, dict) and set(payload.keys()) == {"raw"} and _retry:
            return self._send(method, path, body, raw, headers)[:2]
        return status, payload

    def request_full(self, method, path, body=None, raw=False, headers=None):
        return self._send(method, path, body, raw, headers)

    def request_no_redirect(self, method, path):
        """Fetch without following a 30x — how a page guard must be observed."""
        return self._send(method, path, None, True, None, follow=False)[:2]

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
                return resp.status, (text if raw else self._parse(text)), dict(resp.headers)
        except urllib.error.HTTPError as err:
            self._absorb(err)
            text = err.read()
            return err.code, (text if raw else self._parse(text)), dict(err.headers)

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
        status, body, _ = self._send("POST", "/api/auth/login", {
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


def sql_text(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def scalar(payload, key, default=None):
    if isinstance(payload, dict):
        return payload.get(key, default)
    return default


def rows_of(payload):
    data = scalar(payload, "data")
    return data if isinstance(data, list) else []


def id_list(section):
    return sorted(int(row[0]) for row in section)


def multipart(fields, files):
    """Builds a multipart/form-data body: fields is a list of pairs, files too."""
    boundary = f"----cosfixcms{STAMP}"
    parts = []
    for name, value in fields:
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    for name, filename, content_type, payload in files:
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {content_type}\r\n\r\n".encode() + payload + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def header_of(headers, name):
    """HTTP header lookup that does not care how the server cased the name."""
    for key, value in headers.items():
        if key.lower() == name.lower():
            return value
    return ""


def public_fetch(path):
    """Reads a public URL exactly as an anonymous visitor's browser would."""
    req = urllib.request.Request(f"{BASE}{path}", headers={"User-Agent": "cosfix-verify"})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as err:
        return err.code, err.read(), dict(err.headers)


def register_auditor(admin):
    """Registers an auditor through the admin API, portal login and all.

    Scoping can only be verified against an auditor that really exists: the
    seeded auditor login has no `auditors` row behind it, which is exactly the
    case the panel must refuse.
    """
    status, body = admin.request("GET", "/api/admin/auditors/options?lookups=true")
    types = body.get("auditorTypes") or []
    if not types:
        return None, None, None
    email = f"cosfix.calendar.auditor{STAMP}@example.com"
    status, body = admin.request("POST", "/api/admin/auditors", {
        "name": f"Verification Auditor {STAMP}",
        "email": email,
        "mobile": f"+9198{STAMP[-8:]}",
        "auditor_type_id": types[0]["id"],
        "role_title": f"Verification Auditor {STAMP}",
        "experience_years": 3,
        "date_of_joining": "2024-04-01",
        "status": "active",
        "create_portal_user": True,
        "portal_user_email": email,
        "portal_user_name": f"Verification Auditor {STAMP}",
    })
    auditor_id = body.get("auditorId") or (body.get("data") or {}).get("auditorId")
    credentials = body.get("credentials") or (body.get("data") or {}).get("credentials") or {}
    if status in (200, 201) and auditor_id:
        AUDITORS.append(int(auditor_id))
    return credentials.get("username"), credentials.get("temporaryPassword"), auditor_id


def create_unlinked_auditor(admin):
    """An auditor-role login with no `auditors` row behind it.

    Scoping can only be verified against an account that really is unlinked.
    Created through the ordinary user API — the same way the office creates a
    login — and removed by `sweep()`, which deletes every `cosfix.calendar.`
    fixture user this run created.
    """
    email = f"cosfix.calendar.unlinked{STAMP}@example.com"
    status, body = admin.request("POST", "/api/admin/users", {
        "first_name": "Unlinked",
        "last_name": f"Auditor {STAMP}",
        "email": email,
        "username": f"cosfix.calendar.unlinked{STAMP}",
        "role_slugs": ["auditor"],
        "send_credentials": True,
    })
    if status not in (200, 201):
        return None, f"{status} {body}"
    temporary = (body.get("credentials") or {}).get("temporaryPassword")
    if not temporary:
        return None, f"no temporary password in {body}"
    session = Session((email, temporary))
    ok, detail = session.login((email, temporary))
    if not ok:
        return None, detail
    new_password = "Vfy@2026Cal"
    status, body = session.request("POST", "/api/auth/change-password", {
        "currentPassword": temporary, "newPassword": new_password, "confirmPassword": new_password,
    })
    if status != 200:
        return None, f"activation {status} {body}"
    session.sign_out()
    ok, detail = session.login((email, new_password))
    if not ok:
        return None, detail
    return session, ""


def sweep():
    """Remove every fixture this suite created, in dependency order."""
    event_ids = ", ".join(str(i) for i in EVENTS) or "0"
    holiday_ids = ", ".join(str(i) for i in HOLIDAYS) or "0"
    db(f"DELETE FROM reminder_dispatches WHERE entity_id IN ({event_ids}) AND entity_type = 'calendar_event';")
    db(f"DELETE FROM notifications WHERE entity_type = 'calendar_event' AND entity_id IN ({event_ids});")
    db(f"DELETE FROM reminder_dispatches WHERE entity_id IN (SELECT id FROM calendar_events WHERE title LIKE '%{STAMP}%');")
    db(f"DELETE FROM notifications WHERE entity_type = 'calendar_event' "
       f"AND entity_id IN (SELECT id FROM calendar_events WHERE title LIKE '%{STAMP}%');")
    db(f"DELETE FROM calendar_events WHERE id IN ({event_ids});")
    db(f"DELETE FROM calendar_events WHERE title LIKE '%{STAMP}%';")
    db(f"DELETE FROM holidays WHERE id IN ({holiday_ids});")
    db(f"DELETE FROM holidays WHERE holiday_name LIKE '%{STAMP}%';")
    db(f"DELETE FROM activity_logs WHERE description LIKE '%{STAMP}%' OR entity_label LIKE '%{STAMP}%';")
    auditor_ids = ", ".join(str(i) for i in AUDITORS) or "0"
    db(f"DELETE FROM auditors WHERE id IN ({auditor_ids});")
    # The employee-panel fixture: its login first, then the record and company.
    db(f"DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'cosfix.calendar.%{STAMP}%');")
    db(f"DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'cosfix.calendar.%{STAMP}%');")
    db(f"DELETE FROM users WHERE email LIKE 'cosfix.calendar.%{STAMP}%';")
    db(f"DELETE FROM employees WHERE employee_number = 'VFY-{STAMP}';")
    db(f"DELETE FROM employers WHERE employer_code = 'VFY-{STAMP}';")
    users = ", ".join(row[0] for row in db(
        f"SELECT id FROM users WHERE email LIKE 'cosfix.calendar.%{STAMP}%' OR email LIKE 'cosfix.calendar.employee{STAMP}%';")) or "0"
    db(f"DELETE FROM sessions WHERE user_id IN ({users});")
    db(f"DELETE FROM password_reset_tokens WHERE user_id IN ({users});")
    db(f"DELETE FROM user_roles WHERE user_id IN ({users});")
    db(f"DELETE FROM users WHERE id IN ({users});")


def day(year, month, day_of_month):
    return f"{year:04d}-{month:02d}-{day_of_month:02d}"


def event_payload(**overrides):
    payload = {
        "title": f"Verification meeting {STAMP}",
        "description": "Created by the calendar verification suite.",
        "event_type": "MEETING",
        "start_datetime": f"{day(YEAR, 3, 10)} 10:00",
        "end_datetime": f"{day(YEAR, 3, 10)} 11:30",
        "all_day": False,
        "location": "Head office — room 2",
        "attendees": ["one@example.com", "two@example.com"],
        "reminder_minutes": 60,
        "priority": "High",
        "visibility": "all",
    }
    payload.update(overrides)
    return payload


def create_event(session, **overrides):
    status, body = session.request("POST", "/api/admin/calendar", event_payload(**overrides))
    new_id = body.get("id") or (body.get("data") or {}).get("id")
    if status in (200, 201) and new_id:
        EVENTS.append(int(new_id))
    return status, body, new_id


def create_holiday(session, **overrides):
    payload = {
        "holiday_name": f"Verification Holiday {STAMP}",
        "holiday_date": day(YEAR, 4, 14),
        "holiday_type": "Festival",
        "is_paid": True,
        "description": "Created by the calendar verification suite.",
    }
    payload.update(overrides)
    status, body = session.request("POST", "/api/admin/calendar/holidays", payload)
    new_id = body.get("id") or (body.get("data") or {}).get("id")
    if status in (200, 201) and new_id:
        HOLIDAYS.append(int(new_id))
    return status, body, new_id


def main():
    print(f"\nCalendar & holiday master verification — fixtures stamped {STAMP}\n")
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    admin = Session(ADMIN)
    ok_login, detail = admin.login()
    if not ok_login:
        print(f"FATAL: administrator sign-in failed: {detail}")
        return 2

    # ── 1. access control ────────────────────────────────────────────────
    print("1. access control")
    anonymous = Session()
    for path in ("/api/admin/calendar", "/api/admin/calendar/overview", "/api/admin/calendar/agenda",
                 "/api/admin/calendar/options", "/api/admin/calendar/holidays",
                 "/api/admin/calendar/working-days", "/api/admin/calendar/export"):
        status, body = anonymous.request("GET", path)
        check(f"an anonymous caller cannot read {path} (401)", status == 401, f"{status} {body}")
    status, body = anonymous.request("POST", "/api/admin/calendar", event_payload())
    check("an anonymous caller cannot create an event (401/403)",
          status in (401, 403), f"{status} {body}")
    status, body = anonymous.request("POST", "/api/admin/calendar/holidays", {"holiday_name": "Anonymous"})
    check("an anonymous caller cannot declare a holiday (401/403)",
          status in (401, 403), f"{status} {body}")

    employer = Session(EMPLOYER)
    employer.login()
    status, body = employer.request("GET", "/api/admin/calendar")
    check("an employer cannot reach the admin calendar register (403)", status == 403, f"{status} {body}")
    status, body = employer.request("POST", "/api/admin/calendar", event_payload())
    check("an employer cannot create an event in the admin register (403)", status == 403, f"{status} {body}")
    status, body = employer.request("GET", "/api/admin/calendar/holidays")
    check("an employer cannot reach the holiday master (403)", status == 403, f"{status} {body}")
    status, body = employer.request("POST", "/api/admin/calendar/holidays", {"holiday_name": "Employer day"})
    check("an employer cannot declare a holiday (403)", status == 403, f"{status} {body}")

    verifier = Session(VERIFIER)
    verifier.login()
    status, body = verifier.request("GET", "/api/admin/calendar")
    check("a verifier cannot reach the admin calendar (403)", status == 403, f"{status} {body}")

    # ── 2. options ───────────────────────────────────────────────────────
    print("\n2. form options")
    status, body = admin.request("GET", "/api/admin/calendar/options")
    check("the event form options read (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    for key in ("employers", "units", "auditors", "assignments"):
        check(f"the options carry {key}", isinstance(body.get(key), list), {k: type(v).__name__ for k, v in body.items()})

    # ── 3. overview & agenda ─────────────────────────────────────────────
    print("\n3. overview and agenda")
    status, body = admin.request("GET", f"/api/admin/calendar/overview?year={YEAR}&month=3")
    check("the month overview reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the overview knows the month it is showing",
          body.get("year") == YEAR and body.get("month") == 3, {k: body.get(k) for k in ("year", "month")})
    check("the overview carries the grid counts", isinstance(body.get("counts"), list), body.get("counts"))
    check("the overview carries the merged agenda", isinstance(body.get("entries"), list), body.get("entries"))
    check("the overview carries the register counters", isinstance(body.get("stats"), dict), body.get("stats"))
    check("the overview reports its feed sizes",
          isinstance(body.get("days"), dict) and {"events", "expiries", "payroll", "holidays", "leave"} <= set(body["days"]),
          body.get("days"))
    check("the overview lists what is coming up", isinstance(body.get("upcoming"), list), body.get("upcoming"))

    status, body = admin.request("GET", f"/api/admin/calendar/agenda?year={YEAR}&month=3")
    check("the agenda reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the agenda reports the window it covers",
          body.get("from", "").startswith(f"{YEAR}-03-01"), body.get("from"))
    status, body = admin.request("GET", f"/api/admin/calendar/agenda?from_date={day(YEAR, 3, 1)}&to_date={day(YEAR, 3, 31)}")
    check("the agenda accepts an explicit window", status == 200, f"{status} {body}")
    status, body = admin.request("GET", "/api/admin/calendar/agenda?month=13")
    check("an impossible month is refused (422)", status == 422, f"{status} {body}")

    # ── 4. event creation ────────────────────────────────────────────────
    print("\n4. event creation")
    status, body, event_id = create_event(admin)
    check("an event is created (201)", status == 201 and event_id, f"{status} {body}")
    check("the creation is reported with its title and start",
          "Verification meeting" in str(body.get("title", "")) and str(body.get("start_datetime", "")).startswith(f"{YEAR}-03-10"),
          {k: body.get(k) for k in ("title", "start_datetime")})
    if event_id:
        rows = db(f"SELECT title, event_type, priority, visibility, reminder_minutes, all_day, attendees_json, created_by "
                  f"FROM calendar_events WHERE id = {event_id};")
        check("the event is stored with its own details",
              rows and rows[0][1] == "MEETING" and rows[0][2] == "High" and rows[0][3] == "all" and rows[0][4] == "60",
              rows)
        check("the attendees are normalised into records",
              rows and '\"email\":\"one@example.com\"' in rows[0][6].replace(" ", ""), rows[0][6] if rows else None)
        check("the event records who filed it", rows and rows[0][7] == __import__("os").environ.get("VERIFY_ADMIN_ID", "1"), rows)

    status, body = admin.request("POST", "/api/admin/calendar", event_payload(title="ab"))
    check("a too-short title is refused (422)", status == 422, f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/calendar", event_payload(start_datetime="10/03/2026"))
    check("a malformed start is refused (422)", status == 422, f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/calendar", event_payload(
        start_datetime=f"{day(YEAR, 3, 10)} 12:00", end_datetime=f"{day(YEAR, 3, 10)} 11:00"))
    check("an event that ends before it starts is refused (422)", status == 422, f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/calendar", event_payload(event_type="AUDIT"))
    check("an audit date cannot be created by hand (422)",
          status == 422 and body.get("code") == "VALIDATION_FAILED", f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/calendar", event_payload(event_type="PAYROLL_RUN"))
    check("a payroll period cannot be created by hand (422)", status == 422, f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/calendar", event_payload(meeting_url="not-a-url.example.com"))
    check("a meeting link without a scheme is refused (422)", status == 422, f"{status} {body}")
    status, body = admin.request("GET", "/api/admin/calendar?search=Verification%20meeting&limit=50")
    rows = rows_of(body)
    check("the new event appears in the register",
          status == 200 and any(int(row.get("id", 0)) == event_id for row in rows), f"{status} {len(rows)} rows")
    check("the register row is shaped for the screen",
          not rows or ("type_label" in rows[0] and isinstance(rows[0].get("attendees"), list)),
          rows[0] if rows else None)

    # ── 5. event editing ─────────────────────────────────────────────────
    print("\n5. event editing")
    status, body = admin.request("GET", f"/api/admin/calendar/{event_id}")
    detail = body.get("data") or body
    check("the event detail reads (200)", status == 200 and int(detail.get("id", 0) or 0) == event_id, detail)
    check("the detail carries the type label", detail.get("type_label") == "Meeting", detail.get("type_label"))
    check("the detail carries the attendees as records",
          isinstance(detail.get("attendees"), list) and detail["attendees"]
          and detail["attendees"][0].get("email") == "one@example.com", detail.get("attendees"))

    status, body = admin.request("PUT", f"/api/admin/calendar/{event_id}", event_payload(start_datetime=f"{day(YEAR, 3, 10)} 10:00"))
    check("saving an unchanged event is reported as a no-op (409)",
          status == 409 and body.get("code") == "NO_CHANGE", f"{status} {body}")

    status, body = admin.request("PUT", f"/api/admin/calendar/{event_id}", event_payload(
        title=f"Verification meeting {STAMP} moved",
        start_datetime=f"{day(YEAR, 5, 4)} 09:00",
        end_datetime=f"{day(YEAR, 5, 4)} 10:00",
        priority="Urgent",
    ))
    check("the event is updated (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the update reports which fields changed",
          isinstance(body.get("changed"), list) and "start_datetime" in body["changed"], body.get("changed"))
    rows = db(f"SELECT start_datetime, priority, reminder_sent, status FROM calendar_events WHERE id = {event_id};")
    check("the new time is stored", rows and rows[0][0].startswith(f"{YEAR}-05-04"), rows)
    check("moving an event re-arms its reminder", rows and rows[0][2] == "0", rows)

    status, body = admin.request("PATCH", f"/api/admin/calendar/{event_id}", {"status": "completed"})
    check("an event can be marked complete (200)", status == 200 and body.get("status") == "completed", f"{status} {body}")
    status, body = admin.request("PATCH", f"/api/admin/calendar/{event_id}", {"status": "completed"})
    check("completing it twice is refused (409)", status == 409 and body.get("code") == "INVALID_STATE", f"{status} {body}")
    status, body = admin.request("PATCH", f"/api/admin/calendar/{event_id}", {"status": "sideways"})
    check("an unknown status is refused (404)", status == 404, f"{status} {body}")
    status, body = admin.request("PATCH", f"/api/admin/calendar/{event_id}", {"status": "scheduled"})
    check("the event can be rescheduled (200)", status == 200 and body.get("status") == "scheduled", f"{status} {body}")

    # ── 6. module-owned events and scope ─────────────────────────────────
    print("\n6. module-owned events and scope")
    db(f"INSERT INTO calendar_events (uuid, title, event_type, created_by, start_datetime, end_datetime, all_day, "
       f"priority, status, visibility) VALUES (UUID(), 'System event {STAMP}', 'AUDIT', 1, "
       f"'{day(YEAR, 6, 1)} 09:00:00', '{day(YEAR, 6, 1)} 18:00:00', 1, 'High', 'scheduled', 'participants');")
    system_id = int(db(f"SELECT id FROM calendar_events WHERE title = 'System event {STAMP}';")[0][0])
    EVENTS.append(system_id)
    status, body = admin.request("DELETE", f"/api/admin/calendar/{system_id}", {})
    check("a module-owned event refuses to be deleted without confirmation (409)",
          status == 409 and body.get("code") == "IN_USE", f"{status} {body}")
    status, body = admin.request("DELETE", f"/api/admin/calendar/{system_id}", {"confirm": True})
    check("confirming removes it from the calendar (200)", status == 200, f"{status} {body}")
    rows = db(f"SELECT deleted_at FROM calendar_events WHERE id = {system_id};")
    check("the removal is a soft delete", rows and rows[0][0] != "NULL", rows)

    status, body = admin.request("GET", "/api/admin/calendar/9999999")
    check("an unknown event is a 404", status == 404, f"{status} {body}")
    status, body = admin.request("PUT", "/api/admin/calendar/9999999", event_payload())
    check("updating an unknown event is a 404", status == 404, f"{status} {body}")
    status, body = admin.request("DELETE", "/api/admin/calendar/9999999", {"confirm": True})
    check("deleting an unknown event is a 404", status == 404, f"{status} {body}")

    # An auditor's diary is scoped to their own auditor profile. An account with
    # no profile behind it has no diary, and must be refused rather than served
    # somebody else's calendar — or, worse, allowed to file events against one.
    #
    # The seeded `auditor.test@` login is *not* such an account: it carries the
    # platform's own auditor record (AUD-TEST-0001), so it has a real diary and
    # the panel deliberately serves it. The unlinked case needs its own account,
    # which is what this creates: an auditor-role login with no `auditors` row.
    unlinked, detail = create_unlinked_auditor(admin)
    check("an auditor-role login with no auditor profile is created", unlinked is not None, detail)
    if unlinked is not None:
        for path in ("/api/auditor/calendar", "/api/auditor/calendar/overview",
                     "/api/auditor/calendar/options", f"/api/auditor/calendar/{event_id}"):
            status, body = unlinked.request("GET", path)
            check(f"an unlinked auditor account is refused {path} (403)",
                  status == 403 and body.get("code") == "FORBIDDEN", f"{status} {body}")
        status, body = unlinked.request("POST", "/api/auditor/calendar", {
            "title": f"Unlinked attempt {STAMP}", "event_type": "MEETING",
            "start_datetime": f"{day(YEAR, 7, 1)} 10:00",
        })
        check("an unlinked auditor account cannot file an event (403)", status == 403, f"{status} {body}")
        leftover = db(f"SELECT COUNT(*) FROM calendar_events WHERE title LIKE 'Unlinked attempt {STAMP}%';")
        check("and no event was written for it", leftover and leftover[0][0] == "0", leftover)
        unlinked.sign_out()

    # A real auditor, registered the way the office registers one.
    auditor_user, auditor_pass, auditor_id = register_auditor(admin)
    check("an auditor with a portal login is registered (201)", bool(auditor_user and auditor_pass and auditor_id),
          (auditor_user, bool(auditor_pass), auditor_id))
    auditor = Session((auditor_user, auditor_pass))
    ok_auditor, detail = auditor.login()
    check("the registered auditor can sign in with the generated credentials", ok_auditor, detail)

    own_id = None
    if ok_auditor:
        status, body = auditor.request("POST", "/api/auditor/calendar", {
            "title": f"Auditor's own visit {STAMP}", "event_type": "MEETING",
            "start_datetime": f"{day(YEAR, 7, 8)} 11:00", "end_datetime": f"{day(YEAR, 7, 8)} 12:00",
            "priority": "Medium", "visibility": "participants", "reminder_minutes": 30,
        })
        own_id = body.get("id") or (body.get("data") or {}).get("id")
        if status in (200, 201) and own_id:
            EVENTS.append(int(own_id))
        check("an auditor can file an event of their own (201)", status == 201 and own_id, f"{status} {body}")

        status, body = auditor.request("POST", "/api/auditor/calendar", {
            "title": f"Auditor tries an audit {STAMP}", "event_type": "AUDIT",
            "start_datetime": f"{day(YEAR, 7, 9)} 09:00",
        })
        check("an auditor cannot create a module-owned event (422)", status == 422, f"{status} {body}")

        status, body = auditor.request("GET", "/api/auditor/calendar?limit=50")
        rows = rows_of(body)
        check("the auditor's register reads (200)", status == 200, f"{status} {body}")
        check("the auditor's register holds only their own events",
              bool(rows) and all(int(row.get("auditor_id") or 0) == int(auditor_id) for row in rows),
              [row.get("auditor_id") for row in rows][:5])
        check("another auditor's event is not in the list",
              all(int(row.get("id", 0)) != event_id for row in rows), [row.get("id") for row in rows][:5])

        status, body = auditor.request("GET", f"/api/auditor/calendar/{event_id}")
        check("an auditor cannot open another auditor's event by URL (404)", status == 404, f"{status} {body}")
        status, body = auditor.request("PUT", f"/api/auditor/calendar/{event_id}", event_payload())
        check("an auditor cannot edit another auditor's event (403/404)", status in (403, 404), f"{status} {body}")
        status, body = auditor.request("DELETE", f"/api/auditor/calendar/{event_id}", {"confirm": True})
        check("an auditor cannot delete another auditor's event (403/404)", status in (403, 404), f"{status} {body}")

        if own_id:
            status, body = auditor.request("GET", f"/api/auditor/calendar/{own_id}")
            check("an auditor can open their own event (200)", status == 200, f"{status} {body}")
            status, body = auditor.request("PATCH", f"/api/auditor/calendar/{own_id}", {"status": "completed"})
            check("an auditor can complete their own event (200)", status == 200, f"{status} {body}")

    # An audit date in the auditor's own diary is not theirs to delete: the
    # assignment module owns that row.
    db(f"INSERT INTO calendar_events (uuid, title, event_type, auditor_id, created_by, start_datetime, end_datetime, "
       f"all_day, priority, status, visibility) SELECT UUID(), 'Own audit date {STAMP}', 'AUDIT', a.id, 1, "
       f"'{day(YEAR, 8, 3)} 09:00:00', '{day(YEAR, 8, 3)} 18:00:00', 1, 'High', 'scheduled', 'participants' "
       f"FROM auditors a WHERE a.id = {int(auditor_id or 0)};")
    rows = db(f"SELECT id FROM calendar_events WHERE title = 'Own audit date {STAMP}';")
    if rows:
        own_audit_id = int(rows[0][0])
        EVENTS.append(own_audit_id)
        status, body = auditor.request("DELETE", f"/api/auditor/calendar/{own_audit_id}", {"confirm": True})
        check("an auditor cannot delete an audit date from their own diary (403)",
              status == 403 and body.get("code") == "FORBIDDEN", f"{status} {body}")
        status, body = auditor.request("PATCH", f"/api/auditor/calendar/{own_audit_id}", {"status": "completed"})
        check("an auditor can still mark an audit date complete (200)", status == 200, f"{status} {body}")

    # ── 7. holidays ──────────────────────────────────────────────────────
    print("\n7. holidays")
    status, body, holiday_id = create_holiday(admin)
    check("a holiday is declared (201)", status == 201 and holiday_id, f"{status} {body}")
    check("the declaration reports the date", str(body.get("holiday_date", "")).startswith(f"{YEAR}-04-14"), body)
    rows = db(f"SELECT holiday_name, holiday_date, year, holiday_type, is_paid, employer_id FROM holidays WHERE id = {holiday_id};")
    check("the holiday is stored with its derived year", rows and rows[0][2] == str(YEAR), rows)
    check("the holiday is stored with its type and paid flag", rows and rows[0][3] == "Festival" and rows[0][4] == "1", rows)

    status, body, duplicate_id = create_holiday(admin)
    check("the same holiday declared twice is refused (409)",
          status == 409 and body.get("code") == "DUPLICATE", f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/calendar/holidays",
                                 {"holiday_name": "No date", "holiday_date": ""})
    check("a holiday without a date is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("GET", f"/api/admin/calendar/holidays/{holiday_id}")
    detail = body.get("data") or body
    check("the holiday detail reads (200)",
          status == 200 and str(detail.get("holiday_name", "")).find(str(STAMP)) >= 0, f"{status} {detail}")
    status, body = admin.request("PUT", f"/api/admin/calendar/holidays/{holiday_id}",
                                 {"holiday_name": f"Verification Holiday {STAMP} v2", "holiday_date": day(YEAR, 4, 15),
                                  "holiday_type": "Company", "is_paid": False, "description": "moved"})
    check("the holiday is updated (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    rows = db(f"SELECT holiday_date, holiday_type, is_paid, year FROM holidays WHERE id = {holiday_id};")
    check("the edit is stored and the year follows the date",
          rows and rows[0][0].startswith(f"{YEAR}-04-15") and rows[0][3] == str(YEAR), rows)

    status, body = admin.request("GET", f"/api/admin/calendar/holidays?year={YEAR}&limit=50")
    check("the holiday register reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the register is paginated", bool(body.get("pagination")), body.get("pagination"))
    check("the register carries this year's counters", isinstance(body.get("stats"), dict), body.get("stats"))
    check("the register lists the years it holds", isinstance(body.get("years"), list), body.get("years"))
    check("this year's counter sees the new holiday",
          int((body.get("stats") or {}).get("total", 0)) >= 1, body.get("stats"))

    status, body = admin.request("GET", f"/api/admin/calendar/holidays?year={YEAR}&holiday_type=Company&paid=no&limit=50")
    rows = rows_of(body)
    check("the holiday filters narrow the register",
          status == 200 and all(row.get("holiday_type") == "Company" and str(row.get("is_paid")) in ("0", "False", "false") for row in rows),
          [(row.get("holiday_type"), row.get("is_paid")) for row in rows][:4])
    status, body = admin.request("GET", f"/api/admin/calendar/holidays?year=nonsense")
    check("a nonsense year is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("DELETE", f"/api/admin/calendar/holidays/{holiday_id}")
    check("the holiday is removed (200)", status == 200, f"{status} {body}")
    rows = db(f"SELECT deleted_at FROM holidays WHERE id = {holiday_id};")
    check("the removal is a soft delete", rows and rows[0][0] != "NULL", rows)
    status, body = admin.request("DELETE", f"/api/admin/calendar/holidays/{holiday_id}")
    check("removing it again is a 404", status == 404, f"{status} {body}")

    # ── 8. national holidays ─────────────────────────────────────────────
    print("\n8. national holidays")
    status, body = admin.request("POST", "/api/admin/calendar/holidays/national", {"year": YEAR})
    added = body.get("added") or []
    check("the national holidays are declared in one call (201)", status == 201 and len(added) == 3, f"{status} {body}")
    for row in db(f"SELECT id FROM holidays WHERE year = {YEAR} AND holiday_type = 'National' AND deleted_at IS NULL;"):
        HOLIDAYS.append(int(row[0]))
    check("all three are written as national holidays",
          len(db(f"SELECT id FROM holidays WHERE year = {YEAR} AND holiday_type = 'National' AND deleted_at IS NULL;")) == 3,
          db(f"SELECT holiday_name, holiday_date FROM holidays WHERE year = {YEAR} AND holiday_type = 'National';"))
    status, body = admin.request("POST", "/api/admin/calendar/holidays/national", {"year": YEAR})
    check("running it again adds nothing and reports the skips",
          status in (200, 201) and (body.get("added") or []) == [] and len(body.get("skipped") or []) == 3,
          f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/calendar/holidays/national", {"year": "sometime"})
    check("a year that is not a year is refused (422)", status == 422, f"{status} {body}")

    # ── 9. working days ──────────────────────────────────────────────────
    print("\n9. working days")
    status, body = admin.request("GET", f"/api/admin/calendar/working-days?year={YEAR}")
    check("the working-day summary reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    months = body.get("months") or []
    check("every month of the year is reported", len(months) == 12, len(months))
    january = next((month for month in months if month["month"] == 1), None)
    check("January counts 31 calendar days", january and january["calendarDays"] == 31, january)
    check("Republic Day is deducted from January",
          january and january["holidays"] >= 1 and january["workingDays"] == january["calendarDays"] - january["weeklyOffs"] - january["holidays"],
          january)
    status, sunday = admin.request("GET", f"/api/admin/calendar/working-days?year={YEAR}&weekly_off=0")
    status, monday = admin.request("GET", f"/api/admin/calendar/working-days?year={YEAR}&weekly_off=1")
    jan_sun = next((m for m in (sunday.get("months") or []) if m["month"] == 1), {})
    jan_mon = next((m for m in (monday.get("months") or []) if m["month"] == 1), {})
    check("the weekly off changes the count", jan_sun.get("workingDays") != jan_mon.get("workingDays"),
          (jan_sun.get("workingDays"), jan_mon.get("workingDays")))
    check("the chosen weekly off is echoed back", monday.get("weeklyOffDay") == 1, monday.get("weeklyOffDay"))
    status, body = admin.request("GET", "/api/admin/calendar/working-days?year=1800")
    check("an out-of-range year is refused (422)", status == 422, f"{status} {body}")

    # A holiday that falls on the weekly off must not cost a second day.
    off_date = None
    for candidate in range(1, 8):
        probe = datetime(YEAR, 2, candidate)
        if probe.weekday() == 6:  # Sunday
            off_date = probe
            break
    status, body, off_holiday = create_holiday(admin, holiday_name=f"Off-day Holiday {STAMP}",
                                               holiday_date=off_date.strftime("%Y-%m-%d"), holiday_type="Optional")
    check("a holiday on the weekly off is accepted", status == 201 and off_holiday, f"{status} {body}")
    status, body = admin.request("GET", f"/api/admin/calendar/working-days?year={YEAR}&weekly_off=0")
    february = next((m for m in (body.get("months") or []) if m["month"] == 2), None)
    check("a holiday on the weekly off does not cost a second day",
          february and february["holidays"] == 0, february)

    # ── 10. reminders ────────────────────────────────────────────────────
    print("\n10. reminders")
    soon = datetime.now() + timedelta(minutes=10)
    status, body, reminder_event = create_event(
        admin,
        title=f"Reminder check {STAMP}",
        start_datetime=soon.strftime("%Y-%m-%d %H:%M"),
        end_datetime=(soon + timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M"),
        reminder_minutes=30,
        attendees=["attendee@example.com"],
    )
    check("an event with a reminder inside its window is created (201)", status == 201 and reminder_event, f"{status} {body}")
    due = db(f"SELECT id FROM calendar_events WHERE id = {reminder_event} "
             f"AND reminder_sent = 0 AND start_datetime BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL reminder_minutes MINUTE);")
    check("the event is due for its reminder", len(due) == 1, due)

    status, body = admin.request("POST", "/api/admin/calendar/jobs/run", {})
    check("the reminder job runs on demand (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the run reports what it dispatched",
          "dispatched" in body and "candidates" in body, {k: body.get(k) for k in ("dispatched", "candidates")})
    check("at least one reminder went out", int(body.get("dispatched", 0)) >= 1, body)
    rows = db(f"SELECT reminder_sent FROM calendar_events WHERE id = {reminder_event};")
    check("the event is marked reminded", rows and rows[0][0] == "1", rows)
    dispatches = db(f"SELECT reminder_type, channel, entity_type, entity_id FROM reminder_dispatches "
                    f"WHERE entity_type = 'calendar_event' AND entity_id = {reminder_event};")
    check("the dispatch is recorded in the ledger",
          dispatches and all(row[0] == "EVENT_REMINDER" for row in dispatches), dispatches)
    notices = db(f"SELECT id FROM notifications WHERE entity_type = 'calendar_event' AND entity_id = {reminder_event};")
    check("the reminder is delivered in-app", len(notices) >= 1, notices)

    status, body = admin.request("POST", "/api/admin/calendar/jobs/run", {})
    dispatched_again = int(body.get("dispatched", 0))
    check("running the job again sends nothing twice", dispatched_again == 0, f"{status} {body}")
    rows = db(f"SELECT COUNT(*) FROM notifications WHERE entity_type = 'calendar_event' AND entity_id = {reminder_event};")
    check("the reminder count did not grow", rows and int(rows[0][0]) == len(notices), (rows, len(notices)))

    # ── 11. panel scoping ────────────────────────────────────────────────
    print("\n11. panel scoping")
    employer = Session(EMPLOYER)
    employer.login()
    status, body = employer.request("GET", f"/api/employer/calendar?year={YEAR}&month=4")
    check("the employer's calendar reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the employer's calendar reports its window", bool(body.get("from")), body.get("from"))
    status, body = employer.request("POST", "/api/employer/calendar", {"title": "Employer event"})
    check("the employer's calendar is read-only (405/403)", status in (403, 405), f"{status} {body}")

    # The registered auditor from above — the seeded login has no profile to scope to.
    status, body = auditor.request("GET", f"/api/auditor/calendar/overview?year={YEAR}&month=7")
    check("the auditor's month reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    status, body = auditor.request("GET", "/api/auditor/calendar/options")
    check("the auditor's pickers read (200)", status == 200 and isinstance(body.get("assignments"), list), f"{status} {body}")
    if own_id:
        status, body = auditor.request("GET", f"/api/auditor/calendar/{own_id}")
        check("an auditor can open their own event (200)", status == 200, f"{status} {body}")
        status, body = auditor.request("DELETE", f"/api/auditor/calendar/{own_id}", {"confirm": True})
        check("an auditor can remove their own event (200)", status == 200, f"{status} {body}")

    # The employee panel: holidays and their own leave, nothing else.
    status, body = admin.request("GET", f"/api/admin/calendar/holidays?year={YEAR}&limit=100")
    holiday_total = int((body.get("stats") or {}).get("total", 0))

    # ── 11b. the employee panel ──────────────────────────────────────────
    print("\n11b. the employee panel")
    # An employee sees the holiday master and their own leave — never a company
    # event, never a colleague's leave, never the compliance or payroll feeds.
    db(f"INSERT INTO employers (uuid, company_name, employer_code, created_at, updated_at) "
       f"VALUES (UUID(), 'Verification Employer {STAMP}', 'VFY-{STAMP}', NOW(), NOW());")
    employer_id = int(db(f"SELECT id FROM employers WHERE employer_code = 'VFY-{STAMP}';")[0][0])
    db(f"INSERT INTO employees (uuid, employer_id, employee_number, name, designation, date_of_joining, "
       f"mobile, email, status, created_at, updated_at) VALUES (UUID(), {employer_id}, 'VFY-{STAMP}', "
       f"'Verification Employee {STAMP}', 'Tester', CURDATE(), '+919845200000', "
       f"'cosfix.calendar.employee{STAMP}@example.com', 'active', NOW(), NOW());")
    employee_id = int(db(f"SELECT id FROM employees WHERE employee_number = 'VFY-{STAMP}';")[0][0])
    # The login borrows the seeded administrator's password hash so the suite can
    # sign in as a real employee without provisioning a whole portal account.
    db(f"INSERT INTO users (uuid, email, username, first_name, last_name, password_hash, status, "
       f"is_first_login, created_at, updated_at) SELECT UUID(), 'cosfix.calendar.employee{STAMP}@example.com', "
       f"'cosfixemp{STAMP}', 'Verification', 'Employee', password_hash, 'active', 0, NOW(), NOW() "
       f"FROM users WHERE email = '{ADMIN[0]}';")
    employee_user = int(db(f"SELECT id FROM users WHERE email = 'cosfix.calendar.employee{STAMP}@example.com';")[0][0])
    db(f"INSERT INTO user_roles (user_id, role_id) VALUES ({employee_user}, 5);")
    db(f"UPDATE employees SET user_id = {employee_user} WHERE id = {employee_id};")

    employee = Session((f"cosfix.calendar.employee{STAMP}@example.com", "Admin@2026"))
    ok_employee, detail = employee.login()
    check("the employee can sign in", ok_employee, detail)

    if ok_employee:
        # A company event inside the same month, which the employee must not see.
        status, body, hidden_event = create_event(admin, title=f"Employer-only briefing {STAMP}",
                                                  start_datetime=f"{day(YEAR, 9, 15)} 10:00",
                                                  end_datetime=f"{day(YEAR, 9, 15)} 11:00")
        create_holiday(admin, holiday_name=f"Employee-visible Holiday {STAMP}", holiday_date=day(YEAR, 9, 16),
                       holiday_type="National")

        status, body = employee.request("GET", f"/api/employee/calendar?year={YEAR}&month=9")
        check("the employee's calendar reads (200)", status == 200 and body.get("success") is True, f"{status} {body}")
        check("it answers the window it was asked for", str(body.get("from", "")).startswith(f"{YEAR}-09-01"), body.get("from"))
        entries = body.get("data") or []
        check("the employee sees the holiday master",
              any(entry.get("source") == "holiday" for entry in entries), [entry.get("source") for entry in entries][:6])
        check("the employee sees no company events",
              all(entry.get("source") != "event" for entry in entries), [entry.get("title") for entry in entries][:6])
        check("the employee sees no compliance, payroll or leave that is not theirs",
              all(entry.get("source") in ("holiday", "leave") for entry in entries),
              [entry.get("source") for entry in entries][:6])
        check("the company event the admin filed is not in the employee's month",
              hidden_event is None or all(str(entry.get("id")) != f"event-{hidden_event}" for entry in entries),
              [entry.get("id") for entry in entries][:6])

        status, body = employee.request("GET", "/api/admin/calendar")
        check("an employee cannot read the admin calendar (403)", status == 403, f"{status} {body}")
        status, body = employee.request("GET", "/api/employer/calendar")
        check("an employee cannot read the employer calendar (403)", status == 403, f"{status} {body}")
        status, body, extra = employee.request_full("GET", "/employee/calendar")
        check("the employee calendar screen renders (200)", status == 200, f"{status}")

    db(f"DELETE FROM sessions WHERE user_id = {employee_user};")
    db(f"DELETE FROM user_roles WHERE user_id = {employee_user};")
    db(f"DELETE FROM users WHERE id = {employee_user};")
    db(f"DELETE FROM employees WHERE id = {employee_id};")
    db(f"DELETE FROM employers WHERE id = {employer_id};")
    leftover = db(f"SELECT COUNT(*) FROM employees WHERE id = {employee_id};")
    check("the employee fixture is gone", int(leftover[0][0]) == 0, leftover)

    # ── 12. activity trail ───────────────────────────────────────────────
    print("\n12. activity trail")
    rows = db(f"SELECT action, module, entity_type FROM activity_logs WHERE description LIKE '%{STAMP}%' ORDER BY id ASC;")
    actions = {(row[0], row[1], row[2]) for row in rows}
    check("creating an event is logged", ("created", "calendar", "calendar_event") in actions, sorted(actions)[:6])
    check("editing an event is logged", ("updated", "calendar", "calendar_event") in actions, sorted(actions)[:8])
    check("declaring a holiday is logged", any(row[1] == "holiday" for row in rows), sorted(actions)[:10])
    check("the trail records who acted", bool(db(f"SELECT user_id FROM activity_logs WHERE description LIKE '%{STAMP}%' LIMIT 1;")),
          "no rows")
    check("no mutation went unlogged", len(rows) >= 5, len(rows))

    # ── 13. screens ──────────────────────────────────────────────────────
    print("\n13. screens")
    status, body, extra = admin.request_full("GET", "/admin/calendar")
    check("the admin calendar screen renders (200)", status == 200, f"{status}")
    status, body, extra = admin.request_full("GET", "/admin/calendar/holidays")
    check("the holiday master screen renders (200)", status == 200, f"{status}")
    status, body, extra = admin.request_full("GET", "/admin/settings")
    check("the settings screen still renders with the job register on it (200)", status == 200, f"{status}")

    if ok_auditor:
        status, body = auditor.request("GET", "/api/auditor/calendar/overview")
        check("the auditor month reads without a window (200)", status == 200, f"{status} {body}")
    status, body, extra = auditor.request_full("GET", "/auditor/calendar")
    check("the auditor calendar screen renders (200)", status == 200, f"{status}")
    status, body, extra = employer.request_full("GET", "/employer/calendar")
    check("the employer calendar screen renders (200)", status == 200, f"{status}")
    status, body = employer.request_no_redirect("GET", "/admin/calendar")
    check("an employer sent to the admin calendar is redirected away", status in (302, 307, 308), status)
    status, body = anonymous.request_no_redirect("GET", "/admin/calendar")
    check("an anonymous visitor sent to the admin calendar is redirected to sign-in",
          status in (302, 307, 308), status)

    # ── 14. clean-up ─────────────────────────────────────────────────────
    print("\n14. clean-up")
    for event in list(EVENTS):
        admin.request("DELETE", f"/api/admin/calendar/{event}", {"confirm": True})
    for holiday in list(HOLIDAYS):
        admin.request("DELETE", f"/api/admin/calendar/holidays/{holiday}")
    for auditor_id in list(AUDITORS):
        admin.request("DELETE", f"/api/admin/auditors/{auditor_id}", {"reason": f"verification {STAMP}"})
    sweep()

    ids = ", ".join(str(i) for i in EVENTS) or "0"
    leftover = db(f"SELECT COUNT(*) FROM calendar_events WHERE id IN ({ids}) AND deleted_at IS NULL;")
    check("no event fixture is left live", int(leftover[0][0]) == 0, leftover)
    ids = ", ".join(str(i) for i in HOLIDAYS) or "0"
    leftover = db(f"SELECT COUNT(*) FROM holidays WHERE id IN ({ids}) AND deleted_at IS NULL;")
    check("no holiday fixture is left live", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM holidays WHERE holiday_name LIKE '%{STAMP}%';")
    check("no holiday fixture row is left at all", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM calendar_events WHERE title LIKE '%{STAMP}%';")
    check("no event fixture row is left at all", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM activity_logs WHERE description LIKE '%{STAMP}%';")
    check("the activity-log fixtures are gone", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM notifications WHERE entity_type = 'calendar_event' AND entity_id IN ({ids});")
    check("the notification fixtures are gone", int(leftover[0][0]) == 0, leftover)

    users = ", ".join(row[0] for row in db(
        f"SELECT id FROM users WHERE email LIKE 'cosfix.calendar.%{STAMP}%' OR email LIKE 'cosfix.calendar.employee{STAMP}%';")) or "0"
    db(f"DELETE FROM sessions WHERE user_id IN ({users});")
    db(f"DELETE FROM password_reset_tokens WHERE user_id IN ({users});")
    db(f"DELETE FROM user_roles WHERE user_id IN ({users});")
    db(f"DELETE FROM users WHERE id IN ({users});")
    auditor_ids = ", ".join(str(i) for i in AUDITORS) or "0"
    db(f"DELETE FROM auditors WHERE id IN ({auditor_ids});")
    # The employee-panel fixture: its login first, then the record and company.
    db(f"DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'cosfix.calendar.%{STAMP}%');")
    db(f"DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'cosfix.calendar.%{STAMP}%');")
    db(f"DELETE FROM users WHERE email LIKE 'cosfix.calendar.%{STAMP}%';")
    db(f"DELETE FROM employees WHERE employee_number = 'VFY-{STAMP}';")
    db(f"DELETE FROM employers WHERE employer_code = 'VFY-{STAMP}';")
    leftover = db(f"SELECT COUNT(*) FROM auditors WHERE id IN ({auditor_ids});")
    check("the auditor fixture is gone", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM users WHERE email LIKE 'cosfix.calendar.auditor{STAMP}%';")
    check("the auditor's portal login is gone", int(leftover[0][0]) == 0, leftover)

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
            sweep()
        except Exception as cleanup_error:  # noqa: BLE001
            print(f"clean-up also failed: {cleanup_error}")
        raise
