#!/usr/bin/env python3
"""Demo data for flow testing â€” every panel gets a populated, realistic world.

Everything goes through the real admin/employer/auditor/verifier APIs, so numbering,
validation, audit trails, PDFs and notifications are produced exactly as in use.
Safe to re-run: records are looked up by their natural key before being created.

Usage:  python scripts/seed-demo.py [stage ...]      (default: all stages)
Stages: people, documents, audits, compliance, modules, capar, water, payroll, workday, billing, site, designations, evidence, calendar, cms
Needs:  migrations + seeds loaded, the app running on SEED_BASE (default http://localhost:3001).

Demo logins (password in brackets):
  admin@complianceos.local (Admin@2026)        auditors  *.auditor@demo.complianceos.local (Auditor@2026)
  employers *.hr@demo.complianceos.local (Employer@2026)   verifier  verifier.test@complianceos.local (Verifier@2026)
  employees *@emp.demo.complianceos.local (Employee@2026)
"""
import importlib
import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import PASSWORDS, Session, db, make_pdf, q1, section, sql_text  # noqa: E402
from seed_common import TODAY, admin, iso, set_passwords  # noqa: E402

random.seed(2026)


# â”€â”€ Data catalogue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

EMPLOYERS = [
    {
        "code": "SBT", "company_name": "Sri Balaji Textiles Private Limited", "industry_type": "Textiles",
        "company_type": "Private Limited", "gst_number": "33AABCS1234D1Z5", "pan_number": "AABCS1234D",
        "year_of_establishment": 1998, "email": "info@sribalajitextiles.example", "mobile": "+919842012345",
        "address_line_1": "12/4, Avinashi Road", "city": "Coimbatore", "state": "Tamil Nadu", "pincode": "641018",
        "contact_person_name": "R. Muthu Kumar", "contact_person_designation": "Managing Director",
        "contact_person_email": "muthu@sribalajitextiles.example", "contact_person_mobile": "+919842012346",
        "approximate_employee_count": 320, "number_of_units": 2,
        "portal": ("balaji.hr@demo.complianceos.local", "Muthu Kumar R", "+919842012346"),
        "link_user": "employer.test@complianceos.local",
        "units": [
            {"unit_name": "Spinning Unit", "unit_code": "SPN", "address_line1": "Plot 7, SIDCO Industrial Estate", "city": "Coimbatore", "state": "Tamil Nadu", "pincode": "641021"},
            {"unit_name": "Weaving Unit", "unit_code": "WVG", "address_line1": "88, Palladam Road", "city": "Tiruppur", "state": "Tamil Nadu", "pincode": "641604"},
        ],
        "departments": [("Production", "PROD", 0), ("Quality Control", "QC", 0), ("Maintenance", "MNT", 1), ("HR & Administration", "HRA", 0)],
    },
    {
        "code": "KEW", "company_name": "Kaveri Engineering Works Private Limited", "industry_type": "Manufacturing",
        "company_type": "Private Limited", "gst_number": "33AAFCK5678E1Z2", "pan_number": "AAFCK5678E",
        "year_of_establishment": 2005, "email": "contact@kaveriengineering.example", "mobile": "+919840098765",
        "address_line_1": "45, Ambattur Industrial Estate", "city": "Chennai", "state": "Tamil Nadu", "pincode": "600058",
        "contact_person_name": "S. Lakshmi Narayanan", "contact_person_designation": "General Manager - HR",
        "contact_person_email": "lakshmi@kaveriengineering.example", "contact_person_mobile": "+919840098766",
        "approximate_employee_count": 180, "number_of_units": 1,
        "portal": ("kaveri.hr@demo.complianceos.local", "Lakshmi Narayanan S", "+919840098766"),
        "units": [
            {"unit_name": "Ambattur Plant", "unit_code": "AMB", "address_line1": "45, Ambattur Industrial Estate", "city": "Chennai", "state": "Tamil Nadu", "pincode": "600058"},
        ],
        "departments": [("Machining", "MCH", 0), ("Assembly", "ASM", 0), ("Stores & Dispatch", "STR", 0)],
    },
    {
        "code": "GFP", "company_name": "Greenfield Foods & Packaging LLP", "industry_type": "Food & Beverage",
        "company_type": "LLP", "gst_number": "33AAJFG9012F1Z8", "pan_number": "AAJFG9012F",
        "year_of_establishment": 2012, "email": "hello@greenfieldfoods.example", "mobile": "+919865011223",
        "address_line_1": "3, SIPCOT Industrial Park", "city": "Madurai", "state": "Tamil Nadu", "pincode": "625016",
        "contact_person_name": "A. Priyadharshini", "contact_person_designation": "Operations Head",
        "contact_person_email": "priya@greenfieldfoods.example", "contact_person_mobile": "+919865011224",
        "approximate_employee_count": 95, "number_of_units": 1,
        "portal": ("greenfield.hr@demo.complianceos.local", "Priyadharshini A", "+919865011224"),
        "units": [
            {"unit_name": "Processing Plant", "unit_code": "PRC", "address_line1": "3, SIPCOT Industrial Park", "city": "Madurai", "state": "Tamil Nadu", "pincode": "625016"},
        ],
        "departments": [("Processing", "PRC", 0), ("Packaging", "PKG", 0), ("Food Safety & QA", "FSQ", 0)],
    },
]

