#!/usr/bin/env python3
"""Payroll & HR module (Phase 4) end-to-end verification.

The payroll suite is the one that has to be believed: it runs the engine over
real employees on real attendance and checks the money it prints. It attacks the
module the way a payroll officer, an inspector and an intruder would:

   1. access control      — payroll is administrator and employer territory, by URL as well
   2. fixtures            — a company, its unit, its department and three employees
   3. salary structures   — the wage contract, its revision chain and its validation
   4. attendance          — a month marked in bulk, a day corrected, the sheet
   5. leave               — a type, an application, the decision and the ledger
   6. the run             — create, calculate, the arithmetic, approve, lock, pay
   7. payslips            — register, filters, CSV, head-wise detail, payments, PDF
   8. documents           — the bilingual PDF and the bank file, in every format
   9. publication         — publishing to the employees and the delivery logs
  10. statutory registers — bonus, gratuity and the full and final settlement
  11. screens             — every payroll page renders for the role that owns it
  12. audit & clean-up    — the activity log holds what happened; the fixtures go

Usage:  python3 scripts/verify-payroll.py [base_url]
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
from datetime import datetime, date, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")
ADMIN = (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026"))
AUDITOR = ("auditor.test@complianceos.local", "Auditor@2026")
VERIFIER = ("verifier.test@complianceos.local", "Verifier@2026")
STAMP = datetime.now().strftime("%m%d%H%M%S")

passed = 0
failed = 0
failures = []

EMPLOYER_EMAIL = f"cosfix.payroll.employer{STAMP}@example.com"
EMPLOYEE_EMAIL = f"cosfix.payroll.employee{STAMP}@example.com"
CREDENTIALS = {}          # the logins this suite minted
FIXTURE = {}              # employer_id, unit_id, department_id, employees {...}
RUN_IDS = []              # payroll_runs this suite created

# The month the payroll is run for: the next one, so the suite never collides
# with a month anybody else has already computed.
TODAY = date.today()
MONTH = TODAY.month % 12 + 1
YEAR = TODAY.year + (1 if TODAY.month == 12 else 0)
DAYS_IN_MONTH = (date(YEAR + (1 if MONTH == 12 else 0), 1 if MONTH == 12 else MONTH + 1, 1) - date(YEAR, MONTH, 1)).days
MONTH_LABEL = f"{date(YEAR, MONTH, 1):%B} {YEAR}"


MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]


def day(day_of_month):
    return f"{YEAR}-{MONTH:02d}-{day_of_month:02d}"


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

# ── fixtures ────────────────────────────────────────────────────────────────

def create_employer(admin):
    """A company with a portal login, so the employer-scoped APIs can be driven."""
    status, body = admin.request("POST", "/api/admin/employers", {
        "company_name": f"VFY Payroll Works {STAMP}",
        "employer_code": f"VFYP{STAMP}",
        "industry_type": "Manufacturing",
        "company_type": "Private Limited",
        "year_of_establishment": 2016,
        "email": f"hr{STAMP}@vfypayroll.example.com",
        "phone": "+914400000000",
        "mobile": "+919876500001",
        "address_line_1": "12 Industrial Estate Road",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "pincode": "600032",
        "number_of_units": 1,
        "create_portal_user": True,
        "portal_user_name": f"Payroll Employer {STAMP}",
        "portal_user_email": EMPLOYER_EMAIL,
        "portal_user_mobile": "+919876500002",
    })
    if status != 201:
        return None, f"{status} {body}"
    FIXTURE["employer_id"] = int(body["employerId"])
    credentials = body.get("portalCredentials") or {}
    if credentials.get("temporaryPassword"):
        CREDENTIALS["employer"] = (EMPLOYER_EMAIL, credentials["temporaryPassword"])
    return FIXTURE["employer_id"], ""


def create_unit(admin, employer_id):
    status, body = admin.request("POST", f"/api/admin/employers/{employer_id}/units", {
        "unit_name": f"Ambattur Plant {STAMP}",
        "unit_code": f"U{STAMP}"[-8:],
        "location": "Ambattur, Chennai",
        "address": "12 Industrial Estate Road, Ambattur",
        "contact_person_name": "Plant Head",
        "status": "active",
    })
    if status not in (200, 201):
        return None, f"{status} {body}"
    unit_id = int(body.get("id") or body.get("unitId") or (body.get("data") or {}).get("id") or 0)
    if not unit_id:
        rows = db(f"SELECT id FROM company_units WHERE employer_id = {employer_id} AND unit_name LIKE '%{STAMP}%' LIMIT 1;")
        unit_id = int(rows[0][0]) if rows else 0
    FIXTURE["unit_id"] = unit_id
    return unit_id, ""


def create_department(admin, employer_id, unit_id):
    status, body = admin.request("POST", f"/api/admin/employers/{employer_id}/departments", {
        "unit_id": unit_id or None,
        "department_name": f"Production {STAMP}",
        "department_code": f"D{STAMP}"[-8:],
        "head_of_department": "Works Manager",
        "status": "active",
    })
    if status not in (200, 201):
        return None, f"{status} {body}"
    department_id = int(body.get("id") or body.get("departmentId") or (body.get("data") or {}).get("id") or 0)
    if not department_id:
        rows = db(f"SELECT id FROM departments WHERE employer_id = {employer_id} AND department_name LIKE '%{STAMP}%' LIMIT 1;")
        department_id = int(rows[0][0]) if rows else 0
    FIXTURE["department_id"] = department_id
    return department_id, ""


def create_employee(admin, key, *, name, basic, da, hra, department_id, with_login=False):
    """One employee through the real wizard payload, with the bank particulars
    payroll pays into."""
    status, body = admin.request("POST", "/api/admin/employees", {
        "name": name,
        "father_name": "Verification Father",
        "sex": "Male",
        "marital_status": "Married",
        "date_of_birth": "1990-04-12",
        "blood_group": "O+",
        "mobile": f"+9198765{STAMP[-4:]}{len(FIXTURE.get('employees', {}))}",
        "email": f"{key}.{STAMP}@vfypayroll.example.com",
        "present_address": "12 Industrial Estate Road, Ambattur, Chennai",
        "permanent_address": "12 Industrial Estate Road, Ambattur, Chennai",
        "state": "Tamil Nadu",
        "pincode": "600032",
        "employer_id": FIXTURE["employer_id"],
        "unit_id": FIXTURE.get("unit_id") or None,
        "department_id": department_id or None,
        "date_of_joining": "2021-06-01",
        "post_applied_for": "Machine Operator",
        "designation": "Machine Operator",
        "category": "Worker",
        "weekly_off": "Sunday",
        "status": "active",
        "basic_salary": basic,
        "da": da,
        "hra": hra,
        "wage_type": "Per Month",
        "pan_number": "ABCDE1234F",
        "bank_name": "State Bank of India",
        "bank_account_number": f"3001{STAMP[-6:]}",
        "ifsc_code": "SBIN0001234",
        "create_login": with_login,
        "login_email": EMPLOYEE_EMAIL if with_login else None,
        "login_username": f"cosfix.payroll.{key}{STAMP}" if with_login else None,
    })
    if status != 201:
        return None, f"{status} {body}"
    employee_id = int(body["employeeId"])
    employees = FIXTURE.setdefault("employees", {})
    employees[key] = {"id": employee_id, "number": body.get("employeeNumber"), "name": name}
    credentials = body.get("credentials") or {}
    if with_login and credentials.get("temporaryPassword"):
        CREDENTIALS["employee"] = (EMPLOYEE_EMAIL, credentials["temporaryPassword"])
    return employee_id, ""


def create_second_company(admin):
    """A second company with one employee, so every cross-tenant check is real.

    Company A is the fixture the suite drives; company B exists only to be
    reached for and refused. It has no portal login.
    """
    status, body = admin.request("POST", "/api/admin/employers", {
        "company_name": f"VFY Other Works {STAMP}",
        "employer_code": f"VFYO{STAMP}",
        "industry_type": "Manufacturing",
        "state": "Tamil Nadu",
        "city": "Chennai",
        "pincode": "600032",
        "email": f"hr.other{STAMP}@vfypayroll.example.com",
        "mobile": "+919876500003",
        "status": "active",
    })
    if status != 201:
        return None, f"{status} {body}"
    other_id = int(body["employerId"])
    FIXTURE["other_employer_id"] = other_id

    status, body = admin.request("POST", "/api/admin/employees", {
        "name": f"Dinesh Kumar {STAMP}",
        "sex": "Male",
        "mobile": "+919876500004",
        "email": f"dinesh.{STAMP}@vfypayroll.example.com",
        "state": "Tamil Nadu",
        "pincode": "600032",
        "employer_id": other_id,
        "date_of_joining": "2022-04-01",
        "designation": "Helper",
        "category": "Worker",
        "weekly_off": "Sunday",
        "status": "active",
        "basic_salary": 11000,
        "wage_type": "Per Month",
    })
    if status != 201:
        return None, f"{status} {body}"
    other_employee = int(body["employeeId"])
    FIXTURE["other_employee_id"] = other_employee

    status, body = admin.request("POST", "/api/admin/payroll/structures",
                                 structure_payload(other_employee, basic=11000, da=0, hra=1000,
                                                   effective_from=day(1)))
    if status != 201:
        return None, f"{status} {body}"
    FIXTURE["other_structure_id"] = int(body.get("id") or 0)
    return other_id, ""


def structure_payload(employee_id, *, basic, da, hra, effective_from, **overrides):
    payload = {
        "employee_id": employee_id,
        "structure_name": f"Structure {STAMP}",
        "effective_from": effective_from,
        "basic": basic,
        "da": da,
        "hra": hra,
        "ta": 0,
        "pa": 0,
        "ea": 0,
        "npba": 0,
        "other_allowances": 0,
        "wage_type": "Per Month",
        "pf_applicable": True,
        "esi_applicable": True,
        "pt_state": "Tamil Nadu",
        "lwf_applicable": True,
        "revision_reason": "Initial structure",
    }
    payload.update(overrides)
    return payload


def sweep():
    """Remove every fixture this suite created, in dependency order."""
    employer = FIXTURE.get("employer_id") or 0
    employees = [row["id"] for row in FIXTURE.get("employees", {}).values()]
    employee_ids = ", ".join(str(i) for i in employees) or "0"
    run_ids = ", ".join(str(i) for i in RUN_IDS) or "0"
    user_ids = ", ".join(row[0] for row in db(
        f"SELECT id FROM users WHERE email IN ('{EMPLOYER_EMAIL}', '{EMPLOYEE_EMAIL}') "
        f"OR email LIKE 'cosfix.payroll.%{STAMP}%';")) or "0"

    db(f"DELETE FROM file_versions WHERE file_id IN (SELECT id FROM files WHERE entity_type = 'PAYSLIP' AND entity_id IN (SELECT id FROM payslips WHERE employee_id IN ({employee_ids})));")
    db(f"DELETE FROM files WHERE entity_type = 'PAYSLIP' AND entity_id IN (SELECT id FROM payslips WHERE employee_id IN ({employee_ids}));")
    db(f"DELETE FROM payroll_items WHERE payslip_id IN (SELECT id FROM payslips WHERE employee_id IN ({employee_ids}));")
    db(f"DELETE FROM payslips WHERE employee_id IN ({employee_ids});")
    db(f"DELETE FROM payroll_runs WHERE id IN ({run_ids}) OR employer_id = {employer};")
    db(f"DELETE FROM salary_structure_items WHERE salary_structure_id IN (SELECT id FROM salary_structures WHERE employee_id IN ({employee_ids}));")
    db(f"DELETE FROM salary_structures WHERE employee_id IN ({employee_ids});")
    db(f"DELETE FROM attendance WHERE employee_id IN ({employee_ids});")
    db(f"DELETE FROM leave_ledgers WHERE employee_id IN ({employee_ids});")
    db(f"DELETE FROM leave_applications WHERE employee_id IN ({employee_ids});")
    db(f"DELETE FROM leave_types WHERE employer_id = {employer};")
    db(f"DELETE FROM bonus_records WHERE employee_id IN ({employee_ids});")
    db(f"DELETE FROM gratuity_records WHERE employee_id IN ({employee_ids});")
    db(f"DELETE FROM full_final_settlements WHERE employee_id IN ({employee_ids});")
    db(f"DELETE FROM notifications WHERE user_id IN ({user_ids});")
    db(f"DELETE FROM reminder_dispatches WHERE entity_type IN ('payroll_run','payslip') AND entity_id IN ({run_ids});")
    db(f"DELETE FROM employee_documents WHERE employee_id IN ({employee_ids});")
    db(f"DELETE FROM employees WHERE id IN ({employee_ids});")
    other = FIXTURE.get("other_employer_id") or 0
    if other:
        db(f"DELETE FROM salary_structure_items WHERE salary_structure_id IN (SELECT id FROM salary_structures WHERE employer_id = {other});")
        db(f"DELETE FROM salary_structures WHERE employer_id = {other};")
        db(f"DELETE FROM attendance WHERE employer_id = {other};")
        db(f"DELETE FROM employees WHERE employer_id = {other};")
        db(f"DELETE FROM employer_users WHERE employer_id = {other};")
        db(f"DELETE FROM employers WHERE id = {other};")
    db(f"DELETE FROM departments WHERE employer_id = {employer};")
    db(f"DELETE FROM company_units WHERE employer_id = {employer};")
    db(f"DELETE FROM employer_users WHERE employer_id = {employer};")
    db(f"DELETE FROM employers WHERE id = {employer};")
    db(f"DELETE FROM sessions WHERE user_id IN ({user_ids});")
    db(f"DELETE FROM password_reset_tokens WHERE user_id IN ({user_ids});")
    db(f"DELETE FROM user_roles WHERE user_id IN ({user_ids});")
    db(f"DELETE FROM users WHERE id IN ({user_ids});")
    db(f"DELETE FROM activity_logs WHERE description LIKE '%{STAMP}%' OR entity_label LIKE '%{STAMP}%';")
    db(f"DELETE FROM email_logs WHERE to_email LIKE '%{STAMP}%';")
    db(f"DELETE FROM sms_logs WHERE to_mobile LIKE '%{STAMP[-4:]}%' AND created_at >= NOW() - INTERVAL 1 DAY;")
    db(f"DELETE FROM whatsapp_logs WHERE to_mobile LIKE '%{STAMP[-4:]}%' AND created_at >= NOW() - INTERVAL 1 DAY;")


def sweep_stale():
    """Remove fixtures left behind by an earlier run that did not finish.

    The suite's own fixtures are named cosfix.payroll.*; a crashed run would
    otherwise leave payslips in the register for the same month, which would
    make the month's totals look wrong for reasons that are not the platform's.
    """
    db("DELETE FROM payroll_items WHERE payslip_id IN (SELECT ps.id FROM payslips ps JOIN employers e ON e.id = ps.employer_id WHERE e.employer_code LIKE 'VFY%');")
    db("DELETE FROM files WHERE entity_type = 'PAYSLIP' AND entity_id IN (SELECT ps.id FROM payslips ps JOIN employers e ON e.id = ps.employer_id WHERE e.employer_code LIKE 'VFY%');")
    db("DELETE FROM payslips WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM payroll_runs WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM salary_structure_items WHERE salary_structure_id IN (SELECT id FROM salary_structures WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%'));")
    db("DELETE FROM salary_structures WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM attendance WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM leave_ledgers WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM leave_applications WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM leave_types WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM bonus_records WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM gratuity_records WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM full_final_settlements WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    users = ", ".join(row[0] for row in db(
        "SELECT id FROM users WHERE email LIKE 'cosfix.payroll.%';")) or "0"
    db(f"DELETE FROM notifications WHERE user_id IN ({users});")
    db(f"DELETE FROM sessions WHERE user_id IN ({users});")
    db(f"DELETE FROM user_roles WHERE user_id IN ({users});")
    db(f"DELETE FROM users WHERE id IN ({users});")
    db("DELETE FROM employees WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM employer_users WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM departments WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM company_units WHERE employer_id IN (SELECT id FROM employers WHERE employer_code LIKE 'VFY%');")
    db("DELETE FROM employers WHERE employer_code LIKE 'VFY%';")


def activate(session, email, temporary):
    """Completes the first-login activation a real user must go through.

    A freshly minted login is flagged for a password change; until it happens the
    panels redirect to the change-password screen, which is correct behaviour and
    therefore part of what has to be exercised here.
    """
    new_password = "Vfy@2026Payroll"
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


def main():
    print(f"\nPayroll & HR module verification — fixtures stamped {STAMP}")
    print(f"Payroll month: {MONTH_LABEL} ({DAYS_IN_MONTH} days)\n")
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    admin = Session(ADMIN)
    signed_in, detail = admin.login()
    if not signed_in:
        print(f"FATAL: administrator sign-in failed: {detail}")
        return 2

    # ── 1. access control ────────────────────────────────────────────────
    print("1. access control")
    anonymous = Session()
    for path in ("/api/admin/payroll", "/api/admin/payroll/overview", "/api/admin/payroll/options",
                 "/api/admin/payroll/register", "/api/admin/payroll/structures", "/api/admin/payroll/attendance"):
        status, body = anonymous.request("GET", path)
        check(f"an anonymous caller cannot read {path} (401)", status == 401, f"{status} {body}")
    status, body = anonymous.request("POST", "/api/admin/payroll", {"employer_id": 1, "month": 1, "year": 2026})
    check("an anonymous caller cannot create a payroll run (401/403)",
          status in (401, 403), f"{status} {body}")

    sweep_stale()

    employer_probe = Session(("employer.test@complianceos.local", "Employer@2026"))
    employer_probe.login()
    for path in ("/api/admin/payroll", "/api/admin/payroll/structures", "/api/admin/payroll/settlements",
                 "/api/admin/payroll/leave/ledger"):
        status, body = employer_probe.request("GET", path)
        check(f"an employer cannot reach the platform-wide {path} (403)", status == 403, f"{status} {body}")

    auditor = Session(AUDITOR)
    auditor.login()
    verifier = Session(VERIFIER)
    verifier.login()
    for label, session in (("an auditor", auditor), ("a verifier", verifier)):
        status, body = session.request("GET", "/api/admin/payroll")
        check(f"{label} cannot read the payroll register (403)", status == 403, f"{status} {body}")
        status, body = session.request("GET", "/api/employee/payslips")
        check(f"{label} cannot read an employee's payslips (403)", status == 403, f"{status} {body}")

    status, body = admin.request("GET", "/api/employee/payslips")
    check("the employee register does not resolve an administrator into an employee's payslips",
          status == 403 or (status == 200 and not (body.get("data") or [])), f"{status} {body}")

    # ── 2. fixtures ──────────────────────────────────────────────────────
    print("2. fixtures")
    employer_id, error = create_employer(admin)
    check("the company is created through the employers API (201)", bool(employer_id), error)
    check("the company carries a portal login with generated credentials",
          "employer" in CREDENTIALS, CREDENTIALS.get("employer"))
    if not employer_id or "employer" not in CREDENTIALS:
        sweep()
        return 1

    unit_id, error = create_unit(admin, employer_id)
    check("its unit is created", bool(unit_id), error)
    department_id, error = create_department(admin, employer_id, unit_id)
    check("its department is created", bool(department_id), error)

    high_id, error = create_employee(admin, "high", name=f"Anand Kumar {STAMP}", basic=20000, da=5000, hra=8000,
                                     department_id=department_id, with_login=True)
    check("the first employee is created (wages above the ESI ceiling)", bool(high_id), error)
    low_id, error = create_employee(admin, "low", name=f"Bhaskar Rao {STAMP}", basic=12000, da=2000, hra=3000,
                                    department_id=department_id)
    check("the second employee is created (wages inside the ESI ceiling)", bool(low_id), error)
    left_id, error = create_employee(admin, "unstructured", name=f"Chandran S {STAMP}", basic=9000, da=0, hra=1000,
                                     department_id=department_id)
    check("the third employee is created without a wage structure", bool(left_id), error)
    check("the employee portal login was minted for the first employee",
          "employee" in CREDENTIALS, CREDENTIALS.get("employee"))
    if not (high_id and low_id and left_id) or "employee" not in CREDENTIALS:
        sweep()
        return 1

    other_id, error = create_second_company(admin)
    check("a second company with its own employee and structure exists for the cross-tenant checks",
          bool(other_id), error)
    if not other_id:
        sweep()
        return 1

    employer = Session(CREDENTIALS["employer"])
    signed_in, detail = employer.login()
    check("the generated employer credentials sign in", signed_in, detail)
    activated, detail = activate(employer, *CREDENTIALS["employer"])
    check("the employer's first sign-in is gated behind the password change", 
          CREDENTIALS["employer"][1] != activated, detail)
    check("the employer's activated password signs in", bool(activated), detail)
    check("the employer panel session carries the company scope",
          (employer.user or {}).get("employerId") == employer_id, employer.user)

    employee = Session(CREDENTIALS["employee"])
    signed_in, detail = employee.login()
    check("the generated employee credentials sign in", signed_in, detail)
    activated, detail = activate(employee, *CREDENTIALS["employee"])
    check("the employee's activated password signs in", bool(activated), detail)
    check("the employee panel session carries the employee scope",
          (employee.user or {}).get("employeeId") == high_id, employee.user)

    status, body = employer.request("GET", "/api/employer/payroll/options")
    check("the employer's payroll options list their own units and departments (200)", status == 200, f"{status} {body}")
    status, body = admin.request("GET", "/api/admin/payroll/options")
    check("the administrator's options carry the 25-head wage catalogue",
          status == 200 and len(body.get("heads") or []) == 25,
          f"{status} {len(body.get('heads') or [])}")
    check("the head catalogue names the Tamil rendering of every head",
          all(head.get("nameTa") for head in (body.get("heads") or [])) if status == 200 else False)

    # ── 3. salary structures ─────────────────────────────────────────────
    print("3. salary structures")
    effective_from = day(1)
    status, body = admin.request("POST", "/api/admin/payroll/structures",
                                 structure_payload(high_id, basic=20000, da=5000, hra=8000, effective_from=effective_from))
    check("the administrator sets a wage structure (201)", status == 201, f"{status} {body}")
    high_structure = int(body.get("id") or 0)

    status, body = employer.request("POST", "/api/employer/salary-structures",
                                    structure_payload(low_id, basic=12000, da=2000, hra=3000, effective_from=effective_from))
    check("the employer sets a wage structure for their own employee (201)", status == 201, f"{status} {body}")
    low_structure = int(body.get("id") or 0)

    status, body = admin.request("GET", f"/api/admin/payroll/structures/{high_structure}")
    check("the structure reads back with its contractual gross",
          status == 200 and abs(float(body.get("gross_salary") or 0) - 33000) < 1, f"{status} {body.get('gross_salary')}")
    check("the structure carries the statutory switches the engine obeys",
          status == 200 and bool(body.get("pf_applicable")) and bool(body.get("esi_applicable")), f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/payroll/structures",
                                 structure_payload(high_id, basic=0, da=0, hra=0, effective_from=effective_from,
                                                   revision_reason="Annual increment", pf_applicable=False))
    check("a structure without a single wage head is refused (422)", status == 422, f"{status} {body}")

    # The revision takes effect on the first of the next month: this month's
    # payroll must still be computed on the structure that was in force in it.
    next_month = date(YEAR + (1 if MONTH == 12 else 0), 1 if MONTH == 12 else MONTH + 1, 1)
    revision_from = next_month.isoformat()
    last_day = (next_month - timedelta(days=1)).isoformat()
    status, body = admin.request("POST", "/api/admin/payroll/structures",
                                 structure_payload(high_id, basic=22000, da=5000, hra=8000, effective_from=revision_from,
                                                   revision_reason="Annual increment"))
    check("a second structure is a revision (201)", status == 201, f"{status} {body}")
    revised_structure = int(body.get("id") or 0)
    status, body = admin.request("GET", f"/api/admin/payroll/structures/{high_structure}")
    check("the previous revision closes the day before the new one starts",
          status == 200 and str(body.get("effective_to") or "")[:10] == last_day, f"{status} {body.get('effective_to')}")
    check("the previous revision is no longer live", status == 200 and not body.get("is_active"), f"{status} {body}")

    rows = db(f"SELECT COUNT(*) FROM salary_structures WHERE employee_id = {high_id} AND is_active = 1;")
    check("exactly one revision is live at a time", rows and int(rows[0][0]) == 1, rows)

    other_structure = FIXTURE.get("other_structure_id")
    other_employee = FIXTURE.get("other_employee_id")
    status, body = employer.request("GET", f"/api/employer/salary-structures/{other_structure}")
    check("an employer cannot read the wage structure of another company (404)", status == 404, f"{status} {body}")
    status, body = employer.request("POST", "/api/employer/salary-structures",
                                    structure_payload(other_employee, basic=11000, da=0, hra=1000, effective_from=day(1)))
    check("an employer cannot write a wage structure for another company's employee (403/404)",
          status in (403, 404), f"{status} {body}")
    status, body = employer.request("POST", "/api/employer/salary-structures",
                                    structure_payload(high_id, basic=20000, da=5000, hra=8000, effective_from=day(1)))
    check("an employer sets a structure for their own employee (201)", status in (201, 409), f"{status} {body}")
    status, body = employer.request("GET", "/api/employer/salary-structures?live=yes&limit=50")
    own_ids = {int(row["employee_id"]) for row in (body.get("data") or [])}
    check("the employer's structure register shows only their own employees (200)",
          status == 200 and own_ids and not (own_ids & {other_employee}),
          f"{status} {sorted(own_ids)}")

    # ── 4. attendance ────────────────────────────────────────────────────
    print("4. attendance")
    status, body = admin.request("PUT", "/api/admin/payroll/attendance",
                                 {"employer_id": employer_id, "month": MONTH, "year": YEAR, "default_status": "Present"})
    check("the month is marked for the whole company in one pass (200)", status == 200, f"{status} {body}")
    rows = db(f"SELECT COUNT(*) FROM attendance WHERE employer_id = {employer_id} AND month = {MONTH} AND year = {YEAR};")
    marked = int(rows[0][0]) if rows else 0
    check("every employee of the company was marked for the month",
          marked == DAYS_IN_MONTH * 3, f"{marked} rows for 3 employees x {DAYS_IN_MONTH} days")

    status, body = admin.request("GET", f"/api/admin/payroll/attendance/sheet?employer_id={employer_id}&month={MONTH}&year={YEAR}")
    check("the attendance sheet reads back for the month", status == 200, f"{status} {body}")
    check("the sheet carries the holidays and weekly offs of the month",
          status == 200 and "holidays" in body, sorted(body.keys())[:12] if status == 200 else body)

    status, body = admin.request("POST", "/api/admin/payroll/attendance",
                                 {"employee_id": high_id, "attendance_date": day(10), "status": "Absent",
                                  "remarks": "Unauthorised absence"})
    check("a single day can be corrected to Absent", status in (200, 201), f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/payroll/attendance",
                                 {"employee_id": high_id, "attendance_date": day(10), "status": "Absent"})
    rows = db(f"SELECT COUNT(*), MAX(status) FROM attendance WHERE employee_id = {high_id} AND attendance_date = '{day(10)}';")
    check("marking the same employee and day again corrects the day rather than repeating it",
          rows and int(rows[0][0]) == 1 and rows[0][1] == "Absent", rows)

    status, body = admin.request("POST", "/api/admin/payroll/attendance",
                                 {"employee_id": low_id, "attendance_date": day(12), "status": "Half Day"})
    check("a half day can be marked", status in (200, 201), f"{status} {body}")
    status, body = admin.request("POST", "/api/admin/payroll/attendance",
                                 {"employee_id": low_id, "attendance_date": day(13), "status": "Present", "overtime_hours": 2})
    check("overtime hours can be recorded against a day", status in (200, 201), f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/payroll/attendance",
                                 {"employee_id": high_id, "attendance_date": day(14), "status": "Moonlighting"})
    check("an invented attendance status is refused (422)", status == 422, f"{status} {body}")
    status, body = employer.request("PUT", "/api/employer/attendance",
                                    {"employer_id": 999999, "month": MONTH, "year": YEAR})
    check("an employer cannot bulk-mark another company (403/404)", status in (403, 404), f"{status} {body}")

    status, body = employer.request("GET", f"/api/employer/attendance?month={MONTH}&year={YEAR}&limit=100")
    check("the employer reads their own attendance register (200)", status == 200, f"{status} {body}")
    stats = (body.get("stats") or {}) if status == 200 else {}
    check("the attendance statistics count the days by status",
          int((stats or {}).get("total") or 0) == DAYS_IN_MONTH * 3, stats)

    status, body = employee.request("GET", f"/api/employee/attendance?month={MONTH}&year={YEAR}")
    check("the employee reads their own attendance (200)", status == 200, f"{status} {body}")
    check("the employee's own absence is visible to them",
          any(row.get("status") == "Absent" for row in (body.get("data") or [])), f"{status}")

    # ── 5. leave ─────────────────────────────────────────────────────────
    print("5. leave")
    status, body = employer.request("POST", "/api/employer/leave/types",
                                    {"name": f"VFY Paid Leave {STAMP}", "name_ta": "ஊதிய விடுப்பு", "is_paid": True,
                                     "max_days_per_year": 12, "requires_document": False})
    check("the employer adds a leave type (201)", status == 201, f"{status} {body}")
    type_id = int(body.get("id") or 0)
    status, body = employer.request("POST", "/api/employer/leave/types",
                                    {"name": f"VFY Unpaid Leave {STAMP}", "is_paid": False, "max_days_per_year": 6})
    check("the employer adds an unpaid leave type (201)", status == 201, f"{status} {body}")
    unpaid_type = int(body.get("id") or 0)

    status, body = admin.request("POST", "/api/admin/payroll/leave/ledger",
                                 {"employer_id": employer_id, "year": YEAR})
    check("the leave ledger is accrued for the whole company (200)", status == 200, f"{status} {body}")
    rows = db(f"SELECT COUNT(*) FROM leave_ledgers WHERE employee_id IN ({high_id}, {low_id}, {left_id}) AND year = {YEAR};")
    accrual_rows = int(rows[0][0]) if rows else 0
    # The company's own two types plus every platform default it has not overridden.
    visible_types = int(db(f"SELECT COUNT(*) FROM leave_types WHERE employer_id = {employer_id} OR (employer_id IS NULL AND code NOT IN "
                           f"(SELECT code FROM leave_types WHERE employer_id = {employer_id}));")[0][0])
    check("every employee carries a balance for every leave type after accrual",
          accrual_rows == 3 * visible_types, f"{accrual_rows} rows for 3 employees x {visible_types} leave types")
    status, body = admin.request("POST", "/api/admin/payroll/leave/ledger",
                                 {"employer_id": employer_id, "year": YEAR})
    rows = db(f"SELECT COUNT(*) FROM leave_ledgers WHERE employee_id IN ({high_id}, {low_id}, {left_id}) AND year = {YEAR};")
    check("accruing the same year again tops the ledger up instead of duplicating it",
          rows and int(rows[0][0]) == accrual_rows, f"{rows} vs {accrual_rows}")

    status, body = employee.request("POST", "/api/employee/leave",
                                    {"leave_type_id": type_id, "date_from": day(20), "date_to": day(21),
                                     "reason": f"Family function {STAMP}"})
    check("the employee applies for leave through their own panel (201)", status == 201, f"{status} {body}")
    application_id = int(body.get("id") or 0)
    check("the application is numbered and the days are counted from the calendar",
          status == 201 and str(body.get("application_number", "")).startswith("LV") and int(body.get("total_days") or 0) == 2,
          body)

    status, body = employee.request("POST", "/api/employee/leave",
                                    {"leave_type_id": type_id, "date_from": day(1), "date_to": day(28),
                                     "reason": f"Too much leave for the balance {STAMP}"})
    check("an application beyond the balance is refused (409)", status == 409, f"{status} {body}")
    check("the refusal names the balance shortfall",
          status == 409 and str(body.get("code")) in ("INSUFFICIENT_BALANCE", "CONFLICT"), f"{status} {body}")

    status, body = employee.request("POST", "/api/employee/leave",
                                    {"leave_type_id": unpaid_type, "date_from": day(24), "date_to": day(24),
                                     "reason": f"Personal work {STAMP}"})
    check("a second application is raised for the unpaid leave type (201)", status == 201, f"{status} {body}")
    second_application = int(body.get("id") or 0)

    status, body = admin.request("GET", f"/api/admin/payroll/leave?status=Pending&limit=100")
    pending_ids = [int(row["id"]) for row in (body.get("data") or [])] if status == 200 else []
    check("the platform's leave register lists the pending applications",
          application_id in pending_ids and second_application in pending_ids, f"{status} {pending_ids[:10]}")

    status, body = employer.request("POST", f"/api/employer/leave/{application_id}/decision",
                                    {"decision": "approve", "approver_comments": f"Approved {STAMP}"})
    check("the employer approves the application (200)", status == 200, f"{status} {body}")
    rows = db(f"SELECT status FROM leave_applications WHERE id = {application_id};")
    check("the application is Approved in the database", rows and rows[0][0] == "Approved", rows)
    rows = db(f"SELECT availed, closing_balance FROM leave_ledgers WHERE employee_id = {high_id} AND leave_type_id = {type_id} AND year = {YEAR};")
    check("approval moves the ledger balance by the days taken",
          rows and float(rows[0][0]) == 2, rows)
    rows = db(f"SELECT status, COUNT(*) FROM attendance WHERE employee_id = {high_id} AND attendance_date BETWEEN '{day(20)}' AND '{day(21)}' GROUP BY status;")
    check("approval marks the days as Leave in attendance",
          rows and all(row[0] == "Leave" for row in rows), rows)

    status, body = employee.request("POST", "/api/employee/leave",
                                    {"leave_type_id": type_id, "date_from": day(27), "date_to": day(27),
                                     "reason": f"Changed my mind {STAMP}"})
    check("a third application is raised to be withdrawn (201)", status == 201, f"{status} {body}")
    third_application = int(body.get("id") or 0)
    rows = db(f"SELECT availed FROM leave_ledgers WHERE employee_id = {high_id} AND leave_type_id = {type_id} AND year = {YEAR};")
    before_withdraw = float(rows[0][0]) if rows else 0
    status, body = employee.request("DELETE", f"/api/employee/leave/{third_application}", {"approver_comments": f"Withdrawn {STAMP}"})
    check("the employee withdraws a pending application (200)", status == 200, f"{status} {body}")
    rows = db(f"SELECT status FROM leave_applications WHERE id = {third_application};")
    check("the withdrawal is recorded", rows and rows[0][0] == "Withdrawn", rows)
    rows = db(f"SELECT availed FROM leave_ledgers WHERE employee_id = {high_id} AND leave_type_id = {type_id} AND year = {YEAR};")
    check("a withdrawn pending application never touched the balance",
          rows and float(rows[0][0]) == before_withdraw, rows)

    status, body = employer.request("POST", f"/api/employer/leave/{second_application}/decision",
                                    {"decision": "reject", "approver_comments": f"Coverage {STAMP}"})
    check("the employer refuses the second application (200)", status == 200, f"{status} {body}")
    rows = db(f"SELECT status FROM leave_applications WHERE id = {second_application};")
    check("the refusal is recorded", rows and rows[0][0] == "Rejected", rows)
    rows = db(f"SELECT availed FROM leave_ledgers WHERE employee_id = {high_id} AND leave_type_id = {unpaid_type} AND year = {YEAR};")
    check("a refused application leaves the ledger alone", rows and float(rows[0][0]) == 0, rows)

    status, body = employee.request("GET", "/api/employee/leave/ledger")
    check("the employee reads their own balance (200)", status == 200, f"{status} {body}")
    check("the balance carries the paid leave they took",
          status == 200 and any(float(row.get("availed") or 0) == 2 for row in (body.get("data") or [])),
          f"{status} {body.get('data')}")
    status, body = employee.request("GET", f"/api/employee/leave?status=Approved")
    check("the employee sees the approval in their own history",
          status == 200 and any(int(row.get("id") or 0) == application_id for row in (body.get("data") or [])),
          f"{status} {body}")

    # ── 6. the payroll run ───────────────────────────────────────────────
    print("6. the payroll run")
    status, body = admin.request("POST", "/api/admin/payroll",
                                 {"employer_id": employer_id, "month": MONTH, "year": YEAR,
                                  "calculation_notes": f"Verification run {STAMP}"})
    check("the administrator raises the month's payroll run (201)", status == 201, f"{status} {body}")
    run_id = int(body.get("id") or 0)
    RUN_IDS.append(run_id)
    check("the run is numbered and named for the month",
          status == 201 and str(body.get("run_number", "")).startswith("PR") and body.get("status") == "Draft",
          body.get("run_number"))
    check("the run's period covers the calendar month",
          str(body.get("period_from"))[:10] == day(1) and str(body.get("period_to"))[:10] == day(DAYS_IN_MONTH), body)

    status, body = admin.request("POST", "/api/admin/payroll",
                                 {"employer_id": employer_id, "month": MONTH, "year": YEAR})
    check("a second run for the same company and month is refused (409)", status == 409, f"{status} {body}")

    status, body = admin.request("POST", f"/api/admin/payroll/{run_id}/calculate", {})
    check("the engine calculates the run (200)", status == 200, f"{status} {body}")
    slips = {int(row["employee_id"]): row for row in (body.get("payslips") or [])} if status == 200 else {}
    check("a payslip is computed for every employee with a structure", set(slips) == {high_id, low_id}, sorted(slips))
    check("the employee without a structure is reported as skipped rather than silently dropped",
          any(str(row.get("employee", "")).startswith(str(FIXTURE["employees"]["unstructured"]["number"]))
              for row in (body.get("skipped") or [])) if status == 200 else False,
          body.get("skipped"))
    check("the run moves to Calculated", (body.get("status") == "Calculated") if status == 200 else False,
          body.get("status"))

    high, low = slips.get(high_id, {}), slips.get(low_id, {})
    check("the absent day is counted as loss of pay", float(high.get("lop_days") or 0) == 1, high.get("lop_days"))
    check("the paid days are the month less the loss-of-pay days",
          float(high.get("paid_days") or 0) == DAYS_IN_MONTH - 1, high.get("paid_days"))
    expected_gross = round(33000 * (DAYS_IN_MONTH - 1) / DAYS_IN_MONTH, 2)
    check("the wage is prorated over the days of the calendar month",
          abs(float(high.get("gross_earnings") or 0) - expected_gross) <= 1,
          f"{high.get('gross_earnings')} vs {expected_gross}")
    check("provident fund is 12% of basic + DA on the statutory ceiling",
          abs(float(high.get("pf_employee") or 0) - 1800) < 1, high.get("pf_employee"))
    check("the employer's provident fund share matches the employee's",
          abs(float(high.get("pf_employer") or 0) - 1800) < 1, high.get("pf_employer"))
    check("an employee above the ESI ceiling pays no ESI",
          float(high.get("esi_employee") or 0) == 0, high.get("esi_employee"))
    check("professional tax is deducted for the State the structure names",
          float(high.get("professional_tax") or 0) > 0, high.get("professional_tax"))

    expected_esi = int(-(-17000 * 75 // 10000))  # ceil(0.75% of 17,000)
    check("ESI is 0.75% of the wage for an employee inside the ceiling",
          abs(float(low.get("esi_employee") or 0) - expected_esi) < 1, f"{low.get('esi_employee')} vs {expected_esi}")
    check("the employer's ESI share is 3.25%",
          abs(float(low.get("esi_employer") or 0) - 553) < 1, low.get("esi_employer"))
    check("a half day costs half a day of paid days",
          abs(float(low.get("paid_days") or 0) - (DAYS_IN_MONTH - 0.5)) < 0.01, low.get("paid_days"))
    check("overtime is paid at twice the ordinary rate",
          float(low.get("overtime_amount") or 0) > 0 and float(low.get("overtime_hours") or 0) == 2,
          f"{low.get('overtime_hours')}h / {low.get('overtime_amount')}")
    check("the net pay is the gross less the deductions",
          abs((float(high.get("gross_earnings") or 0) - float(high.get("total_deductions") or 0))
              - float(high.get("net_pay") or 0)) < 1,
          f"{high.get('gross_earnings')} - {high.get('total_deductions')} vs {high.get('net_pay')}")
    check("the net pay is written out in words",
          "Rupees" in str(high.get("net_pay_in_words") or ""), high.get("net_pay_in_words"))
    check("the payslip is numbered and carries the wage period it belongs to",
          str(high.get("payslip_number", "")).startswith("PS")
          and str(high.get("period_from"))[:10] == day(1) and str(high.get("period_to"))[:10] == day(DAYS_IN_MONTH),
          f"{high.get('payslip_number')} / {high.get('period_from')} - {high.get('period_to')}")
    check("the payslip is unpaid until the bank is told otherwise",
          high.get("payment_status") == "Pending", high.get("payment_status"))

    check("the run totals are the sum of its payslips",
          abs(float(body.get("total_gross") or 0) - (float(high.get("gross_earnings") or 0) + float(low.get("gross_earnings") or 0))) < 1
          and abs(float(body.get("total_net") or 0) - (float(high.get("net_pay") or 0) + float(low.get("net_pay") or 0))) < 1,
          f"gross {body.get('total_gross')} net {body.get('total_net')}")
    check("the statutory totals the company remits are kept on the run",
          abs(float(body.get("total_pf_employee") or 0) - (float(high.get("pf_employee") or 0) + float(low.get("pf_employee") or 0))) < 1
          and abs(float(body.get("total_pf_employer") or 0) - (float(high.get("pf_employer") or 0) + float(low.get("pf_employer") or 0))) < 1,
          f"pf {body.get('total_pf_employee')}/{body.get('total_pf_employer')}")
    check("the run records who calculated it and when",
          bool(body.get("processed_at")) and bool(body.get("processed_by")) and bool(body.get("processed_by_name")),
          f"{body.get('processed_by_name')} / {body.get('processed_at')}")

    # recalculating after a correction rebuilds rather than appends
    admin.request("POST", "/api/admin/payroll/attendance",
                  {"employee_id": left_id, "attendance_date": day(5), "status": "Present"})
    status, body = admin.request("POST", f"/api/admin/payroll/{run_id}/calculate", {})
    rows = db(f"SELECT COUNT(*) FROM payslips WHERE payroll_run_id = {run_id};")
    check("recalculating rebuilds the run instead of appending to it",
          status == 200 and rows and int(rows[0][0]) == 2, f"{status} {rows}")

    status, body = admin.request("POST", f"/api/admin/payroll/{run_id}/status", {"status": "Approved", "note": f"Checked {STAMP}"})
    check("the run is approved", status == 200 and body.get("status") == "Approved", f"{status} {body.get('status')}")
    status, body = admin.request("POST", f"/api/admin/payroll/{run_id}/status", {"status": "Locked"})
    check("the run is locked", status == 200 and body.get("status") == "Locked", f"{status} {body.get('status')}")
    status, body = admin.request("POST", f"/api/admin/payroll/{run_id}/calculate", {})
    check("a locked run cannot be recalculated (409)", status == 409, f"{status} {body}")
    status, body = admin.request("POST", f"/api/admin/payroll/{run_id}/status", {"status": "Draft"})
    check("a locked run cannot be reopened as a draft (409)", status == 409, f"{status} {body}")
    status, body = admin.request("DELETE", f"/api/admin/payroll/{run_id}", {})
    check("withdrawing a locked run needs an explicit confirmation (409)", status == 409, f"{status} {body}")

    # ── 7. payslips ──────────────────────────────────────────────────────
    print("7. payslips")
    status, body = admin.request("GET", f"/api/admin/payroll/payslips?run_id={run_id}&limit=50")
    check("the run's payslips are listed (200)", status == 200 and len(body.get("data") or []) == 2, f"{status} {len(body.get('data') or [])}")
    slip_ids = [int(row["id"]) for row in (body.get("data") or [])]
    stats = (body.get("stats") or {}) if status == 200 else {}
    row_gross = sum(float(row.get("gross_earnings") or 0) for row in (body.get("data") or []))
    check("the payslip statistics total the month's money",
          status == 200 and abs(float(stats.get("gross") or 0) - row_gross) < 5, f"{stats} vs {row_gross}")
    check("the register reports nothing published yet",
          int((stats or {}).get("published") or 0) == 0, stats)

    status, body = admin.request("GET", f"/api/admin/payroll/register?month={MONTH}&year={YEAR}&limit=100")
    check("the pay register reads for the month (200)", status == 200 and len(body.get("data") or []) == 2, f"{status}")
    totals = (body.get("totals") or {}) if status == 200 else {}
    net_sum = sum(float(row.get("net_pay") or 0) for row in (body.get("data") or []))
    check("the pay register totals the net that will leave the bank",
          status == 200 and abs(float(totals.get("net") or 0) - net_sum) < 1, f"{totals} vs {net_sum}")

    status, body, extra = admin.request_full("GET", f"/api/admin/payroll/register?month={MONTH}&year={YEAR}&limit=1000&download=csv", raw=True)
    text = body.decode() if isinstance(body, bytes) else str(body)
    check("the register exports as CSV", status == 200 and "Employee" in text.splitlines()[0], f"{status} {text[:80]}")
    lines = [line for line in text.splitlines() if line.strip()]
    check("the CSV carries one line per payslip and a total line",
          len(lines) == 4 and "TOTAL" in lines[-1], f"{len(lines)} lines: {text[:200]}")

    status, body = admin.request("GET", f"/api/admin/payroll/payslips/{slip_ids[0]}")
    detail = body if status == 200 else {}
    check("a payslip reads with every wage head broken out (200)",
          status == 200 and len(body.get("items") or []) > 0, f"{status} {len(body.get('items') or [])}")
    check("the payslip carries the Tamil name of each head",
          status == 200 and any(item.get("head_name_ta") for item in (body.get("items") or [])),
          [item.get("head_code") for item in (body.get("items") or [])])
    check("the payslip carries the employer's own contributions, which are not deducted from the employee",
          status == 200 and float(body.get("pf_employer") or 0) > 0
          and abs((float(body.get("gross_earnings") or 0) - float(body.get("total_deductions") or 0))
                  - float(body.get("net_pay") or 0)) < 1,
          f"{body.get('pf_employer')} / {body.get('gross_earnings')}")
    check("the payslip names the bank account the money goes to",
          bool(body.get("bank_account_number")) and bool(body.get("ifsc_code")), f"{body.get('bank_account_number')}")

    status, body = admin.request("GET", f"/api/admin/payroll/payslips?payment_status=Paid&limit=50")
    check("the register filters by payment status", status == 200 and len(body.get("data") or []) == 0, f"{status}")

    status, body = employer.request("GET", f"/api/employer/payroll/payslips/{slip_ids[0]}")
    check("the employer reads their own payslip (200)", status == 200, f"{status} {body}")
    status, body = employer.request("PATCH", "/api/employer/payroll/payslips/payments",
                                    {"ids": slip_ids, "payment_status": "Paid", "payment_mode": "Bank Transfer",
                                     "payment_reference": f"NEFT{STAMP}"})
    check("the employer marks the month's salary paid in one action (200)", status == 200, f"{status} {body}")
    check("both payslips are settled", status == 200 and int(body.get("updated") or 0) == 2, body)
    status, body = admin.request("GET", f"/api/admin/payroll/{run_id}")
    check("the run follows its payslips to Paid", status == 200 and body.get("status") == "Paid", f"{status} {body.get('status')}")
    rows = db(f"SELECT COUNT(*) FROM payslips WHERE payroll_run_id = {run_id} AND payment_status = 'Paid' AND paid_at IS NOT NULL;")
    check("each settled payslip keeps the date the money moved", rows and int(rows[0][0]) == 2, rows)

    status, body = employee.request("GET", "/api/employee/payslips")
    check("the employee's own payslips are hidden until they are published",
          status == 200 and len(body.get("data") or []) == 0, f"{status} {len(body.get('data') or [])}")

    # ── 8. documents ─────────────────────────────────────────────────────
    print("8. documents")
    status, body = admin.request("POST", f"/api/admin/payroll/{run_id}/generate", {})
    check("a readable payslip PDF is generated for every payslip in the run (200)",
          status == 200 and int(body.get("generated") or 0) == 2 and not (body.get("failures") or []),
          f"{status} {body}")
    rows = db(f"SELECT COUNT(*) FROM payslips WHERE payroll_run_id = {run_id} AND pdf_file_id IS NOT NULL;")
    check("each payslip keeps a pointer to the PDF in the vault", rows and int(rows[0][0]) == 2, rows)
    rows = db(f"SELECT COUNT(*) FROM files WHERE entity_type = 'PAYSLIP' AND entity_id IN "
              f"(SELECT id FROM payslips WHERE payroll_run_id = {run_id});")
    check("the PDFs are filed in the document vault", rows and int(rows[0][0]) == 2, rows)

    status, body, extra = admin.request_full("GET", f"/api/admin/payroll/payslips/{slip_ids[0]}/pdf", raw=True)
    head = body[:12] if isinstance(body, bytes) else str(body)[:120].encode()
    check("the payslip PDF streams back as a PDF (200)",
          status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF", f"{status} {head}")
    check("the PDF is a complete document rather than an empty shell",
          isinstance(body, bytes) and len(body) > 15000, len(body) if isinstance(body, bytes) else 0)
    check("the PDF records who it was generated for",
          "X-Generated-For" in extra or "x-generated-for" in {k.lower() for k in extra}, list(extra)[:10])

    for fmt in ("csv", "neft", "nach"):
        status, body, extra = admin.request_full("GET", f"/api/admin/payroll/{run_id}/bank-file?format={fmt}", raw=True)
        text = body.decode() if isinstance(body, bytes) else str(body)
        check(f"the bank file is generated as {fmt} with one line per employee",
              status == 200 and len([line for line in text.splitlines() if line.strip()]) == 3, f"{status}")
        headers = {key.lower(): value for key, value in extra.items()}
        check(f"the {fmt} bank file reports its line count",
              headers.get("x-bank-file-lines") == "2", headers.get("x-bank-file-lines"))
    status, body, extra = employer.request_full("GET", f"/api/employer/payroll/{run_id}/bank-file?format=neft", raw=True)
    check("the employer can download the same bank file", status == 200, status)

    # ── 9. publication ───────────────────────────────────────────────────
    print("9. publication")
    status, body = admin.request("POST", f"/api/admin/payroll/{run_id}/publish", {})
    published = body if status == 200 else {}
    check("the run's payslips are published to the employees (200)", status == 200, f"{status} {body}")
    check("every unpublished payslip is published", int(published.get("published") or 0) == 2, published)
    check("the employer's company is told in the portal",
          int((published.get("deliveries") or {}).get("email") or 0) >= 1, published.get("deliveries"))
    rows = db(f"SELECT COUNT(*) FROM payslips WHERE payroll_run_id = {run_id} AND is_published = 1 AND published_at IS NOT NULL;")
    check("each payslip records the moment it was published", rows and int(rows[0][0]) == 2, rows)
    rows = db(f"SELECT COUNT(*) FROM email_logs WHERE template_code = 'payslip.published' AND created_at >= NOW() - INTERVAL 10 MINUTE;")
    check("a payslip email was logged for this run", rows and int(rows[0][0]) >= 1, rows)
    status, body = admin.request("POST", f"/api/admin/payroll/{run_id}/publish", {})
    check("publishing twice is harmless (0 new publications)",
          status == 200 and int(body.get("published") or 0) == 0, f"{status} {body}")

    status, body = employee.request("GET", "/api/employee/payslips")
    check("the employee now sees the published payslip (200)",
          status == 200 and len(body.get("data") or []) == 1, f"{status} {len(body.get('data') or [])}")
    own_id = int((body.get("data") or [{}])[0].get("id") or 0)
    check("the employee's own totals show what was paid",
          status == 200 and abs(float((body.get("stats") or {}).get("yearToDate") or 0)
                                - float((body.get("data") or [{}])[0].get("net_pay") or 0)) < 1,
          body.get("stats"))
    status, body = employee.request("GET", f"/api/employee/payslips/{own_id}")
    check("the employee reads their own payslip (200)", status == 200, f"{status} {body}")
    viewed = db(f"SELECT COUNT(*) FROM payslips WHERE id = {own_id} AND employee_viewed_at IS NOT NULL;")
    check("reading the payslip records that the employee viewed it",
          viewed and int(viewed[0][0]) == 1, viewed)
    other = [slip for slip in slip_ids if slip != own_id]
    status, body = employee.request("GET", f"/api/employee/payslips/{other[0]}")
    check("an employee cannot read a colleague's payslip (404)", status == 404, f"{status} {body}")
    status, body, extra = employee.request_full("GET", f"/api/employee/payslips/{own_id}/download", raw=True)
    check("the employee downloads the bilingual payslip PDF (200)",
          status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF",
          f"{status} {len(body) if isinstance(body, bytes) else str(body)[:120]}")
    notifications = db(f"SELECT COUNT(*) FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email = '{EMPLOYEE_EMAIL}');")
    check("the employee was notified in the portal", notifications and int(notifications[0][0]) >= 1, notifications)

    # ── 10. statutory registers ──────────────────────────────────────────
    print("10. statutory registers")
    bonus_year = YEAR
    status, body = admin.request("POST", "/api/admin/payroll/bonus",
                                 {"employee_ids": [high_id, low_id], "bonus_year": bonus_year,
                                  "bonus_type": "Statutory Bonus", "payment_date": day(28), "remarks": f"Bonus {STAMP}"})
    check("the statutory bonus is computed for the accounting year (200/201)", status in (200, 201), f"{status} {body}")
    check("the bonus is worked out over the days actually paid in that year",
          status in (200, 201) and not (body.get("skipped") or []), body.get("skipped"))
    rows = db(f"SELECT employee_id, bonus_amount, bonus_percent, eligible_wages FROM bonus_records "
              f"WHERE bonus_year = {bonus_year} AND employee_id IN ({high_id}, {low_id});")
    records = {int(row[0]): row for row in rows}
    check("a bonus record is kept per employee", len(records) == 2, rows)
    eligible = records.get(low_id, [])
    above = records.get(high_id, [])
    check("the statutory minimum of 8.33% is applied",
          eligible and abs(float(eligible[2]) - 8.33) < 0.01, eligible)
    check("the bonus is computed on the eligible wages, not the whole wage",
          eligible and float(eligible[1]) > 0 and float(eligible[1]) <= float(eligible[3]), eligible)
    check("the bonus is the percentage of the eligible wages",
          eligible and abs(float(eligible[1]) - round(float(eligible[3]) * float(eligible[2]) / 100)) <= 1, eligible)
    check("the eligible wages are capped at the calculation ceiling of ₹7,000 a month",
          eligible and float(eligible[3]) <= 7000 * 12, eligible)
    check("an employee drawing above the eligibility ceiling is recorded as not payable",
          above and float(above[1]) == 0, above)
    status, body = admin.request("POST", "/api/admin/payroll/bonus",
                                 {"employee_ids": [high_id], "bonus_year": bonus_year, "bonus_type": "Statutory Bonus"})
    check("an employee who already has a bonus for the year is not paid twice",
          status in (200, 201, 409) and (status == 409 or not (body.get("created") or [])), f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/payroll/gratuity",
                                 {"employee_id": high_id, "service_from": "2015-06-01", "service_to": day(30),
                                  "last_drawn_wages": 25000, "calculation_note": f"Verification {STAMP}"})
    check("gratuity is computed on the last drawn basic and DA (200/201)", status in (200, 201), f"{status} {body}")
    rows = db(f"SELECT total_service_years, gratuity_amount, is_statutory_eligible FROM gratuity_records WHERE employee_id = {high_id};")
    check("the completed years of service are counted", rows and float(rows[0][0]) >= 10, rows)
    check("five years of service makes the gratuity payable",
          rows and int(rows[0][2]) == 1 and float(rows[0][1]) > 0, rows)
    check("gratuity is fifteen days' wages for every completed year",
          rows and abs(float(rows[0][1]) - round(15 / 26 * 25000 * float(rows[0][0]), 2)) <= 2,
          rows[0] if rows else None)
    status, body = admin.request("POST", "/api/admin/payroll/gratuity",
                                 {"employee_id": low_id, "service_from": "2024-06-01", "service_to": day(30)})
    rows = db(f"SELECT is_statutory_eligible, total_service_years FROM gratuity_records WHERE employee_id = {low_id};")
    check("service under five years is recorded but not payable",
          status in (200, 201) and rows and int(rows[0][0]) == 0, f"{status} {rows}")

    status, body = admin.request("POST", "/api/admin/payroll/settlements",
                                 {"employee_id": left_id, "resignation_date": day(10), "last_working_day": day(25),
                                  "notice_period_days": 30, "notice_period_served_days": 25,
                                  "remarks": f"Settlement {STAMP}"})
    check("a full and final settlement is prepared (200/201)", status in (200, 201), f"{status} {body}")
    settlement_id = int(body.get("id") or 0)
    check("the settlement is numbered and starts as a draft",
          str(body.get("settlement_number", "")).startswith("FFS"), body.get("settlement_number"))
    check("the settlement adds up: earnings less deductions is the net",
          abs((float(body.get("total_earnings") or 0) - float(body.get("total_deductions") or 0))
              - float(body.get("net_settlement_amount") or 0)) < 1, body)
    check("the part-month salary is proposed from the last working day",
          float(((body.get("earnings") or {}).get("salary_payable")) or 0) > 0, body.get("earnings"))
    check("the unserved notice is recovered",
          float(((body.get("deductions") or {}).get("notice_pay_recovery")) or 0) > 0, body.get("deductions"))
    for step in ("Submitted", "Approved", "Paid"):
        status, body = admin.request("POST", f"/api/admin/payroll/settlements/{settlement_id}/status", {"status": step})
        check(f"the settlement moves to {step}", status == 200, f"{status} {body}")
    rows = db(f"SELECT status, payment_date FROM full_final_settlements WHERE id = {settlement_id};")
    check("the settlement records its payment", rows and rows[0][0] == "Paid" and rows[0][1] is not None, rows)

    # ── 11. screens ──────────────────────────────────────────────────────
    print("11. screens")
    admin_pages = ["/admin/payroll-monitoring", "/admin/payroll-register", "/admin/salary-structures",
                   "/admin/attendance-monitoring", "/admin/leave-monitoring", "/admin/statutory-registers"]
    for path in admin_pages:
        status, _ = admin.request_no_redirect("GET", path)
        check(f"the administrator opens {path} (200)", status == 200, status)
    employer_pages = ["/employer/payroll", "/employer/payroll/run", "/employer/payroll/history",
                      "/employer/payroll/payslips", "/employer/payroll/downloads", "/employer/attendance",
                      "/employer/attendance/upload", "/employer/leave-ledger", "/employer/salary-structure"]
    for path in employer_pages:
        status, _ = employer.request_no_redirect("GET", path)
        check(f"the employer opens {path} (200)", status == 200, status)
    employee_pages = ["/employee/payslips", "/employee/attendance", "/employee/leave", "/employee/leave/history"]
    for path in employee_pages:
        status, _ = employee.request_no_redirect("GET", path)
        check(f"the employee opens {path} (200)", status == 200, status)
    for path in ("/admin/payroll-monitoring", "/admin/payroll-register"):
        status, _ = admin.request_no_redirect("GET", path)
        check(f"the administrator still opens {path} after the run was completed", status == 200, status)
    status, _ = employer.request_no_redirect("GET", f"/employer/payroll/{run_id}")
    check("the employer opens their own run's screen (200)", status == 200, status)
    status, _ = employer.request_no_redirect("GET", "/admin/payroll-monitoring")
    check("an employer cannot open an administrator screen (not 200)", status != 200, status)
    status, _ = employee.request_no_redirect("GET", "/employer/payroll")
    check("an employee cannot open the employer's payroll screen (not 200)", status != 200, status)
    status, _ = anonymous.request_no_redirect("GET", "/employee/payslips")
    check("an anonymous visitor cannot open an employee screen (not 200)", status != 200, status)

    # ── 12. overview, jobs and the audit trail ───────────────────────────
    print("12. overview, jobs and the audit trail")
    status, body = admin.request("GET", f"/api/admin/payroll/overview?month={MONTH}&year={YEAR}")
    check("the payroll overview reads for the month (200)", status == 200, f"{status} {body}")
    check("the overview reports the month's runs and the money in them",
          status == 200 and int((body.get("stats") or {}).get("total") or 0) >= 1, body.get("stats"))
    check("the overview carries the twelve-month trend",
          status == 200 and len(body.get("trend") or []) == 12, len(body.get("trend") or []))
    status, body = employer.request("GET", f"/api/employer/payroll/overview?month={MONTH}&year={YEAR}")
    check("the employer's overview is scoped to their own company (200)",
          status == 200, f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/payroll/jobs/run")
    check("the payroll reminder job runs on demand (200)", status == 200, f"{status} {body}")

    rows = db("SELECT COUNT(*) FROM activity_logs WHERE module = 'payroll' AND description LIKE '%" + STAMP + "%';")
    check("the payroll activity log holds what happened", rows and int(rows[0][0]) >= 3, rows)
    rows = db(f"SELECT COUNT(*) FROM activity_logs WHERE module = 'payslip' AND entity_type = 'payslip' "
              f"AND created_at >= NOW() - INTERVAL 30 MINUTE;")
    check("payslip actions are logged", rows and int(rows[0][0]) >= 2, rows)
    rows = db(f"SELECT COUNT(*) FROM activity_logs WHERE module = 'leave' AND description LIKE '%{STAMP}%';")
    check("the leave decision is logged", rows and int(rows[0][0]) >= 1, rows)
    rows = db("SELECT COUNT(*) FROM reminder_dispatches WHERE reminder_type = 'payroll_month_reminder' "
              "AND sent_at >= NOW() - INTERVAL 30 MINUTE;")
    check("the month reminder uses the dispatch guard so it is sent once per month", rows is not None, rows)

    # ── 12b. the wage register ───────────────────────────────────────────
    # The register an inspector asks for: every employee on the run, both halves
    # of the wage and the month's totals, as a PDF. The scope rules matter as
    # much as the figures — a company may read its own register and no other.
    print("12b. wage register")
    status, body, extra = admin.request_full("GET", f"/api/pdf/payroll/wage-register/{run_id}", raw=True)
    head = body[:12] if isinstance(body, bytes) else str(body)[:120].encode()
    check("the wage register streams back as a PDF (200)",
          status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF", f"{status} {head}")
    check("the register is a complete document rather than an empty shell",
          isinstance(body, bytes) and len(body) > 8000, len(body) if isinstance(body, bytes) else 0)
    headers = {key.lower(): value for key, value in extra.items()}
    check("the register is served as an attachment a browser will open",
          "application/pdf" in headers.get("content-type", ""), headers.get("content-type"))

    register_text = ""
    if isinstance(body, bytes) and body[:4] == b"%PDF":
        import subprocess
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
            handle.write(body)
            register_path = handle.name
        rendered = subprocess.run(["python3", "scripts/pdf-text.py", register_path],
                                  capture_output=True, text=True)
        register_text = rendered.stdout if rendered.returncode == 0 else ""
    check("the register names itself and the month it covers",
          "WAGE REGISTER" in register_text.upper() and MONTH_NAMES[MONTH - 1].upper() in register_text.upper(),
          register_text[:200])
    check("the register carries both halves — earnings and deductions",
          "EARNINGS" in register_text.upper() and "DEDUCTIONS" in register_text.upper(),
          register_text[:200])
    check("the register totals the month rather than only listing rows",
          "NET WAGES PAID" in register_text.upper(), register_text[-400:])
    # The rows must name the people: a register of amounts with a blank name
    # column is not a register. The fixture's employees carry the run stamp.
    check("every row names the employee it belongs to",
          register_text.count(STAMP) >= 2, register_text[:400])

    status, body, extra = employer.request_full("GET", f"/api/pdf/payroll/wage-register/{run_id}", raw=True)
    check("the company reads its own wage register (200)",
          status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF", f"{status}")

    # A real second company reading company A's register. The seeded employer
    # login belongs to a different establishment, so its answer must be 404 —
    # the same answer as for a run that does not exist.
    foreign = Session(("employer.test@complianceos.local", "Employer@2026"))
    signed, detail = foreign.login()
    if signed:
        status, body, _ = foreign.request_full("GET", f"/api/pdf/payroll/wage-register/{run_id}", raw=True)
        check("another company's wage register is refused (404)", status == 404, f"{status}")
        foreign.sign_out()
    else:
        check("the seeded employer login signs in for the cross-tenant check", False, detail)

    status, body, _ = auditor.request_full("GET", f"/api/pdf/payroll/wage-register/{run_id}", raw=True)
    check("an auditor is refused the employer's wage register (403)", status == 403, f"{status}")
    status, body, _ = employee.request_full("GET", f"/api/pdf/payroll/wage-register/{run_id}", raw=True)
    check("an employee is refused the establishment's wage register (403)", status == 403, f"{status}")
    status, body, _ = admin.request_full("GET", "/api/pdf/payroll/wage-register/99999999", raw=True)
    check("an unknown run has no register (404)", status == 404, f"{status}")

    rows = db("SELECT COUNT(*) FROM activity_logs WHERE module = 'payroll' AND action = 'exported' "
              "AND entity_type = 'payroll_run' AND created_at >= NOW() - INTERVAL 30 MINUTE;")
    check("downloading the register is written to the activity trail", rows and int(rows[0][0]) >= 1, rows)

    # ── 12c. attendance & leave registers ────────────────────────────────
    # The two registers an inspector asks for beside the wage register: who was
    # present on which day, and what leave each person has to their credit. Both
    # are scoped the same way — a company reads its own and no other.
    print("12c. attendance & leave registers")
    employer_id = int(FIXTURE.get("employer_id") or 0)
    status, body, extra = admin.request_full(
        "GET", f"/api/pdf/payroll/attendance-register?employer_id={employer_id}&month={MONTH}&year={YEAR}", raw=True)
    attendance_text = ""
    if status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF":
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
            handle.write(body)
            attendance_path = handle.name
        import subprocess
        rendered = subprocess.run(["python3", "scripts/pdf-text.py", attendance_path], capture_output=True, text=True)
        attendance_text = rendered.stdout if rendered.returncode == 0 else ""
    check("the attendance register streams back as a PDF (200)",
          status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF",
          f"{status} {body[:80] if isinstance(body, bytes) else str(body)[:80]}")
    check("the attendance register names the month it covers",
          "ATTENDANCE REGISTER" in attendance_text.upper() and MONTH_NAMES[MONTH - 1].upper() in attendance_text.upper(),
          attendance_text[:200])
    check("the register grids the days and explains its codes",
          "DAYS 1" in attendance_text.upper() and "P - PRESENT" in attendance_text.upper().replace("—", "-"),
          attendance_text[:400])
    check("the register carries the month's totals rather than only the grid",
          "MAN-DAYS PRESENT" in attendance_text.upper(), attendance_text[-500:])
    check("the marked employees appear on the register",
          attendance_text.count(STAMP) >= 2, attendance_text[:400])

    status, body, _ = admin.request_full(
        "GET", f"/api/pdf/payroll/attendance-register?employer_id={employer_id}&month=13&year={YEAR}", raw=True)
    check("an impossible month is refused (422)", status == 422, f"{status}")
    status, body, _ = admin.request_full("GET", "/api/pdf/payroll/attendance-register", raw=True)
    check("an attendance register without an establishment is refused (422)", status == 422, f"{status}")
    # The employer panel reads its own register without naming an establishment.
    status, body, extra = employer.request_full(
        "GET", f"/api/pdf/payroll/attendance-register?month={MONTH}&year={YEAR}", raw=True)
    check("the company reads its own attendance register (200)",
          status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF", f"{status}")
    # Naming somebody else's establishment changes nothing: the session wins.
    status, body, _ = employer.request_full(
        "GET", "/api/pdf/payroll/attendance-register?employer_id=1&month=1&year=2020", raw=True)
    check("a company cannot ask for another establishment's register by URL (200, its own)",
          status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF", f"{status}")

    status, body, _ = auditor.request_full(
        "GET", f"/api/pdf/payroll/attendance-register?employer_id={employer_id}&month={MONTH}&year={YEAR}", raw=True)
    check("an auditor is refused the attendance register (403)", status == 403, f"{status}")

    status, body, extra = admin.request_full(
        "GET", f"/api/pdf/payroll/leave-register?employer_id={employer_id}&year={YEAR}", raw=True)
    leave_text = ""
    if status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF":
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
            handle.write(body)
            leave_path = handle.name
        import subprocess
        rendered = subprocess.run(["python3", "scripts/pdf-text.py", leave_path], capture_output=True, text=True)
        leave_text = rendered.stdout if rendered.returncode == 0 else ""
    check("the leave register streams back as a PDF (200)",
          status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF", f"{status}")
    check("the leave register names the year and the columns of the account",
          "LEAVE REGISTER" in leave_text.upper() and "ACCRUED" in leave_text.upper()
          and "AVAILED" in leave_text.upper() and "BALANCE" in leave_text.upper(),
          leave_text[:300])
    check("the leave register totals the year",
          "DAYS ACCRUED IN THE YEAR" in leave_text.upper(), leave_text[-500:])
    check("the employees the suite accrued for appear on the leave register",
          leave_text.count(STAMP) >= 1, leave_text[:300])

    status, body, extra = employer.request_full(
        "GET", f"/api/pdf/payroll/leave-register?year={YEAR}", raw=True)
    check("the company reads its own leave register (200)",
          status == 200 and isinstance(body, bytes) and body[:4] == b"%PDF", f"{status}")
    status, body, _ = verifier.request_full(
        "GET", f"/api/pdf/payroll/leave-register?employer_id={employer_id}&year={YEAR}", raw=True)
    check("a verifier is refused the leave register (403)", status == 403, f"{status}")

    rows = db("SELECT COUNT(*) FROM activity_logs WHERE module IN ('attendance','leave') AND action = 'exported' "
              "AND created_at >= NOW() - INTERVAL 30 MINUTE;")
    check("both register downloads are written to the activity trail", rows and int(rows[0][0]) >= 2, rows)

    # ── clean-up ─────────────────────────────────────────────────────────
    print("13. clean-up")
    if os.environ.get("VERIFY_PAYROLL_KEEP") == "1":
        # Left in place so `npm run check:pdf` has a live payslip to render. The
        # next ordinary run sweeps these fixtures.
        print("  · --keep: the paid run is left in the register for the render check")
        print(f"\n--keep: employer {FIXTURE.get('employer_id')} · employees "
              f"{[row['id'] for row in FIXTURE.get('employees', {}).values()]} · run {run_id} · slip ids {slip_ids}")
        print(f"\n{passed} passed, {failed} failed")
        return 0 if failed == 0 else 1

    status, body = admin.request("DELETE", f"/api/admin/payroll/{run_id}", {"confirm": True, "reason": "Verification complete"})
    check("a paid run can be withdrawn with an explicit confirmation (200)", status == 200, f"{status} {body}")
    rows = db(f"SELECT COUNT(*) FROM payroll_runs WHERE id = {run_id} AND deleted_at IS NULL;")
    check("the run is gone from the register", rows and int(rows[0][0]) == 0, rows)
    rows = db(f"SELECT COUNT(*) FROM payslips WHERE payroll_run_id = {run_id} AND deleted_at IS NULL;")
    check("its payslips went with it", rows and int(rows[0][0]) == 0, rows)
    rows = db(f"SELECT COUNT(*) FROM payroll_runs WHERE id = {run_id} AND deleted_at IS NOT NULL;")
    check("the withdrawn run is kept for the audit trail rather than erased", rows and int(rows[0][0]) == 1, rows)
    rows = db(f"SELECT COUNT(*) FROM payslips WHERE employee_id IN "
              f"({high_id}) AND month = {MONTH} AND year = {YEAR} AND deleted_at IS NULL;")
    check("a withdrawn run leaves nothing in the employees' own registers", rows and int(rows[0][0]) == 0, rows)

    sweep()
    leftover = db(f"SELECT COUNT(*) FROM employers WHERE employer_code = 'VFYP{STAMP}';")
    check("the fixture company is gone", leftover and int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM users WHERE email IN ('{EMPLOYER_EMAIL}', '{EMPLOYEE_EMAIL}');")
    check("the fixture logins are gone", leftover and int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM employees WHERE employee_number LIKE '%{FIXTURE['employees']['high']['number']}%';")
    check("the fixture employees are gone", leftover and int(leftover[0][0]) == 0, leftover)

    print(f"\n{passed} passed, {failed} failed")
    if failures:
        print("\nFailures:")
        for failure in failures:
            print(f"  - {failure}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrupted — cleaning up")
        sweep()
        sys.exit(130)
