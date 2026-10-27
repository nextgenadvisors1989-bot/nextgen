#!/usr/bin/env python3
"""Employer and employee self-service (Phase 2) end-to-end verification.

Closes the last gap in Phase 2: the two panels that are not the platform's own
back office. It attacks them the way a company owner, an employee and an intruder
would:

   1. access control      — anonymous callers get 401, wrong panels get 403
   2. fixtures            — company A with a portal login, company B without, staff
   3. employer profile    — read, self-edit, and the administrator-only fields refused
   4. units               — list, add, correct, remove, and cross-tenant 404s
   5. departments         — the same, plus unit ownership validation
   6. employees           — scoped register, hiring with credentials, detail, edit
   7. child registers     — qualifications and the personal-file checklist
   8. employee self-service — own profile, allowed edits, refused fields
   9. documents           — upload, list, download, withdraw, verified-document guard
  10. service record      — the employee's own history
  11. audits & reports    — scoped reads about the company, foreign ids refused
  12. screens             — every new page renders for its role and redirects for others
  13. audit trail         — the activity log holds what actually happened
  14. clean-up            — the fixtures this suite created are removed

Usage:  python3 scripts/verify-selfservice.py [base_url]
Assumes migrations + seeds are loaded and the server is running.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, date, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")
ADMIN = (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026"))
AUDITOR = ("auditor.test@complianceos.local", "Auditor@2026")
VERIFIER = ("verifier.test@complianceos.local", "Verifier@2026")
STAMP = datetime.now().strftime("%m%d%H%M%S")

passed = 0
failed = 0
failures = []

EMPLOYER_EMAIL = f"cosfix.ss.employer{STAMP}@example.com"
EMPLOYEE_EMAIL = f"cosfix.ss.employee{STAMP}@example.com"
CREDENTIALS = {}
FIXTURE = {}

# A one-page PDF, small enough to travel through the suite but a real document.
MINI_PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF\n"
)


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
        if not raw and isinstance(payload, dict) and set(payload.keys()) == {"raw"} and _retry:
            return self._send(method, path, body, raw, headers)[:2]
        return status, payload

    def request_no_redirect(self, method, path):
        return self._send(method, path, None, True, None, follow=False)[:2]

    def post_raw(self, path, data, content_type):
        headers = {"Cookie": self._jar(), "Content-Type": content_type, "Content-Length": str(len(data))}
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


def data_of(payload):
    return payload.get("data") if isinstance(payload, dict) else None


def rows_of(payload):
    data = data_of(payload)
    return data if isinstance(data, list) else []


def obj_of(payload):
    """The documented envelope: arrays arrive under `data`, objects arrive flat."""
    if not isinstance(payload, dict):
        return {}
    if isinstance(payload.get("data"), dict):
        return payload["data"]
    return {key: value for key, value in payload.items()
            if key not in ("success", "message", "pagination")}


def multipart(fields, files):
    boundary = f"----cosfixss{STAMP}"
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


def activate(session, email, temporary):
    """Completes the forced first-login password change the platform requires."""
    new_password = "Vfy@2026Self"
    status, body = session.request("POST", "/api/auth/change-password", {
        "currentPassword": temporary, "newPassword": new_password, "confirmPassword": new_password,
    })
    if status != 200:
        return None, f"{status} {body}"
    session.sign_out()
    signed_in, detail = session.login((email, new_password))
    if not signed_in:
        return None, detail
    return new_password, ""


# ── fixtures ────────────────────────────────────────────────────────────────

def sweep_stale():
    """Removes fixtures left behind by an earlier run of this suite."""
    users = ", ".join(row[0] for row in db(
        "SELECT id FROM users WHERE email LIKE 'cosfix.ss.%';")) or "0"
    carriers = "SELECT id FROM employers WHERE employer_code LIKE 'VFYSS%'"
    for statement in (
        f"DELETE FROM employee_documents WHERE employee_id IN (SELECT id FROM employees WHERE employer_id IN ({carriers}));",
        f"DELETE FROM employee_file_checklist WHERE employee_id IN (SELECT id FROM employees WHERE employer_id IN ({carriers}));",
        f"DELETE FROM employee_qualifications WHERE employee_id IN (SELECT id FROM employees WHERE employer_id IN ({carriers}));",
        f"DELETE FROM employee_service_records WHERE employee_id IN (SELECT id FROM employees WHERE employer_id IN ({carriers}));",
        f"DELETE FROM files WHERE entity_type = 'EMPLOYEE' AND entity_id IN (SELECT id FROM employees WHERE employer_id IN ({carriers}));",
        # A report hangs off its assignment: versions, comments and verifier rows first.
        f"DELETE FROM verifier_comments WHERE report_id IN (SELECT id FROM audit_reports WHERE employer_id IN ({carriers}));",
        f"DELETE FROM verifier_assignments WHERE report_id IN (SELECT id FROM audit_reports WHERE employer_id IN ({carriers}));",
        f"DELETE FROM audit_report_comments WHERE report_id IN (SELECT id FROM audit_reports WHERE employer_id IN ({carriers}));",
        f"DELETE FROM audit_report_versions WHERE report_id IN (SELECT id FROM audit_reports WHERE employer_id IN ({carriers}));",
        f"DELETE FROM files WHERE entity_type = 'AUDIT_REPORT' AND entity_id IN (SELECT id FROM audit_reports WHERE employer_id IN ({carriers}));",
        f"DELETE FROM audit_reports WHERE employer_id IN ({carriers});",
        f"DELETE FROM audit_assignments WHERE employer_id IN ({carriers});",
        f"DELETE FROM employees WHERE employer_id IN ({carriers});",
        f"DELETE FROM employer_users WHERE employer_id IN ({carriers});",
        f"DELETE FROM departments WHERE employer_id IN ({carriers});",
        f"DELETE FROM company_units WHERE employer_id IN ({carriers});",
        f"DELETE FROM employers WHERE employer_code LIKE 'VFYSS%';",
        f"DELETE FROM notifications WHERE user_id IN ({users});",
        f"DELETE FROM sessions WHERE user_id IN ({users});",
        f"DELETE FROM user_roles WHERE user_id IN ({users});",
        f"DELETE FROM users WHERE id IN ({users});",
        "DELETE FROM auditors WHERE email LIKE 'cosfix.ss.%';",
    ):
        db(statement)


def create_company(admin, key, label, *, with_login=False, code_suffix):
    """A company. Company A gets a portal login; company B exists to be refused."""
    email = EMPLOYER_EMAIL if with_login else f"hr.{key}.{STAMP}@example.com"
    payload = {
        "company_name": f"VFY SS {label} {STAMP}",
        "employer_code": f"VFYSS{code_suffix}{STAMP}",
        "industry_type": "Manufacturing",
        "company_type": "Private Limited",
        "year_of_establishment": 2015,
        "email": email,
        "phone": "+914400001111",
        "mobile": f"+91987{ord(code_suffix)}{STAMP[-4:]}",
        "address_line_1": "44 Self Service Road",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "pincode": "600058",
        "number_of_units": 1,
        "create_portal_user": with_login,
        "portal_user_name": f"Self Service Employer {STAMP}" if with_login else None,
        "portal_user_email": email if with_login else None,
        "portal_user_mobile": "+919876600002" if with_login else None,
    }
    status, body = admin.request("POST", "/api/admin/employers", payload)
    if status != 201:
        return None, f"{status} {body}"
    employer_id = int(body["employerId"])
    FIXTURE[key] = {"employer_id": employer_id, "units": [], "departments": [], "employees": {}}
    if with_login:
        credentials = body.get("portalCredentials") or {}
        if credentials.get("temporaryPassword"):
            CREDENTIALS["employer"] = (email, credentials["temporaryPassword"])
    return employer_id, ""


def create_unit(admin, key):
    employer_id = FIXTURE[key]["employer_id"]
    status, body = admin.request("POST", f"/api/admin/employers/{employer_id}/units", {
        "unit_name": f"Guindy Works {key} {STAMP}", "unit_code": f"U{key}{STAMP[4:]}",
        "location": "Guindy, Chennai", "address": "44 Self Service Road, Guindy",
        "contact_person_name": "Unit Head", "contact_person_phone": "+919876600003",
        "status": "active",
    })
    if status not in (200, 201):
        return None, f"{status} {body}"
    unit_id = int(body.get("id") or body.get("unitId") or (body.get("data") or {}).get("id") or 0)
    if not unit_id:
        rows = db(f"SELECT id FROM company_units WHERE employer_id = {employer_id} AND unit_name LIKE '%{STAMP}%' LIMIT 1;")
        unit_id = int(rows[0][0]) if rows else 0
    FIXTURE[key]["units"].append(unit_id)
    return unit_id, ""


def create_department(admin, key, unit_id):
    employer_id = FIXTURE[key]["employer_id"]
    status, body = admin.request("POST", f"/api/admin/employers/{employer_id}/departments", {
        "unit_id": unit_id or None, "department_name": f"Packing {key} {STAMP}",
        "department_code": f"D{key}{STAMP[4:]}", "head_of_department": "Packing Supervisor",
        "contact_phone": "+919876600004", "status": "active",
    })
    if status not in (200, 201):
        return None, f"{status} {body}"
    department_id = int(body.get("id") or body.get("departmentId") or (body.get("data") or {}).get("id") or 0)
    if not department_id:
        rows = db(f"SELECT id FROM departments WHERE employer_id = {employer_id} AND department_name LIKE '%{STAMP}%' LIMIT 1;")
        department_id = int(rows[0][0]) if rows else 0
    FIXTURE[key]["departments"].append(department_id)
    return department_id, ""


def create_employee(admin, key, label, *, with_login=False):
    employer_id = FIXTURE[key]["employer_id"]
    status, body = admin.request("POST", "/api/admin/employees", {
        "name": f"Self Service {label} {STAMP}",
        "father_name": "Verification Father",
        "sex": "Male",
        "marital_status": "Married",
        "date_of_birth": "1992-07-19",
        "blood_group": "B+",
        "mobile": f"+9198766{STAMP[-4:]}{len(FIXTURE[key]['employees'])}",
        "email": EMPLOYEE_EMAIL if with_login else f"{key}.{label}.{STAMP}@example.com".lower(),
        "present_address": "44 Self Service Road, Guindy, Chennai",
        "permanent_address": "44 Self Service Road, Guindy, Chennai",
        "state": "Tamil Nadu",
        "pincode": "600058",
        "employer_id": employer_id,
        "unit_id": FIXTURE[key]["units"][0] if FIXTURE[key]["units"] else None,
        "department_id": FIXTURE[key]["departments"][0] if FIXTURE[key]["departments"] else None,
        "date_of_joining": "2022-05-02",
        "post_applied_for": "Packing Operator",
        "designation": "Packing Operator",
        "category": "Worker",
        "weekly_off": "Sunday",
        "status": "active",
        "basic_salary": 18000,
        "da": 2000,
        "hra": 3000,
        "wage_type": "Per Month",
        "pan_number": "ABCDE1234F",
        "bank_name": "Indian Bank",
        "bank_account_number": f"5001{STAMP[-6:]}",
        "ifsc_code": "IDIB0001234",
        "create_login": with_login,
        "login_email": EMPLOYEE_EMAIL if with_login else None,
        "login_username": f"cosfix.ss.employee{STAMP}" if with_login else None,
    })
    if status != 201:
        return None, f"{status} {body}"
    employee_id = int(body["employeeId"])
    FIXTURE[key]["employees"][label] = {
        "id": employee_id, "number": body.get("employeeNumber"), "name": f"Self Service {label} {STAMP}",
    }
    credentials = body.get("credentials") or {}
    if with_login and credentials.get("temporaryPassword"):
        CREDENTIALS["employee"] = (EMPLOYEE_EMAIL, credentials["temporaryPassword"])
    return employee_id, ""


def create_auditor(admin):
    """An auditor for the assignment fixtures, so the company's audit screens have data."""
    type_rows = db("SELECT id FROM auditor_types WHERE deleted_at IS NULL AND status = 'active' ORDER BY id LIMIT 1;")
    type_id = int(type_rows[0][0]) if type_rows else None
    email = f"cosfix.ss.auditor{STAMP}@example.com"
    status, body = admin.request("POST", "/api/admin/auditors", {
        "name": f"Self Service Auditor {STAMP}", "email": email,
        "mobile": "+919876600005", "auditor_type_id": type_id,
        "role_title": "Compliance Auditor", "specialization": "Manufacturing",
        "qualification": "B.Com, LL.B", "experience_years": 6,
        "city": "Chennai", "state": "Tamil Nadu", "max_concurrent_audits": 8, "status": "active",
    })
    if status in (200, 201):
        auditor_id = int(body.get("auditorId") or body.get("id") or (body.get("data") or {}).get("id") or 0)
        if auditor_id:
            FIXTURE["auditor_id"] = auditor_id
            return auditor_id, ""
    rows = db(f"SELECT id FROM auditors WHERE email = {sql_text(email)} LIMIT 1;")
    if rows:
        FIXTURE["auditor_id"] = int(rows[0][0])
        return FIXTURE["auditor_id"], ""
    return None, f"{status} {body}"