AUDITORS = [
    {"name": "Priya Venkatesan", "email": "priya.auditor@demo.complianceos.local", "mobile": "+919790011001", "role_title": "Lead Factory Act Auditor",
     "specialization": "Textiles", "qualification": "B.E. Mechanical, Diploma in Industrial Safety", "experience_years": 11, "city": "Coimbatore",
     "pan_number": "ABCPV1234L", "aadhaar_number": "345678901201", "max": 5},
    {"name": "Karthik Rajan", "email": "karthik.auditor@demo.complianceos.local", "mobile": "+919790011002", "role_title": "Electrical Safety Auditor",
     "specialization": "Electrical Safety", "qualification": "B.E. EEE, Certified Energy Auditor", "experience_years": 8, "city": "Chennai",
     "pan_number": "ABCPR2345M", "aadhaar_number": "345678901202", "max": 6},
    {"name": "Deepa Narayanan", "email": "deepa.auditor@demo.complianceos.local", "mobile": "+919790011003", "role_title": "Labour Law & Payroll Auditor",
     "specialization": "Manufacturing", "qualification": "M.B.A. HR, LLB", "experience_years": 9, "city": "Madurai",
     "pan_number": "ABCPN3456N", "aadhaar_number": "345678901203", "max": 4},
    {"name": "Anand Krishnan", "email": "anand.auditor@demo.complianceos.local", "mobile": "+919790011004", "role_title": "Fire & Safety Auditor",
     "specialization": "Fire Safety", "qualification": "B.Sc. Fire & Safety, NEBOSH IGC", "experience_years": 14, "city": "Salem",
     "pan_number": "ABCPK4567P", "aadhaar_number": "345678901204", "max": 6},
]

