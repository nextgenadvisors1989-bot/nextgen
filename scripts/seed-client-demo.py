"""ONE connected demo story for the client, built through the site's own API, so every role sees the same company and the same records.

    The company       Demo Industries Private Limited (employer code DEMO-001): a unit, a department, three employees, a login for the HR manager and for one employee.
    The audit team    two auditors audit it; one of them is ALSO a verifier (both roles on one login) and verifies the other's report; a separate verifier verifies his.
    The records       a signed audit report with photographs, a signed Permit to Work, Form 3 (hazardous waste register), five days of factory data,
                      a CAPAR report from the first findings to the closing signatures. Every form carries the drawn signatures of the auditor and the verifier.
    The reports       the PDF of each record is fetched at the end and its size is printed, so nothing is left unchecked.

Run on the server (or locally), from the project folder, AFTER the release is installed (migrations, scripts/install-aa-forms.py and scripts/install-ptw-forms.py):

    LIVE_ADMIN_EMAIL='you@company.com' LIVE_ADMIN_PASSWORD='...' DEMO_PASSWORD='Choose@A1Password' python3 scripts/seed-client-demo.py

DEMO_PASSWORD becomes the password of every demo login (no change at first sign-in is asked). Nothing from the local demo data is copied, no password is stored in the
repository, and the script is safe to run again: whatever already exists (same e-mail, code, title) is reused, not repeated.
SEED_BASE (default http://127.0.0.1:3001) is the app's address. PHOTO_DIR (default scripts/fixtures/demo-photos) holds the site photographs; without it plain pictures are used.
"""
import base64
import json
import math
import os
import random
import struct
import subprocess
import sys
import zlib
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from seed_lib import Session, multipart  # noqa: E402  (standard library only)


