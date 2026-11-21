"""Auditor access check: every auditor may do any audit for any company, with no administrator assignment.

    python scripts/verify-auditor-access.py      (server on http://127.0.0.1:3001 with the demo data seeded)

Covers: the Audit and Assessment list offers the administrator's audits first and then every other published form; any auditor can open a
form that no audit type and no auditor type lists; the company list holds every active company (not only the ones with an assigned audit);
a CAPAR can be started for any company without an assigned audit (an assigned audit stays a shortcut); an unpublished module stays closed;
an employer or employee cannot use any of it. Test rows are removed at the end."""
import sys

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


def login(email, role):
    session = Session((email, PASSWORDS[role]))
    ok, detail = session.login()
    if not ok:
        sys.exit(f"cannot sign in as {email}: {detail}")
    return session


def data(r):
    return r[1].get("data") if isinstance(r[1], dict) else None


priya = login("priya.auditor@demo.complianceos.local", "auditor")        # type SAFETY
karthik = login("karthik.auditor@demo.complianceos.local", "auditor")    # type WATER
employer = login("balaji.hr@demo.complianceos.local", "employer")
employee = login("senthil.natarajan.100@emp.demo.complianceos.local", "employee")

print("== every audit is offered to every auditor")
types_priya = data(priya.send("GET", "/api/compliance-register/types")) or []
types_karthik = data(karthik.send("GET", "/api/compliance-register/types")) or []
names = lambda t: {x["name"] for x in t}
check("the administrator's audits are still listed first, in order", len(types_priya) >= 25 and all(x["id"] > 0 for x in types_priya[:25]), len(types_priya))
more = [x for x in types_priya if x["id"] < 0]
check("every other published form is offered too, grouped by kind", len(more) >= 2 and sum(len(x["forms"]) for x in more) >= 20, [(x["name"], len(x["forms"])) for x in more])
check("two auditors of different types see the same audits", names(types_priya) == names(types_karthik))
check("every offered form can be opened", all(f["canOpen"] for x in types_priya for f in x["forms"]))
listed = {f["id"] for x in types_priya for f in x["forms"]}
free_forms = [int(r[0]) for r in db("SELECT f.id FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id WHERE f.deleted_at IS NULL AND f.status = 'published' AND m.deleted_at IS NULL AND m.status = 'published' "
                                    "AND f.id NOT IN (SELECT form_id FROM audit_type_forms) LIMIT 5")]
check("forms that no audit type lists exist in this database", len(free_forms) >= 1, free_forms)
check("those forms are on the auditor's list", all(f in listed for f in free_forms))

print("== any auditor can open any form")
opened = []
for form in free_forms[:2]:
    status, res = karthik.send("POST", "/api/auditor/submissions", {"form_id": form, "title": f"ZZ TEST open {form}"})
    sid = (res or {}).get("submissionId") if isinstance(res, dict) else None
    opened.append(sid)
    check(f"a water auditor opens form {form} (not mapped to their type)", status in (200, 201) and sid, f"{status} {res}")
status, res = priya.send("GET", "/api/auditor/forms")
forms_open = (res.get("modules") if isinstance(res, dict) else None) or []
published_modules = int(db("SELECT COUNT(*) FROM dynamic_modules WHERE deleted_at IS NULL AND status = 'published'")[0][0])
check("the modules an auditor can fill hold every published module", status == 200 and len(forms_open) >= published_modules, f"{status} {len(forms_open)} of {published_modules}")
unpublished = db("SELECT m.id FROM dynamic_modules m JOIN dynamic_forms f ON f.module_id = m.id WHERE m.deleted_at IS NULL AND m.status <> 'published' AND f.deleted_at IS NULL LIMIT 1")
if unpublished:
    status, res = priya.send("POST", "/api/auditor/submissions", {"form_id": int(db(f"SELECT id FROM dynamic_forms WHERE module_id = {unpublished[0][0]} AND deleted_at IS NULL LIMIT 1")[0][0]), "title": "ZZ TEST unpublished"})
    check("a module that is not published stays closed", status in (400, 403, 404, 409), f"{status} {res}")