FIRST_M = ["Murugan", "Senthil", "Karthikeyan", "Arun", "Vignesh", "Saravanan", "Prakash", "Gopal", "Ramesh", "Dinesh", "Manikandan", "Selvakumar", "Balamurugan", "Suresh", "Ganesh"]
FIRST_F = ["Kalaiselvi", "Meena", "Lakshmi", "Revathi", "Priyanka", "Deepika", "Anitha", "Sathya", "Janani", "Vasanthi", "Nandhini", "Divya"]
LAST = ["Selvam", "Kumar", "Raj", "Pandian", "Subramanian", "Natarajan", "Velusamy", "Chandran", "Ramasamy", "Palanisamy"]
DESIGNATIONS = {
    "Production": ["Machine Operator", "Ring Frame Operator", "Loom Operator", "Line Supervisor", "Helper"],
    "Quality Control": ["Quality Inspector", "Lab Technician"],
    "Maintenance": ["Fitter", "Electrician", "Maintenance Supervisor"],
    "HR & Administration": ["HR Executive", "Accounts Assistant", "Welfare Officer"],
    "Machining": ["CNC Operator", "Turner", "Milling Operator"],
    "Assembly": ["Assembly Technician", "Welder", "Inspector"],
    "Stores & Dispatch": ["Store Keeper", "Dispatch Clerk", "Forklift Operator"],
    "Processing": ["Process Operator", "Boiler Attendant", "Mixer Operator"],
    "Packaging": ["Packing Operator", "Labeller", "Line Supervisor"],
    "Food Safety & QA": ["QA Analyst", "Hygiene Supervisor"],
}
EMPLOYEES_PER_EMPLOYER = {"SBT": 9, "KEW": 7, "GFP": 6}

# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


def body_of(payload):
    if not isinstance(payload, dict):
        return {}
    return payload.get("data") if isinstance(payload.get("data"), dict) else payload