def need(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Set {name} (see the top of this file).")
    return value


ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_PASSWORD = need("LIVE_ADMIN_EMAIL"), need("LIVE_ADMIN_PASSWORD"), need("DEMO_PASSWORD")
PHOTO_DIR = Path(os.environ.get("PHOTO_DIR", HERE / "fixtures" / "demo-photos"))
SUFFIX = os.environ.get("DEMO_TITLE_SUFFIX", "")   # a second, separate set of records for the same company (for a repeat demo)

LOGIN = {
    "admin": os.environ.get("DEMO_ADMIN_EMAIL", "demo.admin@nextgenseadvisors.com").lower(),
    "employer": os.environ.get("DEMO_EMPLOYER_EMAIL", "employer@gmail.com").lower(),
    "employee": os.environ.get("DEMO_EMPLOYEE_EMAIL", "employee@gmail.com").lower(),
    "auditor": os.environ.get("DEMO_AUDITOR_EMAIL", "auditor@gmail.com").lower(),
    "team": os.environ.get("DEMO_TEAM_EMAIL", "team.auditor@nextgenseadvisors.com").lower(),
    "verifier": os.environ.get("DEMO_VERIFIER_EMAIL", "verifier@gmail.com").lower(),
}
CODE = "DEMO-001"
TODAY = date.today()


def iso(offset=0):
    return (TODAY + timedelta(days=offset)).isoformat()


admin = Session((ADMIN_EMAIL, ADMIN_PASSWORD))
ok_, detail = admin.login()
if not ok_:
    sys.exit(f"Cannot sign in as {ADMIN_EMAIL}: {detail}")


def rows(body):
    data = body.get("data") if isinstance(body, dict) else None
    if isinstance(data, list):
        return data
    if isinstance(body, dict):
        for key in ("users", "rows", "items"):
            if isinstance(body.get(key), list):
                return body[key]
    return body if isinstance(body, list) else []


def data_of(body):
    return body.get("data") if isinstance(body, dict) and isinstance(body.get("data"), dict) else (body if isinstance(body, dict) else {})


def must(label, status, body, expect=(200, 201)):
    if status not in expect:
        message = body.get("message") if isinstance(body, dict) else body
        issues = body.get("errors") if isinstance(body, dict) else None
        sys.exit(f"{label} failed ({status}): {message} {json.dumps(issues)[:400] if issues else ''}")
    return body


def step(text):
    print(f"\n{text}")


# ── pictures: signatures drawn like a hand, photographs from the folder ──────────────────────
def _png(width, height, pixels):
    raw = b"".join(b"\x00" + bytes(pixels[y * width * 3:(y + 1) * width * 3]) for y in range(height))

    def chunk(kind, payload):
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def signature_png(seed):
    """A hand-drawn looking signature (blue ink on white)."""
    random.seed(seed)
    width, height = 440, 150
    pixels = bytearray(b"\xff" * (width * height * 3))

    def plot(x, y, thick=1):
        for dx in range(-thick, thick + 1):
            for dy in range(-thick, thick + 1):
                px, py = int(x) + dx, int(y) + dy
                if 0 <= px < width and 0 <= py < height:
                    at = (py * width + px) * 3
                    pixels[at:at + 3] = bytes((20, 30, 90))
    previous = None
    x = 20
    while x < width - 20:
        y = height / 2 + math.sin(x / 11 + seed) * random.randint(18, 42) + random.randint(-6, 6)
        if previous:
            for s in range(7):
                plot(previous[0] + (x - previous[0]) * s / 6, previous[1] + (y - previous[1]) * s / 6)
        previous = (x, y)
        x += 6
    for x in range(30, width - 60):
        plot(x, height - 30 - (x - 30) * 14 / (width - 90))
    return _png(width, height, pixels)


def photo(name, label="Site photograph"):
    """(file name, bytes, mime) of a demo photograph: the real picture when the folder has it, a plain labelled picture otherwise."""
    for ext, mime in (("jpg", "image/jpeg"), ("png", "image/png")):
        path = PHOTO_DIR / f"{name}.{ext}"
        if path.exists():
            return path.name, path.read_bytes(), mime
    width, height = 320, 200
    pixels = bytearray(bytes((176, 190, 197)) * (width * height))
    for x in range(width):
        for y in range(160, height):
            pixels[(y * width + x) * 3:(y * width + x) * 3 + 3] = bytes((40, 50, 58))
    return f"{name}.png", _png(width, height, pixels), "image/png"


def upload(session, name, content, mime, sid, category):
    file = session.upload(name, content, "SUBMISSION", sid, category, mime)
    if not file or "id" not in file:
        sys.exit(f"Could not upload {name}")
    return int(file["id"])


# ── logins ──────────────────────────────────────────────────────────────────────────
def find_user(email):
    status, body = admin.send("GET", f"/api/admin/users?search={email}&limit=20")
    return next((u for u in rows(body) if str(u.get("email", "")).lower() == email), None)


def set_login(email, name, role):
    """Creates the login or resets it, adds the role, sets DEMO_PASSWORD and clears the first-login change (the project's own tool)."""
    result = subprocess.run(["npm", "run", "--silent", "create:admin", "--", "--email", email, "--name", name, "--role", role, "--password", DEMO_PASSWORD, "--username", email.replace("@", ".")],
                            cwd=ROOT, capture_output=True, text=True, shell=(os.name == "nt"))
    if result.returncode != 0:
        sys.exit(f"Could not set the login {email}: {result.stderr.strip() or result.stdout.strip()}")


step("1. Logins")
set_login(LOGIN["admin"], "Demo Administrator", "admin")
print(f"   administrator  {LOGIN['admin']}")

# ── the company ─────────────────────────────────────────────────────────────────────
step("2. The company")
status, body = admin.send("GET", f"/api/admin/employers?search={CODE}&limit=5")
employer = next((e for e in rows(body) if e.get("employer_code") == CODE), None)
if not employer:
    result = must("create the company", *admin.send("POST", "/api/admin/employers", {
        "employer_code": CODE, "company_name": "Demo Industries Private Limited", "industry_type": "Textiles", "company_type": "Private Limited",
        "year_of_establishment": 2010, "email": "info@demo-industries.example", "mobile": "+919800000001",
        "address_line_1": "21, Industrial Estate", "city": "Coimbatore", "state": "Tamil Nadu", "pincode": "641021",
        "contact_person_name": "Demo HR Manager", "contact_person_designation": "HR Manager", "contact_person_email": LOGIN["employer"], "contact_person_mobile": "+919800000002",
        "approximate_employee_count": 120, "number_of_units": 1,
        "create_portal_user": True, "portal_user_email": LOGIN["employer"], "portal_user_name": "Demo HR Manager", "portal_user_mobile": "+919800000002"}))
    employer_id = int(data_of(result).get("employerId") or result.get("employerId"))
    print(f"   created #{employer_id}")
else:
    employer_id = int(employer["id"])
    print(f"   #{employer_id} already there")
set_login(LOGIN["employer"], "Demo HR Manager", "employer")

status, body = admin.send("GET", f"/api/admin/employers/{employer_id}/units")
unit = next(iter(rows(body)), None)
unit_id = int(unit["id"]) if unit else int(data_of(must("unit", *admin.send("POST", f"/api/admin/employers/{employer_id}/units", {
    "unit_name": "Main Plant", "unit_code": "MAIN", "address_line1": "21, Industrial Estate", "city": "Coimbatore", "state": "Tamil Nadu", "pincode": "641021"}))).get("unitId"))
status, body = admin.send("GET", f"/api/admin/employers/{employer_id}/departments")
department = next(iter(rows(body)), None)
department_id = int(department["id"]) if department else int(data_of(must("department", *admin.send("POST", f"/api/admin/employers/{employer_id}/departments", {
    "unit_id": unit_id, "department_name": "Production", "department_code": "PROD"}))).get("departmentId"))

step("3. Employees")
sample = json.loads((HERE / "fixtures" / "full-employee.json").read_text(encoding="utf-8"))
PEOPLE = [("Demo Employee", LOGIN["employee"], "Machine Operator", "Male", 15000), ("Revathi K", None, "Quality Inspector", "Female", 17000), ("Murugan S", None, "Fitter", "Male", 18500)]
for index, (name, login, designation, sex, basic) in enumerate(PEOPLE):
    status, body = admin.send("GET", f"/api/admin/employees?search={name.split()[0]}&limit=20")
    if any(str(e.get("name", "")) == name and int(e.get("employer_id", 0) or 0) == employer_id for e in rows(body)) or (login and find_user(login)):
        print(f"   {name} already there")
        continue
    payload = {
        **{k: v for k, v in sample.items() if k not in ("nominees", "qualifications", "experience", "dependents", "references", "interview", "checklist")},
        "name": name, "father_name": "Demo Father", "mother_name": "Demo Mother", "spouse_name": None, "sex": sex, "marital_status": "Single",
        "date_of_birth": iso(-365 * (26 + index)), "aadhaar_number": f"2999000000{index + 1:02d}", "pan_number": f"ABCDE12{index}4F", "mobile": f"+9198000000{index + 3:02d}",
        "email": f"demo.employee{index}@example.com", "present_address": "5, Gandhi Nagar, Coimbatore", "city": "Coimbatore", "pincode": "641011",
        "employer_id": employer_id, "unit_id": unit_id, "department_id": department_id, "date_of_joining": iso(-400 + index * 30), "date_of_confirmation": iso(-220 + index * 30),
        "designation": designation, "department": "Production", "basic_salary": basic, "da": round(basic * 0.25), "hra": 3000, "ta": 500, "pa": 300, "ea": 200, "npba": 100,
        "other_allowances": 0, "pf_number": f"TN/COI/99999/000/000000{index + 1}", "uan": f"10029999999{index + 1}", "esi_number": f"330099999999000{index + 1}",
        "mediclaim_number": f"ML202600000{index + 1}", "bank_account_number": f"60129999999{index + 1}", "ifsc_code": "IDIB000C123", "status": "active",
        "nominees": sample["nominees"][:1], "qualifications": sample["qualifications"][:1], "experience": sample["experience"][:1], "dependents": sample["dependents"][:1],
        "references": sample["references"][:1], "interview": sample["interview"], "checklist": sample["checklist"][:4],
    }
    if login:
        payload.update({"create_login": True, "login_email": login})
    must(f"employee {name}", *admin.send("POST", "/api/admin/employees", payload))
    print(f"   created {name}")
set_login(LOGIN["employee"], "Demo Employee", "employee")

# ── the audit team ──────────────────────────────────────────────────────────────────
step("4. Auditors and verifiers")
types = rows(admin.send("GET", "/api/admin/auditor-types?limit=100")[1])
type_id = int(types[0]["id"]) if types else 1


def auditor_profile(email, name, mobile, title, specialization):
    status, body = admin.send("GET", f"/api/admin/auditors?search={email}&limit=20")
    found = next((a for a in rows(body) if str(a.get("email", "")).lower() == email), None)
    if found:
        return int(found["id"])
    payload = {"name": name, "email": email, "mobile": mobile, "auditor_type_id": type_id, "role_title": title, "specialization": specialization,
               "qualification": "B.E., Certified Lead Auditor", "experience_years": 9, "city": "Coimbatore", "state": "Tamil Nadu", "pincode": "641011", "address": "10, Gandhi Nagar",
               "date_of_joining": iso(-800), "max_concurrent_audits": 6, "status": "active"}
    existing_user = find_user(email)
    if not existing_user:
        payload.update({"create_portal_user": True, "portal_user_email": email, "portal_user_name": name})
    result = must(f"auditor {name}", *admin.send("POST", "/api/admin/auditors", payload))
    auditor_id = int(data_of(result).get("auditorId") or result.get("auditorId"))
    if existing_user:
        admin.send("POST", f"/api/admin/users/{existing_user['id']}/link", {"auditor_id": auditor_id})
    return auditor_id


auditor_id = auditor_profile(LOGIN["auditor"], "Demo Auditor", "+919800000011", "Factory Safety Auditor", "Textiles")
team_id = auditor_profile(LOGIN["team"], "Demo Team Auditor", "+919800000012", "Environment and Permit Auditor", "Environmental")
set_login(LOGIN["auditor"], "Demo Auditor", "auditor")
set_login(LOGIN["team"], "Demo Team Auditor", "auditor")
set_login(LOGIN["team"], "Demo Team Auditor", "verifier")      # the second auditor is ALSO a verifier
if not find_user(LOGIN["verifier"]):
    admin.send("POST", "/api/admin/users", {"first_name": "Demo", "last_name": "Verifier", "email": LOGIN["verifier"], "role_slugs": ["verifier"]})
set_login(LOGIN["verifier"], "Demo Verifier", "verifier")
team_user, verifier_user = find_user(LOGIN["team"]), find_user(LOGIN["verifier"])
if not team_user or not verifier_user:
    sys.exit("The team auditor or the verifier login was not created")
print(f"   auditor {LOGIN['auditor']}   team auditor + verifier {LOGIN['team']}   verifier {LOGIN['verifier']}")

step("5. The audits (two auditors on one company)")
ASSIGNMENTS = [
    ("Demo: Fire safety and statutory document audit", auditor_id, int(team_user["id"]), "Statutory registers, fire safety, welfare amenities and the documents in the Audit Documents checklist."),
    ("Demo: Water, waste and permit audit", team_id, int(verifier_user["id"]), "Hazardous waste records, the work permits in use and the effluent treatment plant."),
    ("Demo: Labour law and payroll audit", auditor_id, int(verifier_user["id"]), "Wage registers, leave records, social security returns and the payslips of the last quarter."),
    ("Demo: Housekeeping and 6S audit", team_id, int(verifier_user["id"]), "Housekeeping, storage, signage and the 6S scores of every department."),
]
assignment = {}
for title, who, verifies, scope in ASSIGNMENTS:
    status, body = admin.send("GET", "/api/admin/audit-assignments?search=Demo&limit=50")
    existing = next((a for a in rows(body) if a.get("audit_title") == title and int(a.get("employer_id", 0)) == employer_id and int(a.get("auditor_id", 0) or 0) == who), None)
    if existing:
        assignment[title] = int(existing["id"])
        print(f"   {existing.get('assignment_number')} already there")
        continue
    result = must(f"assign {title}", *admin.send("POST", "/api/admin/audit-assignments", {
        "assignment_type": "AUDIT", "audit_title": title, "employer_id": employer_id, "unit_id": unit_id, "department_id": department_id,
        "auditor_id": who, "verifier_id": verifies, "start_date": iso(-3), "end_date": iso(1), "due_date": iso(14), "priority": "Medium", "fee_amount": 25000,
        "scope": scope, "instructions": "Demo audit."}))
    assignment[title] = int(data_of(result).get("assignmentId") or result.get("assignmentId"))
    print(f"   assigned: {title}")
FIRE_AUDIT, WATER_AUDIT, LABOUR_AUDIT, SIXS_AUDIT = (assignment[a[0]] for a in ASSIGNMENTS)
admin.send("POST", "/api/admin/capar/management/suggest", {})

# ── the records ─────────────────────────────────────────────────────────────────────
sessions = {}
for key in ("auditor", "team", "verifier", "employer"):
    session = Session((LOGIN[key], DEMO_PASSWORD))
    good, why = session.login()
    if not good:
        sys.exit(f"Cannot sign in as {LOGIN[key]}: {why}")
    sessions[key] = session


def form_id_of(session, name):
    """The form of the module with this name (the administrator's module list is the one place that has them all)."""
    status, body = admin.send("GET", f"/api/admin/dynamic-modules?limit=50&search={name.replace(' ', '%20')}")
    module = next((m for m in rows(body) if str(m.get("name")) == name), None)
    if not module:
        sys.exit(f"The form '{name}' is not installed. Run scripts/install-aa-forms.py and scripts/install-ptw-forms.py first.")
    detail = data_of(admin.send("GET", f"/api/admin/dynamic-modules/{module['id']}")[1])
    return int(detail["forms"][0]["id"])


def structure_of(session, form_id):
    spec = data_of(session.send("GET", f"/api/auditor/forms/{form_id}")[1])
    return spec.get("structure") or spec


def start(session, form_id, title, assignment_id):
    status, body = session.send("POST", "/api/auditor/submissions", {"form_id": form_id, "title": title, "assignment_id": assignment_id})
    sid = data_of(must(f"start {title}", status, body)).get("submissionId")
    return int(sid)


def existing_submission(session, title):
    status, body = session.send("GET", f"/api/auditor/submissions?search={title.replace(' ', '%20')}&limit=20")
    for row in rows(body) if status == 200 else []:
        if str(row.get("title")) == title:
            return int(row["id"]), str(row.get("status"))
    return None, None


def sign_values(session, sid, who, seed):
    return {f"sig_{who}_signature": upload(session, f"{who}-signature.png", signature_png(seed), "image/png", sid, "signature"),
            f"sig_{who}_name": {"auditor": "Demo Auditor", "verifier": "Demo Verifier"}[who], f"sig_{who}_date": iso(0)}


def review(reviewer, sid, who, comment):
    """The verifier approves and signs in the same step: the drawn signature is uploaded to the report and travels with the approval."""
    ink = upload(reviewer, "verifier-signature.png", signature_png(77 + sid % 9), "image/png", sid, "signature")
    status, body = reviewer.send("PUT", f"/api/verifier/submissions/{sid}", {"action": "approve", "comments": comment, "notify_submitter": True, "signature_file_id": ink})
    must(f"review by {who}", status, body)


RECORDS = []   # (label, submission id, session that may print it)

step("6. Audit report with photographs and signatures (auditor -> team verifier)")
title = "Demo: Fire safety audit report" + SUFFIX
sid, state = existing_submission(sessions["auditor"], title)
if not sid:
    form = form_id_of(sessions["auditor"], "General Audit and Assessment Report")
    sid = start(sessions["auditor"], form, title, FIRE_AUDIT)
    A = sessions["auditor"]
    photos = [upload(A, *photo(n), sid, "photo") for n in ("fire_extinguisher_blocked", "emergency_exit_obstructed", "electrical_panel_open", "machine_guard_missing")]
    values = {
        "audit_name": "Fire safety and statutory document audit", "client_name": "Demo Industries Private Limited", "report_title": "Fire Safety and Statutory Document Audit",
        "period": TODAY.strftime("%B %Y"), "prepared_by": "NextGen Socio & Enviro Advisors", "facility_unit_name": "Demo Industries Private Limited - Main Plant",
        "audit_date": iso(-1), "facility_address": "21, Industrial Estate, Coimbatore, Tamil Nadu 641021", "facility_representative": "Demo HR Manager",
        "audit_document_reference": "DEMO/FS/2026/01", "audited_by_auditor_firm": "Demo Auditor, NextGen Socio & Enviro Advisors",
        "criteria": "Factories Act 1948, Tamil Nadu Factories Rules 1950, IS 14489:2018 and the Audit Documents checklist", "start_date": iso(-3), "end_date": iso(-1), "man_days": 4,
        "people_met": "Demo HR Manager (HR), Safety Officer, Maintenance Head",
        "points": 40, "compliant": 31, "noncompliant": 7, "not_applicable": 2, "photos": photos,
        "summary": "<p>The plant was walked through with the Safety Officer. Seven of the 40 points checked do not meet the requirement; the main ones are the blocked emergency exit, "
                   "the fire extinguisher that is hard to reach, the open electrical panel and the missing machine guard.</p>",
        "followup": "<p>The management will close the findings listed above within 30 days and send the proof through the CAPAR report.</p>",
        "closing_date": iso(-1), "closing_rep": "Demo HR Manager", "declaration": True,
    }
    values.update(sign_values(A, sid, "auditor", 3))
    tables = {"findings": [
        {"area": "Fire extinguisher, packing corridor", "observation": "The extinguisher is half hidden by stacked cartons and its inspection tag has faded.", "evidence": "Photograph 1",
         "rating": "major_non_conformity", "recommendation": "Keep 1 metre clear, mark the floor and renew the inspection tag.", "owner": "Safety Officer", "target": iso(14), "status": "open"},
        {"area": "Emergency exit, production hall", "observation": "Fabric rolls and pallets block the aisle to the exit door.", "evidence": "Photograph 2",
         "rating": "critical", "recommendation": "Clear the aisle now and paint a no-storage zone in front of the door.", "owner": "Production Manager", "target": iso(3), "status": "open"},
        {"area": "Main electrical panel", "observation": "The panel door is open, cables enter without glands and there is no rubber mat.", "evidence": "Photograph 3",
         "rating": "major_non_conformity", "recommendation": "Close and lock the panel, fit glands and a rubber mat.", "owner": "Maintenance Head", "target": iso(10), "status": "open"},
        {"area": "Knitting machine 4", "observation": "The belt guard is removed and lies against the frame.", "evidence": "Photograph 4",
         "rating": "major_non_conformity", "recommendation": "Refit the guard before the machine runs; add an interlock check to the shift list.", "owner": "Maintenance Head", "target": iso(2), "status": "open"}]}
    A.send("PUT", f"/api/auditor/submissions/{sid}", {"values": values, "table_rows": tables})
    status, body = A.send("POST", f"/api/auditor/submissions/{sid}/submit", {"send_to_reviewer": True})
    must("submit the audit report", status, body)
    print(f"   submitted #{sid}")
else:
    print(f"   #{sid} already there ({state})")
RECORDS.append(("Audit report (fire safety)", sid, "auditor"))

step("7. Permit to Work with four drawn signatures (team auditor -> verifier)")
title = "Demo: Work at Height permit - ETP shed roof" + SUFFIX
sid, state = existing_submission(sessions["team"], title)
if not sid:
    T = sessions["team"]
    form = form_id_of(T, "Work at Height Permit")
    sid = start(T, form, title, WATER_AUDIT)
    structure = structure_of(T, form)
    RISKS = {"Identify risk associated with Work At Height": ["Fall from Height", "Fragile surface /Roof", "Adverse Weather"],
             "The following document must be attached with this permit": ["Method Statement", "Risk Assessment"],
             "The following areas / items have been inspected by issuer and receiver": ["Danger/Warning Sign", "Scaffold Tag System", "Lighting", "Safety Barriers", "Buddy System"],
             "PPE Required for the activity": ["Helmet with Chin strap", "Safety Shoes", "Safety Gloves", "Safety goggles", "Reflective Vest"]}
    TEXT = {"PTW Ref .No": "PTW/WAH/2026/014", "Contractor": "Sri Murugan Engineering Works", "Project Name": "Replacement of the ETP shed roof sheets", "Work Description": "Remove four damaged roof sheets over the ETP blower room and fit new sheets with fall-arrest lines.",
            "Location of job to be performed": "ETP blower room roof, Main Plant", "Tools/Equipment to be used": "Ladder, scaffold, harness with double lanyard, power drill", "Name of Inspector": "Demo Team Auditor",
            "Permit Receiver Name": "R. Senthil (contractor supervisor)", "Permit Issuer Name": "Demo HR Manager", "Name": "Demo Team Auditor", "1.": "Rescue plan and first-aid box at the foot of the scaffold.",
            "2.": "Work stops if the wind rises or it rains."}
    NUMBERS = {"No. of Employees involved": 4}
    values, signatures = {}, 0
    for section in structure["sections"]:
        for field in section["fields"]:
            key, label, kind = field["field_key"], field["label"], field["field_type"]
            options = {o["option_label"]: o["option_key"] for o in field.get("options") or []}
            if kind == "multi_select":
                wanted = RISKS.get(section["title"]) or (["Scaffolding", "Roof Work"] if "Scaffolding" in options else list(options)[:2])
                values[key] = [options[w] for w in wanted if w in options] or list(options.values())[:2]
            elif kind == "select":
                values[key] = options.get("No") if "wind speed greater" in label else (options.get("Yes") or next(iter(options.values()), None))
            elif kind == "date":
                values[key] = iso(1) if "Completion" in label else iso(0)
            elif kind == "time":
                values[key] = "17:00" if "Completion" in label else "09:00"
            elif kind in ("number", "decimal"):
                values[key] = NUMBERS.get(label, 0)
            elif kind == "signature":
                signatures += 1
                values[key] = upload(T, f"signature-{signatures}.png", signature_png(20 + signatures), "image/png", sid, "signature")
            elif kind in ("text", "textarea") and label in TEXT:
                values[key] = TEXT[label]
    # the Name/Signature/Date of the four sign-off blocks: names repeat, so the order of the fields decides
    values = {k: v for k, v in values.items() if v is not None}
    T.send("PUT", f"/api/auditor/submissions/{sid}", {"values": values})
    values.update(sign_values(T, sid, "auditor", 31))
    T.send("PUT", f"/api/auditor/submissions/{sid}", {"values": values, "table_rows": {"revalidation": [{"date": iso(2), "time": "09:00", "issuer_signature": "Demo HR Manager", "receiver_signature": "R. Senthil",
                                                                                                         "contractor_safety_signature": "Safety Officer", "sec_consultant": "Demo Team Auditor", "remarks": "Re-validated after the rain delay."}]}})
    status, body = T.send("POST", f"/api/auditor/submissions/{sid}/submit", {"send_to_reviewer": True})
    must("submit the permit", status, body)
    print(f"   submitted #{sid} ({signatures} signature pads drawn)")
else:
    print(f"   #{sid} already there ({state})")
RECORDS.append(("Permit to Work (work at height)", sid, "team"))

step("8. Form 3: hazardous waste records (team auditor -> verifier)")
title = "Demo: Form 3 - hazardous waste register" + SUFFIX
sid, state = existing_submission(sessions["team"], title)
if not sid:
    T = sessions["team"]
    form = form_id_of(T, "Form 3 - Records of Hazardous and Other Wastes")
    sid = start(T, form, title, WATER_AUDIT)
    spec = structure_of(T, form)
    keys = {f["label"]: f["field_key"] for s in spec["sections"] for f in s["fields"]}
    values = {keys["Name of the Facility"]: "Demo Industries Private Limited", keys["Address of the Facility"]: "21, Industrial Estate, Coimbatore, Tamil Nadu 641021",
              keys["Authorisation No."]: "DEMO-HW-2026-001", keys["Date of Issue"]: iso(-200), keys["Year (April to March)"]: "2026-2027"}
    values.update({keys["Name of the occupier / authorised person"]: "Demo HR Manager", keys["Designation"]: "HR Manager", keys["Place"]: "Coimbatore", keys["Date"]: iso(0),
                   keys["Signature of the occupier or operator of the disposal facility"]: upload(T, "occupier-signature.png", signature_png(43), "image/png", sid, "signature")})
    values.update(sign_values(T, sid, "auditor", 41))
    waste = "Schedule I / 5.1 Used Oil Or Spent Oil"
    tables = {"wastes_handled": [{"waste": waste, "process": "Lubrication of knitting machines and DG set", "source": "Maintenance", "waste_type": "Recyclable", "storage": "Under roof shed, MS drums",
                                  "transport": "Disposal to pre-processing facility, transported by the authorised recycler", "annual_quantity": "0.1 KL/Annum"}],
              "monthly_records": [{"month": f"{(TODAY - timedelta(days=30 * k)).strftime('%b-%y')}", "date": iso(-30 * k), "waste": waste, "quantity": 0.01 + 0.002 * k, "stock": 0.02 + 0.004 * k,
                                   "destined_to": "Authorised used-oil recycler", "manifest": f"MAN/{2026}/{40 + k}", "vehicle": "TN 38 AB 4521", "transporter": "Kovai Green Transport"} for k in range(3)]}
    T.send("PUT", f"/api/auditor/submissions/{sid}", {"values": values, "table_rows": tables})
    status, body = T.send("POST", f"/api/auditor/submissions/{sid}/submit", {"send_to_reviewer": True})
    must("submit Form 3", status, body)
    print(f"   submitted #{sid}")
else:
    print(f"   #{sid} already there ({state})")
RECORDS.append(("Form 3 (hazardous waste)", sid, "team"))

step("9. Verification: the team auditor verifies the audit report, the verifier verifies the permit and Form 3")
for label, sid, owner in RECORDS:
    reviewer_key = "team" if owner == "auditor" else "verifier"
    status, body = sessions[reviewer_key].send("GET", f"/api/verifier/submissions/{sid}")
    current = str((data_of(body).get("submission") or data_of(body)).get("status", ""))
    if current in ("approved",):
        print(f"   {label}: already approved")
        continue
    review(sessions[reviewer_key], sid, reviewer_key, "Checked against the records and the photographs; the findings are correctly described and signed.")
    print(f"   {label}: approved by {LOGIN[reviewer_key]}")

step("10. Factory data entered by the employer (five days)")
E = sessions["employer"]
added = 0
status, body = E.send("GET", f"/api/data-management/entries?register=PRO-01&from={iso(-5)}&to={iso(-1)}")
already = len(rows(body)) if status == 200 else 0
if already:
    print(f"   {already} production records of these days are already there; nothing added")
for k in (range(5, 0, -1) if not already else []):
    day = iso(-k)
    batch = [("PRO-01", {"product_code": "Cotton knitted fabric", "total_production": 5200 + 80 * k, "rejected": 90 + 4 * k, "rm_consumed": 5600, "planned_h": 8, "downtime_h": 1, "water_kl": 48, "electricity_kwh": 1500}, {"shift": "A"}),
             ("WAT-01", {"kind": "Intake (source)", "name": "Borewell", "meter_opening": 1000 + 62 * (5 - k), "meter_closing": 1062 + 62 * (5 - k)}, {}),
             ("ENR-01", {"meter_name": "Main incomer", "meter_opening": 40000 + 1500 * (5 - k), "meter_closing": 41500 + 1500 * (5 - k), "multiplier": 1, "grid_kwh": 1500}, {}),
             ("WST-02", {"name": "Used oil", "qty_kg": 4, "storage_kg": 40 + 4 * (5 - k), "physical": "Liquid"}, {})]
    for register, values, extra in batch:
        status, body = E.send("POST", "/api/data-management/entries", {"register": register, "entry_date": day, "values": values, **extra})
        if status in (200, 201):
            added += 1
            entry = data_of(body).get("id") or body.get("id")
            if entry:
                E.send("POST", f"/api/data-management/entries/{entry}/verify", {"decision": "verify"})
if added:
    print(f"   {added} records entered and verified by the employer")

step("10b. Payroll for last month: salary structures, attendance, payroll run, payslips published to the employees")
last_month_end = (TODAY.replace(day=1) - timedelta(days=1))
for month, year in ((last_month_end.month, last_month_end.year), (TODAY.month, TODAY.year)):
    employees = [e for e in rows(admin.send("GET", f"/api/admin/employees?employer_id={employer_id}&limit=100")[1]) if int(e.get("employer_id", employer_id) or employer_id) == employer_id]
    for employee in employees:
        basic = float(employee.get("basic_salary") or 15000)
        status, body = admin.send("POST", "/api/admin/payroll/structures", {
            "employee_id": int(employee["id"]), "structure_name": "Standard wage structure", "effective_from": iso(-400), "basic": basic, "da": round(basic * 0.25), "hra": round(basic * 0.2),
            "ta": 500, "pa": 300, "ea": 200, "npba": 100, "other_allowances": 400, "wage_type": "Per Month", "pf_applicable": basic <= 21000, "esi_applicable": basic <= 21000,
            "pt_state": "Tamil Nadu", "lwf_applicable": True, "revision_reason": "Initial structure"})
    admin.send("PUT", "/api/admin/payroll/attendance", {"employer_id": employer_id, "month": month, "year": year, "default_status": "Present"})
    if employees:
        admin.send("POST", "/api/admin/payroll/attendance", {"employee_id": int(employees[-1]["id"]), "attendance_date": f"{year}-{month:02d}-12", "status": "Absent", "remarks": "Unauthorised absence"})
    admin.send("POST", "/api/admin/payroll/leave/ledger", {"employer_id": employer_id, "year": year})
    status, body = admin.send("GET", f"/api/admin/payroll?employer_id={employer_id}&month={month}&year={year}&limit=5")
    run_row = next((r for r in rows(body) if int(r.get("month", 0)) == month and int(r.get("year", 0)) == year and int(r.get("employer_id", employer_id)) == employer_id), None)
    if run_row:
        print(f"   payroll run {month}/{year} already there ({run_row.get('status')})")
    else:
        status, body = admin.send("POST", "/api/admin/payroll", {"employer_id": employer_id, "month": month, "year": year, "calculation_notes": f"{date(year, month, 1).strftime('%B %Y')} payroll"})
        run_id = (data_of(body).get("id") if status in (200, 201) else None)
        if not run_id:
            print(f"   ! payroll run not created ({status}): {body.get('message') if isinstance(body, dict) else body}")
        else:
            for path, payload in ((f"/api/admin/payroll/{run_id}/calculate", {}), (f"/api/admin/payroll/{run_id}/status", {"status": "Approved", "note": "Checked and approved"}),
                                  (f"/api/admin/payroll/{run_id}/generate", {}), (f"/api/admin/payroll/{run_id}/publish", {})):
                status, body = admin.send("POST", path, payload)
                if status not in (200, 201):
                    print(f"   ! {path.rsplit('/', 1)[1]} ({status}): {body.get('message') if isinstance(body, dict) else body}")
            print(f"   payroll run {month}/{year} calculated, approved, payslips generated and published")

step("11. CAPAR report from the findings to the closing signatures")
env = dict(os.environ, AUDITOR_EMAIL=LOGIN["auditor"], AUDITOR_PASSWORD=DEMO_PASSWORD, EMPLOYER_EMAIL=LOGIN["employer"], EMPLOYER_PASSWORD=DEMO_PASSWORD,
           SAMPLE_TITLE="CAPAR - Demo Industries - Buyer Compliance Audit (sample)" + SUFFIX, PHOTO_DIR=str(PHOTO_DIR), PYTHONIOENCODING="utf-8")
run = subprocess.run([sys.executable, str(HERE / "seed-live-demo-report.py")], env=env, capture_output=True, text=True, encoding="utf-8")
print("   " + "\n   ".join((run.stdout or "").strip().splitlines()[-4:]))
if run.returncode != 0:
    print("   ! the CAPAR journey stopped:", (run.stderr or "").strip()[-300:])

step("11b. Every other module gets a record (compliance documents, leave, attendance, audit documents, invoice, groundwater NOC, audit reports, one report waiting)")
from seed_lib import make_pdf  # noqa: E402


def soft(label, status, body, expect=(200, 201)):
    """These extra records are best-effort: a refusal is printed, the rest of the demo goes on."""
    if status in expect:
        return True
    print(f"   ! {label}: HTTP {status} {(body.get('message') if isinstance(body, dict) else body) or ''}")
    return False


# -- compliance documents of the company (licences, registrations, certificates) with a PDF each
status, body = admin.send("GET", f"/api/admin/compliance/documents?employer_id={employer_id}&limit=50")
have = len([d for d in rows(body) if int(d.get("employer_id", employer_id) or employer_id) == employer_id]) if status == 200 else 0
if have >= 4:
    print(f"   compliance documents: {have} already there")
else:
    made = 0
    for index, (name, kind, authority, expires, validity) in enumerate([
            ("Factory Licence", "Licence", "Inspector of Factories", 400, 730), ("PF Establishment Registration", "Registration", "EPFO Regional Office", None, None),
            ("ESI Registration", "Registration", "ESIC Sub-Regional Office", None, None), ("Fire NOC", "Certificate", "Tamil Nadu Fire & Rescue Services", 24, 365),
            ("Boiler Inspection Certificate", "Certificate", "Directorate of Boilers", 60, 365), ("Factory Insurance Policy", "Insurance", "New India Assurance", 150, 365)]):
        number = f"DEMO/{name[:3].upper()}/2026/{100 + index}"
        status, body = admin.send("POST", "/api/admin/compliance/documents", {
            "employer_id": employer_id, "document_name": name, "document_type": kind, "issuing_authority": authority, "document_number": number,
            "renewal_responsibility": "HR Manager", "remind_days_before": 30, "issue_date": iso(expires - validity) if expires is not None else iso(-500),
            "expiry_date": iso(expires) if expires is not None else None, "fee_amount": 1500 + index * 750, "notes": "Demo record.", "is_verified": index % 2 == 0})
        if soft(f"document {name}", status, body):
            made += 1
            doc_id = data_of(body).get("documentId") or body.get("documentId")
            if doc_id:
                admin.upload(f"{name.lower().replace(' ', '-')}.pdf", make_pdf(name, [f"Issued by: {authority}", f"Number: {number}", f"Valid until: {iso(expires) if expires is not None else 'Perpetual'}"]),
                             "COMPLIANCE_DOCUMENT", int(doc_id), name)
    print(f"   {made} compliance documents added")

# -- leave: the employee applies, the HR manager decides
S = {"employee": Session((LOGIN["employee"], DEMO_PASSWORD))}
S["employee"].login()
status, body = S["employee"].send("GET", "/api/employee/leave?limit=5")
if status == 200 and rows(body):
    print("   leave: already there")
else:
    status, body = S["employee"].send("GET", "/api/employee/leave/types")
    types_ = rows(body) or (body.get("types") if isinstance(body, dict) else []) or []
    if types_:
        type_id = int(types_[0].get("id") or types_[0].get("value"))
        soft("leave request", *S["employee"].send("POST", "/api/employee/leave", {"leave_type_id": type_id, "date_from": iso(9), "date_to": iso(10), "reason": "Family function"}))
        soft("second leave request", *S["employee"].send("POST", "/api/employee/leave", {"leave_type_id": type_id, "date_from": iso(20), "date_to": iso(20), "reason": "Bank work"}))
        pending = rows(E.send("GET", "/api/employer/leave?status=Pending&limit=20")[1])
        if pending:
            soft("leave decision", *E.send("POST", f"/api/employer/leave/{pending[-1]['id']}/decision", {"decision": "approve", "approver_comments": "Approved"}))
        print(f"   leave: {len(pending)} request(s) filed, the HR manager approved one")
    else:
        print("   ! leave types are not set up on this site; leave skipped")

# -- attendance of this month too (last month was done with the payroll)
soft("attendance this month", *admin.send("PUT", "/api/admin/payroll/attendance", {"employer_id": employer_id, "month": TODAY.month, "year": TODAY.year, "default_status": "Present"}))

# -- Audit Documents: the company's document pack is submitted and the auditor downloads it
checklist = data_of(admin.send("GET", f"/api/evidence/employers/{employer_id}")[1])
if checklist.get("sections"):
    if not checklist.get("latest"):
        for item in [i for section in checklist["sections"] for i in section["items"]][:8]:
            admin.send("PUT", f"/api/evidence/employers/{employer_id}/items/{item['id']}", {"status": "Provided", "reference_no": f"DEMO-{item['id']}", "valid_until": "", "notes": "Demo record"})
        soft("submit the document pack", *admin.send("POST", f"/api/evidence/employers/{employer_id}/submit", {"note": "Documents for the audit"}))
        checklist = data_of(admin.send("GET", f"/api/evidence/employers/{employer_id}")[1])
    if checklist.get("latest") and not checklist.get("downloaded_at"):
        sessions["auditor"].send("GET", f"/api/pdf/evidence-pack/{checklist['latest']['id']}", raw=True)
    print("   audit documents: the pack is submitted and downloaded by the auditor")

# -- billing: an invoice to the company, issued, part paid
status, body = admin.send("GET", f"/api/admin/billing/invoices?search=Demo%20Industries&limit=5")
if status == 200 and rows(body):
    print("   invoice: already there")
else:
    status, body = admin.send("POST", "/api/admin/billing/invoices", {
        "employer_id": employer_id, "buyer_name": "Demo Industries Private Limited", "buyer_address": "21, Industrial Estate, Coimbatore, Tamil Nadu 641021", "buyer_state_code": "33",
        "invoice_date": iso(-10), "payment_terms": "Net 30 days", "place_of_supply": "Tamil Nadu", "notes": "Statutory compliance audit and safety audit, 2 days on site.",
        "items": [{"description": "Statutory compliance audit (on site, per day)", "sac_code": "998311", "quantity": 2, "uom": "Days", "unit_price": 8000, "gst_percent": 18},
                  {"description": "Fire safety audit report", "sac_code": "998311", "quantity": 1, "uom": "Nos", "unit_price": 9500, "gst_percent": 18}]})
    if soft("invoice", status, body):
        invoice_id = int(data_of(body).get("id") or body.get("id") or 0)
        if invoice_id:
            admin.send("POST", f"/api/admin/billing/invoices/{invoice_id}/issue", {})
            admin.send("POST", f"/api/admin/billing/invoices/{invoice_id}/payments", {"amount": 10000, "payment_date": iso(-3), "mode": "Cheque", "reference": "Cheque 004512"})
            print("   invoice issued and part paid")

# -- Groundwater NOC with meters and weekly readings
status, body = admin.send("GET", f"/api/water-noc?employer_id={employer_id}&limit=5")
if status == 200 and [n for n in rows(body) if str(n.get("noc_number", "")).startswith("DEMO")]:
    print("   groundwater NOC: already there")
else:
    status, body = admin.send("POST", "/api/water-noc", {
        "employer_id": employer_id, "unit_id": unit_id, "noc_number": "DEMO/WRD/GW/2026/0101", "issuing_authority": "Water Resources Department, SG & SWRDC, Chennai",
        "issue_date": iso(-130), "expiry_date": iso(965), "approved_quantity_lpd": 50000, "purpose": "Domestic", "purpose_domestic_lpd": 20000, "purpose_gardening_lpd": 5000,
        "purpose_other_lpd": 25000, "well_type": "Bore well", "well_depth_m": 198, "well_diameter_in": 6.5, "pump_hp": 5, "pumping_hours_per_day": 6, "abstraction_structures": 1, "standard_conditions": True})
    if soft("groundwater NOC", status, body):
        noc_id = int(data_of(body).get("id") or body.get("id"))
        status, body = admin.send("GET", f"/api/water-noc/{noc_id}")
        for condition in (data_of(body).get("conditions") or [])[:6]:
            admin.send("PATCH", f"/api/water-noc/{noc_id}/conditions/{condition['id']}", {"compliance": "Compliant", "remarks": "Checked on site."})
        for name, source, counts, base in (("Borewell O/P (M1)", "Borewell", True, 41250.0), ("RO feed water", "RO Feed", False, 12800.0)):
            status, body = admin.send("POST", f"/api/water-noc/{noc_id}/meters", {"name": name, "source": source, "reading_unit": "KL", "counts_toward_noc": counts})
            if soft(f"meter {name}", status, body):
                meter_id = int(data_of(body).get("id") or body.get("id"))
                for week in range(8):
                    admin.send("POST", f"/api/water-noc/{noc_id}/meters/{meter_id}/readings", {"reading_date": iso(-7 * (7 - week)), "reading_value": round(base + week * (45 if counts else 20) * 7, 1)})
        print("   groundwater NOC with 2 meters and 8 weekly readings")

# -- audit reports (the report register: auditor -> verifier): one approved, one rejected, one waiting
BODY = {"executive_summary": "The audit covered the statutory registers, fire safety and the welfare amenities of the Main Plant. Most points are in order; the findings below need action.",
        "methodology": "Document sampling for six months, a walk through the plant with the Safety Officer and short interviews with workers.",
        "observations": ["Emergency exit in the production hall was partly blocked.", "Fire extinguisher inspection tags were faded."],
        "regulatory_references": ["Factories Act 1948", "Tamil Nadu Factories Rules 1950"], "recommendations": ["Keep every exit clear.", "Renew the inspection tags and display the next due date."]}


def audit_report(title, assignment_id, who, verifier, decision):
    status, body = admin.send("GET", f"/api/admin/audit-reports?search={title.replace(' ', '%20')}&limit=5")
    if status == 200 and any(str(r.get("audit_title")) == title for r in rows(body)):
        return f"   audit report '{title}': already there"
    status, body = admin.send("POST", "/api/admin/audit-reports", {"assignment_id": assignment_id, "employer_id": employer_id, "unit_id": unit_id, "auditor_id": who, "audit_title": title,
                                                                    "report_type": "AUDIT", "audit_date": iso(-2), "audit_period_from": iso(-30), "audit_period_to": iso(-2),
                                                                    "score_obtained": 78, "score_max": 100, "body": BODY})
    if not soft(f"audit report {title}", status, body):
        return ""
    rid = int(data_of(body).get("reportId") or body.get("reportId") or 0)
    status, body = admin.send("POST", f"/api/admin/audit-reports/{rid}/submit", {"change_summary": "Initial submission for verification", "verifier_id": verifier["id"], "send_to_verifier": True})
    if not soft(f"submit {title}", status, body):
        return ""
    if decision:
        reviewer = sessions["team"] if int(verifier["id"]) == int(team_user["id"]) else sessions["verifier"]
        payload = {"action": decision, "comments": "Checked against the records and the photographs of the visit; the findings are correctly described."}
        if decision != "approve":
            payload.update({"reason": "The effluent test report is missing; attach it and resubmit."})
        soft(f"review {title}", *reviewer.send("POST", f"/api/verifier/reports/{rid}/review", payload))
    return f"   audit report '{title}': {'approved' if decision == 'approve' else 'rejected' if decision == 'reject' else 'waiting for the verifier'}"


for line in (audit_report("Demo: Fire safety audit - report register" + SUFFIX, FIRE_AUDIT, auditor_id, team_user, "approve"),
             audit_report("Demo: Water and waste audit - first report" + SUFFIX, WATER_AUDIT, team_id, verifier_user, "reject"),
             audit_report("Demo: Labour law and payroll audit - report" + SUFFIX, LABOUR_AUDIT, auditor_id, verifier_user, "approve"),
             audit_report("Demo: Housekeeping and 6S audit - report" + SUFFIX, SIXS_AUDIT, team_id, verifier_user, None)):
    if line:
        print(line)

# -- one form report waiting for the verifier, so the signature pad can be shown live
title = "Demo: Form 3 - waiting for verification" + SUFFIX
sid, state = existing_submission(sessions["team"], title)
if not sid:
    T = sessions["team"]
    form = form_id_of(T, "Form 3 - Records of Hazardous and Other Wastes")
    sid = start(T, form, title, WATER_AUDIT)
    keys = {f["label"]: f["field_key"] for s_ in structure_of(T, form)["sections"] for f in s_["fields"]}
    values = {keys["Name of the Facility"]: "Demo Industries Private Limited", keys["Address of the Facility"]: "21, Industrial Estate, Coimbatore, Tamil Nadu 641021",
              keys["Authorisation No."]: "DEMO-HW-2026-001", keys["Date of Issue"]: iso(-200), keys["Year (April to March)"]: "2026-2027"}
    values.update(sign_values(T, sid, "auditor", 51))
    T.send("PUT", f"/api/auditor/submissions/{sid}", {"values": values, "table_rows": {"wastes_handled": [{"waste": "Schedule I / 33.1 Empty barrels contaminated with hazardous chemicals", "process": "Chemical handling",
                                                                                                         "source": "Dyeing unit", "waste_type": "Recyclable", "storage": "Covered shed", "transport": "Authorised recycler", "annual_quantity": "0.5 MT/Annum"}],
                                                                  "monthly_records": [{"month": TODAY.strftime("%b-%y"), "date": iso(-1), "waste": "Schedule I / 33.1", "quantity": 0.02, "stock": 0.02, "destined_to": "Authorised recycler",
                                                                                       "manifest": "MAN/2026/52", "vehicle": "TN 38 AB 4521", "transporter": "Kovai Green Transport"}]}})
    soft("submit the waiting Form 3", *T.send("POST", f"/api/auditor/submissions/{sid}/submit", {"send_to_reviewer": True}))
    print(f"   Form 3 #{sid} is waiting for the verifier (open Module Submissions and approve it with the signature pad)")
else:
    print(f"   waiting Form 3 #{sid} already there ({state})")

step("12. The reports (every record's PDF is fetched)")
for label, sid, owner in RECORDS:
    status, blob = sessions[owner].send("GET", f"/api/pdf/submission/{sid}", raw=True)
    good = status == 200 and blob[:4] == b"%PDF"
    print(f"   {'ok ' if good else 'FAIL'} {label}: {len(blob) / 1024:.0f} KB PDF" if status == 200 else f"   FAIL {label}: HTTP {status}")
status, body = sessions["auditor"].send("GET", "/api/capar?limit=100")
capar = next((r for r in rows(body) if str(r.get("title", "")).startswith("CAPAR - Demo Industries") and str(r.get("title", "")).endswith(SUFFIX)), None) if status == 200 else None
if capar:
    status, blob = sessions["auditor"].send("GET", f"/api/pdf/capar/{capar['id']}", raw=True)
    print(f"   {'ok ' if status == 200 and blob[:4] == b'%PDF' else 'FAIL'} CAPAR {capar.get('report_number')} ({capar.get('status')}): {len(blob) / 1024:.0f} KB PDF")

print(f"""
Demo logins (open the site's /login). Password for every one of them: {DEMO_PASSWORD}
   Administrator          {LOGIN['admin']}
   Employer (HR manager)  {LOGIN['employer']}
   Employee               {LOGIN['employee']}
   Auditor                {LOGIN['auditor']}
   Auditor + Verifier     {LOGIN['team']}   (one login, both workspaces)
   Verifier               {LOGIN['verifier']}
One company, Demo Industries Private Limited ({CODE}), is in all of them. Remove these logins before real clients are given theirs (Go-live Checklist lists them).
""")