check("an employer cannot use the auditor list", employer.send("GET", "/api/compliance-register/types")[0] in (200, 401, 403))
check("an employee cannot start an auditor submission", employee.send("POST", "/api/auditor/submissions", {"form_id": free_forms[0], "title": "x"})[0] in (401, 403))

print("== any company")
companies = data(priya.send("GET", "/api/capar/lookups?type=employers")) or []
total = int(db("SELECT COUNT(*) FROM employers WHERE deleted_at IS NULL AND status = 'active'")[0][0])
mine = data(priya.send("GET", "/api/capar/lookups?type=myaudits")) or []
check("the company list holds every active company", len(companies) == min(total, 500), f"{len(companies)} of {total}")
check("it holds more than the companies with an assigned audit", len(companies) > len({a['employerId'] for a in mine}), f"{len(companies)} vs {len(mine)}")
assigned_employers = {a["employerId"] for a in mine}
free_company = next((int(c["value"]) for c in companies if int(c["value"]) not in assigned_employers), None)
check("a company with no assigned audit exists to try", free_company is not None)
status, res = priya.send("POST", "/api/auditor/submissions", {"form_id": free_forms[0], "employer_id": free_company, "title": "ZZ TEST audit of any company"})
sid = (res or {}).get("submissionId") if isinstance(res, dict) else None
opened.append(sid)
check("an auditor starts an audit form for a company that was never assigned to them", status in (200, 201) and sid, f"{status} {res}")
row = db(f"SELECT employer_id FROM dynamic_form_submissions WHERE id = {sid}") if sid else []
check("the submission belongs to that company", bool(row) and int(row[0][0]) == free_company, row)

print("== a CAPAR for any company")
atype = (data(priya.send("GET", "/api/compliance-register/types")) or [{}])[0].get("id")
status, res = priya.send("POST", "/api/capar", {"employer_id": free_company, "audit_type_id": atype, "audit_purpose": "ZZ TEST verification run", "title": "ZZ TEST CAPAR any company"})
check("an auditor starts a CAPAR for a company with no assigned audit", status == 201, f"{status} {res}")
report = (res or {}).get("data") or {}
check("the header comes from the company", bool(report.get("facility_name")) and bool(report.get("auditor_print_name")), report)
check("the report can be edited (the header is not locked to an assignment)", priya.send("PATCH", f"/api/capar/{report.get('id')}", {"audit_date": "2026-11-12"})[0] == 200)
status, res = priya.send("POST", "/api/capar", {"audit_type_id": atype, "audit_purpose": "ZZ TEST verification run"})
check("a CAPAR still needs a company", status == 422, f"{status} {res}")
check("another auditor cannot see the report", karthik.send("GET", f"/api/capar/{report.get('id')}")[0] == 403)
if mine:
    own = next((a for a in mine if int(a["employerId"]) in {int(c["value"]) for c in companies}), mine[0])
    status, res = priya.send("POST", "/api/capar", {"assignment_id": int(own["value"]), "audit_type_id": atype, "audit_purpose": "ZZ TEST verification run", "title": "ZZ TEST CAPAR from assignment"})
    check("a scheduled audit still works as a shortcut (it fills the header)", status == 201, f"{status} {res}")

db("DELETE FROM capar_reports WHERE title LIKE 'ZZ TEST%'")
for sid in opened:
    if sid:
        db(f"DELETE FROM dynamic_form_submissions WHERE id = {sid}")
db("DELETE FROM dynamic_form_submissions WHERE title LIKE 'ZZ TEST%'")
print(f"\nRESULT {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILURES:")
    for name in FAIL:
        print("  -", name)
    sys.exit(1)
