"""Creates a small, self-contained DEMO set on a running ComplianceOS (the live site) through its own API, so a client can be shown the whole flow:

    one employer (with a unit, a department and a portal login), one employee login, one verifier login,
    and an audit assigned to an EXISTING auditor, so that auditor can start a CAPAR report.

Safe to run again: anything already there (same email or code) is reused, not duplicated.
Nothing from the local demo data is copied: no super administrator and no password from the README.

Run on the server, from the project folder:

    LIVE_ADMIN_EMAIL='you@company.com' LIVE_ADMIN_PASSWORD='...' DEMO_PASSWORD='Choose@A1Password' \\
    LIVE_AUDITOR_EMAIL='auditor@gmail.com' python3 scripts/seed-live-demo.py

LIVE_ADMIN_* is an administrator that exists on the site. DEMO_PASSWORD becomes the password of the employer, employee and verifier
demo logins (they do not have to change it at first login). SEED_BASE (default http://127.0.0.1:3001) is the app's address.
"""
import json
import os
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import Session  # noqa: E402  (standard library only)

ROOT = Path(__file__).resolve().parent.parent


def need(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Set {name} (see the top of this file).")
    return value


ADMIN_EMAIL = need("LIVE_ADMIN_EMAIL")
ADMIN_PASSWORD = need("LIVE_ADMIN_PASSWORD")
DEMO_PASSWORD = need("DEMO_PASSWORD")
AUDITOR_EMAIL = need("LIVE_AUDITOR_EMAIL").strip().lower()

EMPLOYER_EMAIL = os.environ.get("DEMO_EMPLOYER_EMAIL", "employer@gmail.com").lower()
EMPLOYEE_EMAIL = os.environ.get("DEMO_EMPLOYEE_EMAIL", "employee@gmail.com").lower()
VERIFIER_EMAIL = os.environ.get("DEMO_VERIFIER_EMAIL", "verifier@gmail.com").lower()
CODE = "DEMO-001"


def iso(offset=0):
    return (date.today() + timedelta(days=offset)).isoformat()


admin = Session((ADMIN_EMAIL, ADMIN_PASSWORD))
ok, detail = admin.login()
if not ok:
    sys.exit(f"Cannot sign in as {ADMIN_EMAIL}: {detail}")


def rows(body):
    data = body.get("data") if isinstance(body, dict) else None
    if isinstance(data, list):
        return data
    if isinstance(body, dict) and isinstance(body.get("users"), list):
        return body["users"]
    return []


def call(method, path, payload=None, what=""):
    status, body = admin.send(method, path, payload)
    if status not in (200, 201):
        message = body.get("message") if isinstance(body, dict) else body
        issues = body.get("errors") if isinstance(body, dict) else None
        sys.exit(f"{what or path} failed ({status}): {message} {issues or ''}")
    return body


def find_user(email):
    status, body = admin.send("GET", f"/api/admin/users?search={email}&limit=20")
    return next((u for u in rows(body) if str(u.get("email", "")).lower() == email), None)


def create_user_login(email, name, role):
    """Sets a known password on a login and clears the first-login change, using the project's own tool."""
    result = subprocess.run(
        ["npm", "run", "--silent", "create:admin", "--", "--email", email, "--name", name, "--role", role, "--password", DEMO_PASSWORD],
        cwd=ROOT, capture_output=True, text=True, shell=(os.name == "nt"))
    if result.returncode != 0:
        sys.exit(f"Could not set the password for {email}: {result.stderr.strip() or result.stdout.strip()}")


print("1. Auditor")
status, body = admin.send("GET", f"/api/admin/auditors?search={AUDITOR_EMAIL}&limit=20")
auditor = next((a for a in rows(body) if str(a.get("email", "")).lower() == AUDITOR_EMAIL), None)
if not auditor:
    names = ", ".join(sorted({str(a.get("email")) for a in rows(admin.send("GET", "/api/admin/auditors?limit=50")[1])}))
    sys.exit(f"No auditor with the email {AUDITOR_EMAIL}. Auditors on this site: {names or 'none'}")
print(f"   using {auditor['name']} ({auditor.get('auditor_code')}) #{auditor['id']}")

print("2. Employer, unit, department")
status, body = admin.send("GET", f"/api/admin/employers?search={CODE}&limit=5")
employer = next((e for e in rows(body) if e.get("employer_code") == CODE), None)
if not employer:
    result = call("POST", "/api/admin/employers", {
        "employer_code": CODE, "company_name": "Demo Industries Private Limited", "industry_type": "Manufacturing", "company_type": "Private Limited",
        "year_of_establishment": 2010, "email": "info@demo-industries.example", "mobile": "+919800000001",
        "address_line_1": "21, Industrial Estate", "city": "Coimbatore", "state": "Tamil Nadu", "pincode": "641021",
        "contact_person_name": "Demo HR Manager", "contact_person_designation": "HR Manager",
        "contact_person_email": EMPLOYER_EMAIL, "contact_person_mobile": "+919800000002",
        "approximate_employee_count": 120, "number_of_units": 1,
        "create_portal_user": True, "portal_user_email": EMPLOYER_EMAIL, "portal_user_name": "Demo HR Manager", "portal_user_mobile": "+919800000002",
    }, "create the employer")
    employer_id = int(result.get("employerId") or result["data"]["employerId"])
    print(f"   created employer #{employer_id}")
else:
    employer_id = int(employer["id"])
    print(f"   employer #{employer_id} already there")

status, body = admin.send("GET", f"/api/admin/employers/{employer_id}/units")
unit = next(iter(rows(body)), None)
if unit:
    unit_id = int(unit["id"])
else:
    unit_id = int(call("POST", f"/api/admin/employers/{employer_id}/units", {
        "unit_name": "Main Plant", "unit_code": "MAIN", "address_line1": "21, Industrial Estate", "city": "Coimbatore", "state": "Tamil Nadu", "pincode": "641021"},
        "create the unit")["unitId"])
status, body = admin.send("GET", f"/api/admin/employers/{employer_id}/departments")
department = next(iter(rows(body)), None)
if department:
    department_id = int(department["id"])
else:
    department_id = int(call("POST", f"/api/admin/employers/{employer_id}/departments",
                             {"unit_id": unit_id, "department_name": "Production", "department_code": "PROD"}, "create the department")["departmentId"])

print("3. Employee")
if not find_user(EMPLOYEE_EMAIL):
    sample = json.loads((Path(__file__).parent / "fixtures" / "full-employee.json").read_text(encoding="utf-8"))
    employee = {
        **{k: v for k, v in sample.items() if k not in ("nominees", "qualifications", "experience", "dependents", "references", "interview", "checklist")},
        "name": "Demo Employee", "father_name": "Demo Father", "mother_name": "Demo Mother", "spouse_name": None, "sex": "Male", "marital_status": "Single",
        "date_of_birth": iso(-365 * 28), "aadhaar_number": "299900000001", "pan_number": "ABCDE1234F", "mobile": "+919800000003", "email": "demo.employee@example.com",
        "present_address": "5, Gandhi Nagar, Coimbatore", "city": "Coimbatore", "pincode": "641011",
        "employer_id": employer_id, "unit_id": unit_id, "department_id": department_id, "date_of_joining": iso(-400), "date_of_confirmation": iso(-220),
        "designation": "Machine Operator", "department": "Production", "basic_salary": 15000, "da": 3750, "hra": 3000, "ta": 500, "pa": 300, "ea": 200, "npba": 100,
        "other_allowances": 0, "pf_number": "TN/COI/99999/000/0000001", "uan": "100299999991", "esi_number": "3300999999990001", "mediclaim_number": "ML2026000001",
        "bank_account_number": "601299999991", "ifsc_code": "IDIB000C123", "status": "active",
        "nominees": sample["nominees"][:1], "qualifications": sample["qualifications"][:1], "experience": sample["experience"][:1],
        "dependents": sample["dependents"][:1], "references": sample["references"][:1], "interview": sample["interview"], "checklist": sample["checklist"][:4],
        "create_login": True, "login_email": EMPLOYEE_EMAIL,
    }
    call("POST", "/api/admin/employees", employee, "create the employee")
    print("   created")
else:
    print("   employee login already there")

print("4. Verifier")
if not find_user(VERIFIER_EMAIL):
    call("POST", "/api/admin/users", {"first_name": "Demo", "last_name": "Verifier", "email": VERIFIER_EMAIL, "role_slugs": ["verifier"]}, "create the verifier")
    print("   created")
else:
    print("   verifier login already there")
verifier = find_user(VERIFIER_EMAIL)

print("5. Passwords")
create_user_login(EMPLOYER_EMAIL, "Demo HR Manager", "employer")
create_user_login(EMPLOYEE_EMAIL, "Demo Employee", "employee")
create_user_login(VERIFIER_EMAIL, "Demo Verifier", "verifier")
print("   set (first-login change not required)")

print("6. Audit assigned to the auditor")
title = "Demo: Fire safety and statutory document audit"
status, body = admin.send("GET", f"/api/admin/audit-assignments?search=Demo&limit=50")
existing = next((a for a in rows(body) if a.get("audit_title") == title and int(a.get("employer_id", 0)) == employer_id), None)
if existing:
    print(f"   {existing.get('assignment_number')} already there")
else:
    result = call("POST", "/api/admin/audit-assignments", {
        "assignment_type": "AUDIT", "audit_title": title, "employer_id": employer_id, "unit_id": unit_id, "department_id": department_id,
        "auditor_id": int(auditor["id"]), "verifier_id": int(verifier["id"]),
        "start_date": iso(0), "end_date": iso(4), "due_date": iso(14), "priority": "Medium", "fee_amount": 25000,
        "scope": "Statutory registers, fire safety, welfare amenities and the documents in the Audit Documents checklist.",
        "instructions": "Demo audit.",
    }, "assign the audit")
    print(f"   assigned (#{result.get('assignmentId')})")

print("7. CAPAR Management suggestions (documents per auditor type)")
status, body = admin.send("POST", "/api/admin/capar/management/suggest", {})
print("   " + (f"{body.get('data', {}).get('added', 0)} assignments added" if status == 200 else f"skipped (HTTP {status}); deploy the latest version first"))

print("\nDemo logins (open the site's /login):")
print(f"   Auditor   {AUDITOR_EMAIL}   (password unchanged)")
print(f"   Employer  {EMPLOYER_EMAIL}   {DEMO_PASSWORD}")
print(f"   Employee  {EMPLOYEE_EMAIL}   {DEMO_PASSWORD}")
print(f"   Verifier  {VERIFIER_EMAIL}   {DEMO_PASSWORD}")