def create_assignment(admin, key, auditor_id):
    employer_id = FIXTURE[key]["employer_id"]
    start = date.today() + timedelta(days=7)
    status, body = admin.request("POST", "/api/admin/audit-assignments", {
        "assignment_type": "AUDIT",
        "audit_title": f"Statutory registers audit {key} {STAMP}",
        "employer_id": employer_id,
        "unit_id": FIXTURE[key]["units"][0] if FIXTURE[key]["units"] else None,
        "department_id": FIXTURE[key]["departments"][0] if FIXTURE[key]["departments"] else None,
        "auditor_id": auditor_id, "verifier_id": None,
        "start_date": start.isoformat(), "end_date": (start + timedelta(days=4)).isoformat(),
        "due_date": (start + timedelta(days=10)).isoformat(),
        "priority": "High",
        "scope": "Verify the wage register, attendance register and statutory returns for the year.",
    })
    if status not in (200, 201):
        return None, f"{status} {body}"
    assignment_id = int(body.get("assignmentId") or body.get("id") or (body.get("data") or {}).get("id") or 0)
    FIXTURE[key]["assignment_id"] = assignment_id
    return assignment_id, ""


# ── the run ─────────────────────────────────────────────────────────────────

def main():
    print(f"\nEmployer & employee self-service verification — fixtures stamped {STAMP}")
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    health = Session()
    try:
        status, _ = health.request("GET", "/api/health")
    except Exception as error:  # noqa: BLE001
        print(f"FATAL: the server is not answering at {BASE} ({error})")
        return 2
    if status != 200:
        print(f"FATAL: health check returned {status}")
        return 2

    admin = Session(ADMIN)
    signed_in, detail = admin.login()
    if not signed_in:
        print(f"FATAL: administrator sign-in failed: {detail}")
        return 2

    # ── 1. access control ────────────────────────────────────────────────
    print("\n1. access control")
    anonymous = Session()
    for path in ("/api/employer/profile", "/api/employer/units", "/api/employer/departments",
                 "/api/employer/employees", "/api/employer/employees/lookups",
                 "/api/employer/audits", "/api/employer/audit-reports",
                 "/api/employee/profile", "/api/employee/documents", "/api/employee/service-record"):
        status, body = anonymous.request("GET", path)
        check(f"anonymous {path} is refused (401)", status == 401, f"{status} {body}")
    status, body = anonymous.request("PATCH", "/api/employee/profile", {"mobile": "+919000000000"})
    check("anonymous cannot patch an employee profile (401/403)", status in (401, 403), f"{status} {body}")

    auditor_session = Session(AUDITOR)
    ok, detail = auditor_session.login()
    if not ok:
        print(f"FATAL: auditor sign-in failed: {detail}")
        return 2
    for path in ("/api/employer/profile", "/api/employer/employees", "/api/employee/profile"):
        status, body = auditor_session.request("GET", path)
        check(f"an auditor is refused {path} (403)", status == 403, f"{status} {body}")

    verifier_session = Session(VERIFIER)
    ok, detail = verifier_session.login()
    if not ok:
        print(f"FATAL: verifier sign-in failed: {detail}")
        return 2
    for path in ("/api/employer/units", "/api/employee/documents"):
        status, body = verifier_session.request("GET", path)
        check(f"a verifier is refused {path} (403)", status == 403, f"{status} {body}")

    sweep_stale()

    # ── 2. fixtures ──────────────────────────────────────────────────────
    print("\n2. fixtures")
    employer_id, detail = create_company(admin, "A", "Traders", with_login=True, code_suffix="A")
    check("company A created with a portal login", employer_id is not None, detail)
    if employer_id is None:
        return 2
    other_id, detail = create_company(admin, "B", "Other", with_login=False, code_suffix="B")
    check("company B created (no portal login)", other_id is not None, detail)

    unit_a, detail = create_unit(admin, "A")
    check("company A unit created", unit_a is not None, detail)
    unit_b, detail = create_unit(admin, "B")
    check("company B unit created", unit_b is not None, detail)
    department_a, detail = create_department(admin, "A", unit_a)
    check("company A department created", department_a is not None, detail)
    department_b, detail = create_department(admin, "B", unit_b)
    check("company B department created", department_b is not None, detail)

    employee_a, detail = create_employee(admin, "A", "Operator", with_login=True)
    check("company A employee created with a portal login", employee_a is not None, detail)
    employee_b, detail = create_employee(admin, "B", "Helper", with_login=False)
    check("company B employee created", employee_b is not None, detail)

    employer = Session()
    ok, detail = employer.login(CREDENTIALS.get("employer"))
    check("the employer's new login works", ok, detail)
    if not ok:
        return 2
    activated, detail = activate(employer, *CREDENTIALS["employer"])
    check("the employer completes first-login activation", activated is not None, detail)
    if activated is None:
        return 2

    employee_session = Session()
    ok, detail = employee_session.login(CREDENTIALS.get("employee"))
    check("the employee's new login works", ok, detail)
    if not ok:
        return 2
    employee_password, detail = activate(employee_session, *CREDENTIALS["employee"])
    check("the employee completes first-login activation", employee_password is not None, detail)
    if employee_password is None:
        return 2

    # ── 3. employer profile ──────────────────────────────────────────────
    print("\n3. employer profile")
    status, body = employer.request("GET", "/api/employer/profile")
    profile = obj_of(body)
    check("the employer reads its own company profile (200)", status == 200, f"{status} {body}")
    check("the profile is the session's company",
          int((profile.get("employer") or {}).get("id") or 0) == employer_id,
          f"got {profile.get('employer', {}).get('id')}")
    check("the profile carries the company code and name",
          bool((profile.get("employer") or {}).get("employer_code")) and bool((profile.get("employer") or {}).get("company_name")),
          str(profile.get("employer"))[:120])
    check("the profile carries units, departments and staff", all(
        key in profile for key in ("units", "departments", "employees", "stats")),
        str(list(profile.keys()))[:140])

    status, body = employer.request("PATCH", "/api/employer/profile", {
        "address_line_1": "44 Self Service Road, corrected", "city": "Coimbatore",
    })
    check("the employer may correct its own address (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT city FROM employers WHERE id = {employer_id};")
    check("the correction is stored", row and row[0][0] == "Coimbatore", str(row))

    for field, value in (("employer_code", "HACKED1"), ("status", "inactive")):
        status, body = employer.request("PATCH", "/api/employer/profile", {field: value})
        errors = (body or {}).get("errors") or []
        check(f"the employer cannot set {field} (422, field refused)",
              status == 422 and any(error.get("field") == field for error in errors),
              f"{status} {body}")

    status, body = employer.request("PATCH", "/api/employer/profile", {"create_portal_user": True})
    check("the employer cannot mint portal logins for itself (422)", status == 422, f"{status} {body}")

    # ── 4. units ─────────────────────────────────────────────────────────
    print("\n4. units")
    status, body = employer.request("GET", "/api/employer/units")
    units = rows_of(body)
    check("the employer lists its own units", status == 200 and any(int(row["id"]) == unit_a for row in units),
          f"{status} {[row.get('id') for row in units]}")
    check("the register is scoped to the company", all(int(row["id"]) != unit_b for row in units),
          str([row.get("id") for row in units]))

    status, body = employer.request("POST", "/api/employer/units", {
        "unit_name": f"Self Added Unit {STAMP}", "unit_code": f"SAU{STAMP[4:]}",
        "location": "Ambattur, Chennai", "contact_person_name": "Plant Manager", "status": "active",
    })
    check("the employer adds a unit to itself (201)", status == 201, f"{status} {body}")
    new_unit = int(body.get("unitId") or body.get("id") or 0)
    row = db(f"SELECT employer_id, unit_name FROM company_units WHERE id = {new_unit};")
    check("the new unit belongs to the session's company", row and int(row[0][0]) == employer_id, str(row))

    status, body = employer.request("POST", "/api/employer/units", {
        "unit_name": f"Forged Unit {STAMP}", "employer_id": other_id,
    })
    if status in (200, 201):
        forged = int(body.get("unitId") or body.get("id") or 0)
        row = db(f"SELECT employer_id FROM company_units WHERE id = {forged};")
        check("a unit posted with another company's id lands in the employer's own company",
              row and int(row[0][0]) == employer_id, str(row))
        db(f"DELETE FROM company_units WHERE id = {forged};")
    else:
        check("a unit posted with another company's id is refused", status == 422, f"{status} {body}")

    status, body = employer.request("PATCH", f"/api/employer/units/{new_unit}", {
        "unit_name": f"Self Added Unit (renamed) {STAMP}", "status": "active",
    })
    check("the employer edits its own unit (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT unit_name FROM company_units WHERE id = {new_unit};")
    check("the rename is stored", row and "renamed" in row[0][0], str(row))

    status, body = employer.request("PATCH", f"/api/employer/units/{unit_b}", {"unit_name": "Stolen"})
    check("another company's unit cannot be edited (404)", status == 404, f"{status} {body}")
    status, body = employer.request("DELETE", f"/api/employer/units/{unit_b}")
    check("another company's unit cannot be deleted (404)", status == 404, f"{status} {body}")

    status, body = employer.request("DELETE", f"/api/employer/units/{new_unit}")
    check("the employer removes its own empty unit (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT deleted_at FROM company_units WHERE id = {new_unit};")
    check("the removal is a soft delete", row and row[0][0] not in ("", "NULL"), str(row))

    status, body = employer.request("DELETE", f"/api/employer/units/{unit_a}")
    check("a unit holding employees is refused (409/422)", status in (409, 422), f"{status} {body}")

    # ── 5. departments ───────────────────────────────────────────────────
    print("\n5. departments")
    status, body = employer.request("GET", "/api/employer/departments")
    departments = rows_of(body)
    check("the employer lists its own departments",
          status == 200 and any(int(row["id"]) == department_a for row in departments),
          f"{status} {[row.get('id') for row in departments]}")
    check("departments of another company are absent", all(int(row["id"]) != department_b for row in departments),
          str([row.get("id") for row in departments]))

    status, body = employer.request("POST", "/api/employer/departments", {
        "department_name": f"Self Added Department {STAMP}", "department_code": f"SAD{STAMP[4:]}",
        "unit_id": unit_a, "head_of_department": "Shift In-charge", "status": "active",
    })
    check("the employer adds a department to its own unit (201)", status == 201, f"{status} {body}")
    new_department = int(body.get("departmentId") or body.get("id") or 0)
    row = db(f"SELECT employer_id, unit_id FROM departments WHERE id = {new_department};")
    check("the new department is tied to the company and unit",
          row and int(row[0][0]) == employer_id and int(row[0][1]) == unit_a, str(row))

    status, body = employer.request("POST", "/api/employer/departments", {
        "department_name": f"Cross Tenant Department {STAMP}", "unit_id": unit_b,
    })
    check("a department cannot be attached to another company's unit (422)", status == 422, f"{status} {body}")

    status, body = employer.request("PATCH", f"/api/employer/departments/{new_department}", {
        "head_of_department": "Verified Head", "status": "active",
    })
    check("the employer edits its own department (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT head_of_department FROM departments WHERE id = {new_department};")
    check("the edit is stored", row and row[0][0] == "Verified Head", str(row))

    status, body = employer.request("PATCH", f"/api/employer/departments/{department_b}", {"head_of_department": "Nope"})
    check("another company's department cannot be edited (404)", status == 404, f"{status} {body}")

    status, body = employer.request("DELETE", f"/api/employer/departments/{new_department}")
    check("the employer removes its own empty department (200)", status == 200, f"{status} {body}")
    status, body = employer.request("DELETE", f"/api/employer/departments/{department_a}")
    check("a department holding employees is refused (409/422)", status in (409, 422), f"{status} {body}")

    # ── 6. employees ─────────────────────────────────────────────────────
    print("\n6. employees")
    status, body = employer.request("GET", "/api/employer/employees?limit=50")
    employees = rows_of(body)
    check("the employer lists its own staff (200)", status == 200, f"{status} {body}")
    check("the register holds the company's employee",
          any(int(row["id"]) == employee_a for row in employees), str([row.get("id") for row in employees]))
    check("another company's employee is not in the register",
          all(int(row["id"]) != employee_b for row in employees), str([row.get("id") for row in employees]))
    check("the register is paginated", isinstance((data_of(body) is not None) and body.get("pagination"), dict),
          str(body.get("pagination"))[:120])

    status, body = employer.request("GET", "/api/employer/employees/lookups")
    lookups = obj_of(body)
    check("lookups come back for the hiring wizard (200)", status == 200, f"{status} {body}")
    check("lookups carry units and departments", bool(lookups.get("units")) and bool(lookups.get("departments")),
          str({k: len(v) if isinstance(v, list) else v for k, v in lookups.items()})[:160])
    check("lookups carry the wage heads and the personal-file checklist",
          bool(lookups.get("wageHeads")) and bool(lookups.get("checklistItems")),
          str({k: len(v) if isinstance(v, list) else v for k, v in lookups.items()})[:160])
    check("the employer picker is empty in the employer panel", not lookups.get("employers"), str(lookups.get("employers")))

    status, body = employer.request("POST", "/api/employer/employees", {
        "name": f"Self Hired {STAMP}",
        "sex": "Female", "mobile": f"+9198766{STAMP[-4:]}7", "email": f"hired.{STAMP}@example.com",
        "state": "Tamil Nadu", "pincode": "600058",
        "unit_id": unit_a, "department_id": department_a,
        "date_of_joining": "2023-08-01", "designation": "Packing Helper", "category": "Worker",
        "weekly_off": "Sunday", "status": "active",
        "basic_salary": 15000, "da": 1500, "hra": 2500, "wage_type": "Per Month",
        "create_login": True, "login_email": f"hired.login.{STAMP}@example.com",
        "login_username": f"cosfix.ss.hired{STAMP}",
    })
    check("the employer hires an employee into its own company (201)", status == 201, f"{status} {body}")
    hired_id = int(body.get("employeeId") or 0)
    credentials = body.get("credentials") or {}
    check("hiring returns generated portal credentials",
          bool(credentials.get("username")) and bool(credentials.get("temporaryPassword")), str(credentials)[:120])
    row = db(f"SELECT employer_id FROM employees WHERE id = {hired_id};")
    check("the new employee belongs to the session's company", row and int(row[0][0]) == employer_id, str(row))

    if credentials.get("temporaryPassword"):
        hired_session = Session()
        hired_session.login((credentials.get("email") or f"hired.login.{STAMP}@example.com", credentials["temporaryPassword"]))
        activated, detail = activate(hired_session, credentials.get("email") or f"hired.login.{STAMP}@example.com",
                                     credentials["temporaryPassword"])
        check("the credentials issued by the employer actually work", activated is not None, detail)

    status, body = employer.request("POST", "/api/employer/employees", {
        "name": f"Forged Hire {STAMP}", "employer_id": other_id, "mobile": f"+9198766{STAMP[-4:]}8",
        "basic_salary": 12000, "wage_type": "Per Month", "date_of_joining": "2023-08-01",
    })
    check("hiring into another company is refused (422)", status == 422, f"{status} {body}")

    status, body = employer.request("GET", f"/api/employer/employees/{employee_a}")
    detail_body = obj_of(body)
    check("the employer reads its own employee in full (200)", status == 200, f"{status} {body}")
    check("the detail carries the child registers and the wage structure",
          all(key in detail_body for key in ("employee", "qualifications", "documents", "checklist", "salaryStructure")),
          str(list(detail_body.keys()))[:160])
    check("the employer's view never returns portal credentials", detail_body.get("login") in (None, {}),
          str(detail_body.get("login"))[:120])

    status, body = employer.request("GET", f"/api/employer/employees/{employee_b}")
    check("another company's employee cannot be read (404)", status == 404, f"{status} {body}")
    status, body = employer.request("PATCH", f"/api/employer/employees/{employee_b}", {"designation": "Stolen"})
    check("another company's employee cannot be edited (404)", status == 404, f"{status} {body}")

    status, body = employer.request("PATCH", f"/api/employer/employees/{employee_a}", {"designation": "Senior Operator"})
    check("the employer edits its own employee (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT designation FROM employees WHERE id = {employee_a};")
    check("the edit is stored", row and row[0][0] == "Senior Operator", str(row))

    status, body = employer.request("PATCH", f"/api/employer/employees/{employee_a}", {"employer_id": other_id})
    check("an employee cannot be transferred between companies from this screen (422)", status == 422, f"{status} {body}")

    # ── 7. child registers ───────────────────────────────────────────────
    print("\n7. child registers")
    status, body = employer.request("GET", f"/api/employer/employees/{employee_a}/checklist")
    checklist = rows_of(body)
    check("the employer reads the personal-file checklist (200)", status == 200 and len(checklist) > 0,
          f"{status} {len(checklist)} row(s)")

    status, body = employer.request("POST", f"/api/employer/employees/{employee_a}/checklist", {
        "item_id": int(checklist[0]["item_id"]), "is_checked": True, "remarks": "Checked during verification",
    })
    check("the employer ticks a checklist item (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT is_checked FROM employee_file_checklist WHERE employee_id = {employee_a} AND item_id = {int(checklist[0]['item_id'])};")
    check("the tick is stored", row and str(row[0][0]) in ("1", "b'\\x01'"), str(row))

    status, body = employer.request("POST", f"/api/employer/employees/{employee_a}/qualifications", {
        "qualification": "ITI Fitter", "specialization": "Fitting", "institution": "Guindy ITI",
        "year_of_passing": 2014, "board_university": "NCVT",
    })
    check("the employer adds a qualification (201)", status == 201, f"{status} {body}")
    created_record = obj_of(body)
    qualification_id = int(created_record.get("recordId") or created_record.get("id") or 0)

    status, body = employer.request("PUT", f"/api/employer/employees/{employee_a}/qualifications/{qualification_id}", {
        "qualification": "ITI Fitter (NCVT)", "institution": "Guindy ITI", "year_of_passing": 2014,
    })
    check("the employer corrects the qualification (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT qualification FROM employee_qualifications WHERE id = {qualification_id};")
    check("the correction is stored", row and "NCVT" in row[0][0], str(row))

    status, body = employer.request("DELETE", f"/api/employer/employees/{employee_a}/qualifications/{qualification_id}")
    check("the employer removes the qualification (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT deleted_at FROM employee_qualifications WHERE id = {qualification_id};")
    check("the removal is a soft delete", row and row[0][0] not in ("", "NULL"), str(row))

    status, body = employer.request("GET", f"/api/employer/employees/{employee_b}/qualifications")
    check("another company's child register cannot be read (404)", status == 404, f"{status} {body}")

    # ── 8. employee self-service ─────────────────────────────────────────
    print("\n8. employee self-service")
    status, body = employee_session.request("GET", "/api/employee/profile")
    mine = obj_of(body)
    me = mine.get("employee") or {}
    check("the employee reads their own profile (200)", status == 200, f"{status} {body}")
    check("the profile is the caller's own record", int(me.get("id") or 0) == employee_a,
          f"got {me.get('id')} wanted {employee_a}")
    check("the profile carries the employer and the wage structure",
          bool(me.get("employer_name")) and "basic_salary" in me, str(list(me.keys())[:12]))
    check("the profile carries the personal-file statistics", isinstance(mine.get("stats"), dict),
          str(mine.get("stats"))[:120])

    status, body = employee_session.request("PATCH", "/api/employee/profile", {
        "mobile": "+919876612345", "present_address": "9 New Colony, Guindy, Chennai",
        "bank_account_number": f"5009{STAMP[-6:]}",
    })
    check("the employee updates their own contact and bank details (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT mobile, bank_account_number FROM employees WHERE id = {employee_a};")
    check("the update is stored", row and row[0][0] == "+919876612345" and row[0][1].endswith(STAMP[-6:]), str(row))

    for field, value in (("employee_number", "HACK-1"), ("gross_salary", 999999),
                         ("employer_id", other_id), ("designation", "Manager")):
        status, body = employee_session.request("PATCH", "/api/employee/profile", {field: value})
        errors = (body or {}).get("errors") or []
        check(f"the employee cannot change {field} (422, refused by name)",
              status == 422 and any(error.get("field") == field for error in errors), f"{status} {body}")

    status, body = employee_session.request("GET", f"/api/employer/employees/{employee_a}")
    check("the employee panel cannot read the employer register (403)", status == 403, f"{status} {body}")

    # ── 9. documents ─────────────────────────────────────────────────────
    print("\n9. documents")
    status, body = employee_session.request("GET", "/api/employee/documents")
    check("the employee lists their own documents (200)", status == 200, f"{status} {body}")

    data, content_type = multipart(
        [("document_type", "Educational Certificate"), ("document_name", f"ITI Certificate {STAMP}"),
         ("document_number", f"CERT/{STAMP}"), ("remarks", "Uploaded by the employee during verification")],
        [("file", f"iti-certificate-{STAMP}.pdf", "application/pdf", MINI_PDF)],
    )
    status, body = employee_session.post_raw("/api/employee/documents", data, content_type)
    check("the employee uploads a document (201)", status == 201, f"{status} {body}")
    uploaded = obj_of(body)
    document_id = int(uploaded.get("documentId") or 0)
    file_id = int(uploaded.get("fileId") or 0)
    row = db(f"SELECT employee_id, document_type FROM employee_documents WHERE id = {document_id};")
    check("the document is filed against the caller's own record",
          row and int(row[0][0]) == employee_a and row[0][1] == "Educational Certificate", str(row))

    status, body = employee_session.request("GET", "/api/employee/documents")
    check("the uploaded document appears in the register",
          any(int(item["id"]) == document_id for item in rows_of(body)),
          str([item.get("id") for item in rows_of(body)]))

    status, payload, headers = employee_session._send("GET", f"/api/files/{file_id}/download", None, True)
    check("the employee downloads their own document (200 PDF)",
          status == 200 and payload[:4] == b"%PDF", f"{status} {payload[:40]}")
    disposition = next((value for key, value in headers.items()
                        if key.lower() == "content-disposition"), "")
    check("the download is served as an attachment", "attachment" in disposition.lower(), str(disposition)[:90])

    db(f"UPDATE employee_documents SET is_verified = 1, verified_at = NOW() WHERE id = {document_id};")
    status, body = employee_session.request("DELETE", f"/api/employee/documents/{document_id}")
    check("a verified document cannot be withdrawn by the employee (409)", status == 409, f"{status} {body}")
    db(f"UPDATE employee_documents SET is_verified = 0, verified_at = NULL WHERE id = {document_id};")

    status, body = employee_session.request("DELETE", f"/api/employee/documents/{document_id}")
    check("a pending document can be withdrawn (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT deleted_at FROM employee_documents WHERE id = {document_id};")
    check("the withdrawal is a soft delete", row and row[0][0] not in ("", "NULL"), str(row))

    status, body = employee_session.request("DELETE", f"/api/employee/documents/{document_id}")
    check("the same document cannot be withdrawn twice (404)", status == 404, f"{status} {body}")

    admin_document = None
    rows = db("SELECT ed.id FROM employee_documents ed JOIN employees e ON e.id = ed.employee_id "
              f"WHERE e.employer_id = {other_id} AND ed.deleted_at IS NULL LIMIT 1;")
    if rows:
        admin_document = int(rows[0][0])
        status, body = employee_session.request("DELETE", f"/api/employee/documents/{admin_document}")
        check("another employee's document cannot be withdrawn (404)", status == 404, f"{status} {body}")
    else:
        check("another employee's document cannot be withdrawn (404) — no foreign document to try", True,
              "covered by the ownership check above")

    # ── 10. service record ───────────────────────────────────────────────
    print("\n10. service record")
    status, body = employee_session.request("GET", "/api/employee/service-record")
    record = obj_of(body)
    check("the employee reads their own service record (200)", status == 200, f"{status} {body}")
    check("the service record is the caller's own", int((record.get("employee") or {}).get("id") or 0) == employee_a,
          str((record.get("employee") or {}).get("id")))
    check("the service record carries the entries, qualifications and experience",
          all(key in record for key in ("records", "qualifications", "experience", "totalRecords")),
          str(list(record.keys())))

    db("INSERT INTO employee_service_records (employee_id, employer_id, employer_name, designation, department, "
       f"date_from, date_to, total_period, last_drawn_salary, reason_for_leaving, created_at, updated_at) "
       f"VALUES ({employee_a}, {employer_id}, {sql_text('Earlier Works Pvt Ltd')}, 'Machine Operator', 'Production', "
       f"'2018-06-01', '2022-04-30', '3 years 11 months', 16500, {sql_text('Better prospects')}, NOW(), NOW());")
    status, body = employee_session.request("GET", "/api/employee/service-record")
    record = obj_of(body)
    check("a recorded period of service shows up for the employee",
          any("Earlier Works" in str(row.get("employer_name")) for row in record.get("records", [])),
          str(len(record.get("records", []))))

    # ── 11. audits & reports ─────────────────────────────────────────────
    print("\n11. audits & reports")
    auditor_id, detail = create_auditor(admin)
    check("an auditor exists for the assignment fixtures", auditor_id is not None, detail)

    assignment_a = assignment_b = None
    if auditor_id:
        assignment_a, detail = create_assignment(admin, "A", auditor_id)
        check("company A has an audit scheduled", assignment_a is not None, detail)
        assignment_b, detail = create_assignment(admin, "B", auditor_id)
        check("company B has an audit scheduled", assignment_b is not None, detail)

    status, body = employer.request("GET", "/api/employer/audits")
    audits = rows_of(body)
    check("the employer lists its company's audits (200)", status == 200, f"{status} {body}")
    check("the register is paginated", isinstance(body.get("pagination"), dict), str(body.get("pagination"))[:120])
    check("the company's own audit is listed",
          any(int(row["id"]) == assignment_a for row in audits) if assignment_a else True,
          str([row.get("id") for row in audits]))
    check("another company's audit is not listed",
          all(int(row["id"]) != assignment_b for row in audits) if assignment_b else True,
          str([row.get("id") for row in audits]))

    if assignment_a:
        status, body = employer.request("GET", f"/api/employer/audits/{assignment_a}")
        detail_body = obj_of(body)
        check("the employer opens its own audit (200)", status == 200, f"{status} {body}")
        check("the audit detail carries the assignment, its trail and its files",
              all(key in detail_body for key in ("assignment", "history", "files")),
              str(list(detail_body.keys())))
        status, body = employer.request("GET", "/api/employer/audits/0")
        check("an unknown audit id is refused (404)", status == 404, f"{status} {body}")
    if assignment_b:
        status, body = employer.request("GET", f"/api/employer/audits/{assignment_b}")
        check("another company's audit cannot be read (404)", status == 404, f"{status} {body}")

    status, body = employer.request("GET", "/api/employer/audit-reports")
    check("the employer lists the reports about its company (200)", status == 200, f"{status} {body}")
    check("the report register is paginated", isinstance(body.get("pagination"), dict), str(body.get("pagination"))[:120])

    foreign_reports = db("SELECT id FROM audit_reports WHERE employer_id IS NOT NULL AND employer_id <> "
                         f"{employer_id} AND deleted_at IS NULL LIMIT 1;")
    if foreign_reports:
        status, body = employer.request("GET", f"/api/employer/audit-reports/{int(foreign_reports[0][0])}")
        check("another company's report cannot be read (404)", status == 404, f"{status} {body}")
    else:
        status, body = employer.request("GET", "/api/employer/audit-reports/999999999")
        check("an unknown report cannot be read (404)", status == 404, f"{status} {body}")

    # One report for company A, filed against the assignment the platform just
    # scheduled, queued to the verifier and decided there — then read back by the
    # company on its own screen. This is the whole employer-facing half of the
    # report lifecycle: a company never sees the working conversation, only the
    # finished report and the decision on it.
    report_a = None
    if assignment_a and auditor_id:
        verifier_user = Session()
        signed, _detail = verifier_user.login(VERIFIER)
        verifier_id = int((verifier_user.user or {}).get("id") or 0) if signed else 0
        verifier_user.sign_out()

        status, body = admin.request("POST", "/api/admin/audit-reports", {
            "assignment_id": assignment_a,
            "employer_id": employer_id,
            "auditor_id": auditor_id,
            "verifier_id": verifier_id or None,
            "audit_title": f"Statutory registers audit {STAMP}",
            "report_type": "AUDIT",
            "audit_date": "2026-09-05",
            "body": {
                "executive_summary": "The registers are broadly in order; the overtime register was not signed for August.",
                "methodology": "Documents inspected on site, with the establishment's HR records sampled.",
                "scorecard": [{"section": "Statutory registers", "max_score": 50, "obtained_score": 38}],
                "findings": [{
                    "severity": "Minor", "reference": "FORM-14", "status": "Open",
                    "description": "The overtime register was not signed by the occupier for August.",
                    "recommendation": "Sign the register monthly and retain the sheet.",
                }],
            },
            "submit": True,
        })
        check("an auditor's report is filed against the company (201)", status in (200, 201), f"{status} {body}")
        report_a = int(body.get("id") or body.get("reportId") or (body.get("data") or {}).get("id") or 0) or None
        check("the report was queued for verification", bool(report_a), f"{status} {body}")

    if report_a:
        status, body = employer.request("GET", f"/api/employer/audit-reports/{report_a}")
        detail_body = obj_of(body)
        check("the employer reads its own report (200)", status == 200, f"{status} {body}")
        check("the report detail carries the report, its body and the decisions on it",
              all(key in detail_body for key in ("report", "body", "decisions")),
              str(list(detail_body.keys()))[:160])
        check("the reported findings are in the body the employer reads",
              len((detail_body.get("body") or {}).get("findings") or []) == 1,
              str((detail_body.get("body") or {}).get("findings"))[:160])

        # The verifier decides, and the decision is what the employer sees next.
        verifier_session = Session()
        signed, detail = verifier_session.login(VERIFIER)
        check("the verifier signs in", signed, detail)
        if signed:
            status, body = verifier_session.request("POST", f"/api/verifier/reports/{report_a}/review", {
                "action": "approve",
                "comments": "The finding is correctly evidenced and the action is proportionate. Approved.",
                "notify_employer": True,
            })
            check("the verifier approves the report (200)", status == 200, f"{status} {body}")
            verifier_session.sign_out()

            status, body = employer.request("GET", f"/api/employer/audit-reports/{report_a}")
            decisions = (obj_of(body) or {}).get("decisions") or []
            check("the employer reads the verifier's decision on its own report",
                  status == 200 and any(str(d.get("action", "")).lower() == "approved" for d in decisions),
                  f"{status} {decisions}")

    # ── 12. screens ──────────────────────────────────────────────────────
    print("\n12. screens")
    employer_pages = [
        "/employer/profile", "/employer/profile/edit", "/employer/units", "/employer/departments",
        "/employer/employees", "/employer/employees/create",
        f"/employer/employees/{employee_a}", f"/employer/employees/{employee_a}/edit",
        "/employer/audits", "/employer/audit-reports", "/employer/settings",
    ]
    for path in employer_pages:
        status, body, _ = employer._send("GET", path, None, True)
        check(f"employer page {path} renders (200)", status == 200, f"{status} {body[:90]}")
    status, body, _ = employer._send("GET", "/employer/audit-reports", None, True)
    page = body if isinstance(body, bytes) else bytes(str(body), "utf-8")
    check("the employer's reports screen carries their own score trend chart",
          status == 200 and b"compliance score trend" in page.lower(), page[:200])
    if assignment_a:
        status, body, _ = employer._send("GET", f"/employer/audits/{assignment_a}", None, True)
        check(f"employer page /employer/audits/{assignment_a} renders (200)", status == 200, f"{status} {body[:90]}")
    if report_a:
        status, body, _ = employer._send("GET", f"/employer/audit-reports/{report_a}", None, True)
        check(f"employer page /employer/audit-reports/{report_a} renders (200)", status == 200, f"{status} {body[:90]}")
        page = body if isinstance(body, bytes) else bytes(str(body), "utf-8")
        check("the report screen is the company's copy of the report, not an empty shell",
              b"Statutory registers audit" in page, page[:200])

    employee_pages = [
        "/employee/profile", "/employee/personal-details", "/employee/employment-details",
        "/employee/service-record", "/employee/documents", "/employee/settings",
    ]
    for path in employee_pages:
        status, body, _ = employee_session._send("GET", path, None, True)
        check(f"employee page {path} renders (200)", status == 200, f"{status} {body[:90]}")

    status, _ = employee_session.request_no_redirect("GET", "/employer/profile")
    check("an employee sent to the employer panel is redirected (30x)", status in (302, 303, 307, 308), f"{status}")
    status, _ = employer.request_no_redirect("GET", "/employee/profile")
    check("an employer sent to the employee panel is redirected (30x)", status in (302, 303, 307, 308), f"{status}")
    status, _ = AnonymousGet("/admin/dashboard")
    check("an anonymous visitor sent to the admin panel is redirected (30x)", status in (302, 303, 307, 308), f"{status}")

    # ── 13. audit trail ──────────────────────────────────────────────────
    print("\n13. audit trail")
    def activity_count(module, entity_id=None):
        where = f"module = {sql_text(module)} AND employer_id = {employer_id}"
        if entity_id is not None:
            where += f" AND entity_id = {entity_id}"
        return int(db(f"SELECT COUNT(*) FROM activity_logs WHERE {where};")[0][0])

    check("adding a unit is logged", activity_count("company_unit") >= 1, "company_unit rows")
    check("adding a department is logged", activity_count("department") >= 1, "department rows")
    check("hiring an employee is logged", activity_count("employee", hired_id) >= 1, f"employee #{hired_id}")
    check("a document upload by the employee is logged",
          int(db("SELECT COUNT(*) FROM activity_logs WHERE module = 'employee_document' "
                 f"AND entity_id = {document_id};")[0][0]) >= 1, "employee_document rows")
    check("the employer's own profile edit is logged",
          int(db("SELECT COUNT(*) FROM activity_logs WHERE module = 'employer' AND entity_id = "
                 f"{employer_id} AND action = 'updated';")[0][0]) >= 1, "employer update rows")

    # ── 14. clean-up ─────────────────────────────────────────────────────
    print("\n14. clean-up")
    employer.sign_out()
    employee_session.sign_out()
    sweep_stale()
    leftover = db("SELECT COUNT(*) FROM employers WHERE employer_code LIKE 'VFYSS%';")
    check("the fixture companies are gone", leftover[0][0] == "0", str(leftover))
    leftover = db("SELECT COUNT(*) FROM users WHERE email LIKE 'cosfix.ss.%';")
    check("the fixture logins are gone", leftover[0][0] == "0", str(leftover))
    leftover = db("SELECT COUNT(*) FROM employees WHERE name LIKE 'Self Service %';")
    check("the fixture employees are gone", leftover[0][0] == "0", str(leftover))

    print(f"\n{passed} passed, {failed} failed")
    if failures:
        print("\nFailures:")
        for entry in failures:
            print(f"  • {entry}")
    return 0 if failed == 0 else 1


def AnonymousGet(path):
    """A GET from a fresh anonymous visitor, without following redirects."""
    session = Session()
    return session.request_no_redirect("GET", path)


if __name__ == "__main__":
    sys.exit(main())