# â”€â”€ Stage: people â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def stage_people():
    section("Employers, units, departments, portal logins")
    state = {}
    for spec in EMPLOYERS:
        employer_id = q1(f"SELECT id FROM employers WHERE employer_code={sql_text(spec['code'])}")
        if not employer_id:
            payload = {k: v for k, v in spec.items() if k not in ("code", "portal", "link_user", "units", "departments")}
            payload.update({"employer_code": spec["code"], "create_portal_user": True,
                            "portal_user_email": spec["portal"][0], "portal_user_name": spec["portal"][1],
                            "portal_user_mobile": spec["portal"][2]})
            result = admin.call("POST", "/api/admin/employers", payload, what=f"employer {spec['code']}")
            if not result:
                continue
            employer_id = result.get("employerId")
            print(f"  + employer {spec['company_name']} (#{employer_id})")
        employer_id = int(employer_id)

        unit_ids = []
        for unit in spec["units"]:
            existing = q1(f"SELECT id FROM company_units WHERE employer_id={employer_id} AND unit_code={sql_text(unit['unit_code'])}")
            if existing:
                unit_ids.append(int(existing))
                continue
            result = admin.call("POST", f"/api/admin/employers/{employer_id}/units", unit, what=f"unit {unit['unit_name']}")
            unit_ids.append(int(result["unitId"]) if result else 0)
        for name, code, unit_index in spec["departments"]:
            if q1(f"SELECT id FROM departments WHERE employer_id={employer_id} AND department_code={sql_text(code)}"):
                continue
            admin.call("POST", f"/api/admin/employers/{employer_id}/departments",
                       {"unit_id": unit_ids[unit_index], "department_name": name, "department_code": code}, what=f"department {name}")
        state[spec["code"]] = employer_id

        if spec.get("link_user"):
            user_id = q1(f"SELECT id FROM users WHERE email={sql_text(spec['link_user'])}")
            if user_id and not q1(f"SELECT id FROM employer_users WHERE user_id={user_id}"):
                admin.call("POST", f"/api/admin/users/{user_id}/link", {"employer_id": employer_id}, what="link employer.test")

    section("Auditor types, auditors, verifier")
    type_rows = db("SELECT id, name FROM auditor_types ORDER BY id")
    type_ids = [int(row[0]) for row in type_rows] or [1]
    for index, spec in enumerate(AUDITORS):
        if q1(f"SELECT id FROM auditors WHERE email={sql_text(spec['email'])}"):
            continue
        payload = {
            "name": spec["name"], "email": spec["email"], "mobile": spec["mobile"], "auditor_type_id": type_ids[index % len(type_ids)],
            "role_title": spec["role_title"], "specialization": spec["specialization"], "qualification": spec["qualification"],
            "experience_years": spec["experience_years"], "city": spec["city"], "state": "Tamil Nadu", "pincode": "641011",
            "address": f"{10 + index}, Gandhi Nagar", "pan_number": spec["pan_number"], "aadhaar_number": spec["aadhaar_number"],
            "bank_name": "Indian Bank", "bank_account_number": f"60122345{index:04d}", "ifsc_code": "IDIB000C123",
            "date_of_joining": iso(-900 + index * 40), "max_concurrent_audits": spec["max"], "status": "active",
        }
        if not spec.get("link_user"):
            payload.update({"create_portal_user": True, "portal_user_email": spec["email"], "portal_user_name": spec["name"]})
        result = admin.call("POST", "/api/admin/auditors", payload, what=f"auditor {spec['name']}")
        if result:
            auditor_id = result.get("auditorId")
            print(f"  + auditor {spec['name']} (#{auditor_id})")
            admin.call("PUT", f"/api/admin/auditors/{auditor_id}/rating", {"rating": round(4 + (index % 3) * 0.3, 1)}, what="rating")
            if spec.get("link_user"):
                user_id = q1(f"SELECT id FROM users WHERE email={sql_text(spec['link_user'])}")
                if user_id:
                    admin.call("POST", f"/api/admin/users/{user_id}/link", {"auditor_id": int(auditor_id)}, what="link auditor.test")

    if not q1("SELECT id FROM users WHERE email='verifier.test@complianceos.local'"):
        admin.call("POST", "/api/admin/users", {"first_name": "Test", "last_name": "Verifier", "email": "verifier.test@complianceos.local",
                                                "role_slugs": ["verifier"]}, what="verifier user")
    if not q1("SELECT id FROM users WHERE email='senior.verifier@demo.complianceos.local'"):
        admin.call("POST", "/api/admin/users", {"first_name": "Rajeshwari", "last_name": "Subramaniam", "email": "senior.verifier@demo.complianceos.local",
                                                "role_slugs": ["verifier"]}, what="second verifier")
    # an extra back-office administrator
    if not q1("SELECT id FROM users WHERE email='operations.admin@demo.complianceos.local'"):
        admin.call("POST", "/api/admin/users", {"first_name": "Operations", "last_name": "Admin", "email": "operations.admin@demo.complianceos.local",
                                                "role_slugs": ["admin"]}, what="ops admin")

    section("Employees")
    sample = json.loads((Path(__file__).parent / "fixtures" / "full-employee.json").read_text(encoding="utf-8"))
    counter = 0
    for spec in EMPLOYERS:
        employer_id = state.get(spec["code"])
        if not employer_id:
            continue
        units = db(f"SELECT id FROM company_units WHERE employer_id={employer_id} ORDER BY id")
        departments = db(f"SELECT id, department_name, unit_id FROM departments WHERE employer_id={employer_id} ORDER BY id")
        want = EMPLOYEES_PER_EMPLOYER[spec["code"]]
        have = int(q1(f"SELECT COUNT(*) FROM employees WHERE employer_id={employer_id}", 0))
        for n in range(have, want):
            counter += 1
            female = n % 3 == 1
            first = random.choice(FIRST_F if female else FIRST_M)
            last = random.choice(LAST)
            name = f"{first} {last}"
            department = departments[n % len(departments)]
            designation = random.choice(DESIGNATIONS.get(department[1], ["Operator"]))
            basic = random.choice([11000, 12000, 13500, 15000, 18000, 22000, 28000])
            seq = {"SBT": 100, "KEW": 200, "GFP": 300}[spec["code"]] + n
            email_local = f"{first}.{last}.{seq}".lower()
            employee = {
                **{k: v for k, v in sample.items() if k not in ("nominees", "qualifications", "experience", "dependents", "references", "interview", "checklist")},
                "name": name, "father_name": f"{random.choice(FIRST_M)} {last}", "mother_name": f"{random.choice(FIRST_F)} {last}",
                "spouse_name": None if n % 4 == 0 else f"{random.choice(FIRST_M if female else FIRST_F)} {last}",
                "sex": "Female" if female else "Male", "marital_status": "Single" if n % 4 == 0 else "Married",
                "date_of_birth": iso(-365 * (24 + n * 2) - n * 17),
                "aadhaar_number": f"{random.randint(2, 9)}{random.randint(10**10, 10**11 - 1)}",
                "pan_number": f"{''.join(random.choices('ABCDEFGHJKLMNPRSTUVWXYZ', k=5))}{random.randint(1000, 9999)}{random.choice('ABCDEFGHJKLMNPRSTUVWXYZ')}",
                "mobile": f"+9198{random.randint(10000000, 99999999)}", "email": f"{email_local}@example.com",
                "present_address": f"{random.randint(1, 99)}, {random.choice(['Gandhi', 'Nehru', 'Kamaraj', 'Anna'])} Nagar, {spec['city']}",
                "city": spec["city"], "pincode": spec["pincode"],
                "employer_id": employer_id, "unit_id": int(departments[n % len(departments)][2] or units[0][0]), "department_id": int(department[0]),
                "date_of_joining": iso(-60 - n * 90), "date_of_confirmation": iso(-60 - n * 90 + 180) if n < 6 else None,
                "designation": designation, "department": department[1],
                "basic_salary": basic, "da": round(basic * 0.25), "hra": round(basic * 0.2), "ta": 500, "pa": 300, "ea": 200, "npba": 100,
                "other_allowances": random.choice([0, 400, 600, 900]),
                "pf_number": f"TN/COI/{12000 + seq}/000/{1000 + seq:07d}", "uan": f"1002{random.randint(10**7, 10**8 - 1)}",
                "esi_number": f"3300{random.randint(10**12, 10**13 - 1)}", "mediclaim_number": f"ML2026{seq:06d}",
                "bank_account_number": f"6012{random.randint(10**8, 10**9 - 1)}", "ifsc_code": "IDIB000C123",
                "status": "resigned" if n == want - 1 and want > 6 else "active",
                "nominees": [dict(sample["nominees"][0], nominee_name=f"{random.choice(FIRST_F)} {last}")] if n % 2 == 0 else sample["nominees"],
                "qualifications": sample["qualifications"][: 1 + n % 2],
                "experience": sample["experience"][: 1 + n % 2], "dependents": sample["dependents"][: 1 + n % 3],
                "references": sample["references"][:1], "interview": dict(sample["interview"], interviewer_name="Ramesh Kumar", interview_date=iso(-70 - n * 90)),
                "checklist": sample["checklist"][: 4 + n],
            }
            if n < 5:
                employee.update({"create_login": True, "login_email": f"{email_local}@emp.demo.complianceos.local"})
            result = admin.call("POST", "/api/admin/employees", employee, what=f"employee {name}")
            if result:
                print(f"  + employee {name} -> {result.get('employeeNumber') or result.get('employeeId')}")
    set_passwords()


STAGE_MODULES = {"documents": "stages_ops", "compliance": "stages_ops", "audits": "stages_ops", "forms": "stages_forms", "library": "stages_library",
                 "modules": "stages_more", "payroll": "stages_more", "calendar": "stages_more", "cms": "stages_more", "capar": "stages_capar", "water": "stages_water", "workday": "stages_workday", "billing": "stages_billing", "site": "stages_site", "designations": "stages_designations", "evidence": "stages_evidence"}
ORDER = ["people", "documents", "compliance", "audits", "forms", "modules", "capar", "water", "payroll", "workday", "billing", "site", "designations", "evidence", "calendar", "cms", "library"]


if __name__ == "__main__":
    stages = sys.argv[1:] or ORDER
    set_passwords()
    for name in stages:
        if name == "people":
            stage_people()
        else:
            getattr(importlib.import_module(STAGE_MODULES[name]), f"stage_{name}")()
        set_passwords()
    print("Done.")

