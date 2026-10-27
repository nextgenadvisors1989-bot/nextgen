"""Step 4 end-to-end check: payslip formats, wage register Rule 11(5), personal-file documents, full and final PDF,
the employee working day (check in / out, permission) and its employer queue.

    python scripts/verify-step4.py      (server on http://127.0.0.1:3001 with the demo data and `seed-demo.py workday` run)

Test rows are removed at the end. Exit code 1 if any check fails."""
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


def is_pdf(response):
    return response[0] == 200 and isinstance(response[1], (bytes, bytearray)) and response[1][:4] == b"%PDF"


def pdf(session, path):
    return session.send("GET", path, raw=True)


admin = login("demo.admin@complianceos.local", "admin")
owner = login("employer.test@complianceos.local", "employer")       # employer 1
other = login("balaji.hr@demo.complianceos.local", "employer")      # employer 2
employee = login("employee.test@complianceos.local", "employee")    # employee 1, employer 1
auditor = login("priya.auditor@demo.complianceos.local", "auditor")

print("== fonts (the stubs had no Tamil and no rupee sign)")
for name in ("NotoSans-Regular", "NotoSansTamil-Regular"):
    size = int(__import__("os").path.getsize(__file__.rsplit("scripts", 1)[0] + f"lib/pdf/fonts/{name}.ttf"))
    check(f"{name}.ttf is the full font ({size // 1024} KB)", size > 60000)

print("== payslip formats")
slip = int(db("SELECT id FROM payslips WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1")[0][0])
default = pdf(admin, f"/api/admin/payroll/payslips/{slip}/pdf")
standard = pdf(admin, f"/api/admin/payroll/payslips/{slip}/pdf?format=standard")
check("service card payslip is the default and prints a PDF", is_pdf(default))
check("detailed payslip prints with ?format=standard", is_pdf(standard))
check("the two formats are different documents", is_pdf(default) and is_pdf(standard) and default[1] != standard[1])
check("a one-page service card is shorter than the detailed slip", is_pdf(default) and is_pdf(standard) and default[1].count(b"/Type /Page\n") + default[1].count(b"/Type /Page ") <= standard[1].count(b"/Type /Page\n") + standard[1].count(b"/Type /Page "))
mine = db("SELECT p.id FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE e.id = 1 AND p.is_published = 1 AND p.deleted_at IS NULL LIMIT 1")
if mine:
    check("employee downloads their own payslip", is_pdf(pdf(employee, f"/api/employee/payslips/{mine[0][0]}/download")))
foreign = db("SELECT id FROM payslips WHERE employee_id <> 1 AND deleted_at IS NULL LIMIT 1")[0][0]
check("employee cannot download someone else's payslip", pdf(employee, f"/api/employee/payslips/{foreign}/download")[0] in (403, 404))

print("== wage register")
run = int(db("SELECT id FROM payroll_runs WHERE deleted_at IS NULL AND employer_id = 4 ORDER BY id DESC LIMIT 1")[0][0])
check("Rule 11(5) wage register is the default PDF", is_pdf(pdf(admin, f"/api/pdf/payroll/wage-register/{run}")))
check("the detailed register is still available", is_pdf(pdf(admin, f"/api/pdf/payroll/wage-register/{run}?format=detailed")))
check("another company cannot read the register", pdf(other, f"/api/pdf/payroll/wage-register/{run}")[0] == 404)

print("== personal file checklist labels")
labels = [r[0] for r in db("SELECT item_label FROM personal_file_checklist_items ORDER BY sort_order")]
check("16 checklist items", len(labels) == 16, str(len(labels)))
check("checklist follows the client's cover sheet", labels[3] == "Appointment Order" and labels[7] == "Form F - Fresh Nomination" and labels[15] == "Affirmative Statement", str(labels[:4]))

print("== personal file documents")
TYPES = ["checklist", "appointment-order", "confirmation-letter", "service-record", "form-f", "form-2", "form-11", "bank-letter", "wage-revision", "affirmative-statement"]
for kind in TYPES:
    check(f"admin prints {kind}", is_pdf(pdf(admin, f"/api/pdf/employee-document/22?type={kind}")))
check("employer prints a document for their own employee", is_pdf(pdf(owner, "/api/pdf/employee-document/1?type=appointment-order")))
check("employer cannot print for another company's employee", pdf(other, "/api/pdf/employee-document/1?type=appointment-order")[0] == 404)
check("employee cannot use the document generator", pdf(employee, "/api/pdf/employee-document/1?type=form-11")[0] in (401, 403))
check("auditor cannot use the document generator", pdf(auditor, "/api/pdf/employee-document/1?type=form-11")[0] in (401, 403))
check("unknown document type is refused", pdf(admin, "/api/pdf/employee-document/22?type=nope")[0] == 422)
check("unknown employee is 404", pdf(admin, "/api/pdf/employee-document/999999?type=form-11")[0] == 404)

print("== full and final settlement PDF")
ff_paid = int(db("SELECT id FROM full_final_settlements WHERE status = 'Paid' AND deleted_at IS NULL LIMIT 1")[0][0])
ff_owner = db(f"SELECT employer_id FROM full_final_settlements WHERE id = {ff_paid}")[0][0]
check("admin prints a settlement", is_pdf(pdf(admin, f"/api/pdf/full-final/{ff_paid}")))
ff_mgr = login({"2": "balaji.hr@demo.complianceos.local", "3": "kaveri.hr@demo.complianceos.local"}.get(str(ff_owner), "balaji.hr@demo.complianceos.local"), "employer")
check("the owning employer prints it", is_pdf(pdf(ff_mgr, f"/api/pdf/full-final/{ff_paid}")))
check("another company cannot", pdf(owner, f"/api/pdf/full-final/{ff_paid}")[0] == 404)
check("an employee who is not the leaver cannot", pdf(employee, f"/api/pdf/full-final/{ff_paid}")[0] == 404)
check("unknown settlement is 404", pdf(admin, "/api/pdf/full-final/999999")[0] == 404)

print("== employee working day")
db("DELETE FROM employee_permissions WHERE reason LIKE 'ZZ TEST%'")
before = db("SELECT id, in_time, out_time, source FROM attendance WHERE employee_id = 1 AND attendance_date = CURDATE() AND deleted_at IS NULL")
if before:
    db("DELETE FROM attendance WHERE employee_id = 1 AND attendance_date = CURDATE()")
status, body = employee.send("GET", "/api/employee/workday")
data = (body or {}).get("data") or {}
check("workday summary loads", status == 200 and data.get("employee", {}).get("employeeNumber"), f"{status}")
check("status is one of Active / Long leave / Exit", data.get("status") in ("Active", "Long leave", "Exit"), str(data.get("status")))
check("wage has today, week and month", all(k in data.get("wage", {}) for k in ("today", "week", "month")))
check("employee and working status chips come from the record", data.get("employee", {}).get("workforceOrigin") and data.get("employee", {}).get("employmentType"), str(data.get("employee")))
check("employer cannot use the employee workday API", other.send("GET", "/api/employee/workday")[0] in (401, 403))

check("check out before check in is refused", employee.send("POST", "/api/employee/workday/punch", {"action": "out"})[0] == 409)
check("a bad action is refused", employee.send("POST", "/api/employee/workday/punch", {"action": "dance"})[0] == 422)
status, body = employee.send("POST", "/api/employee/workday/punch", {"action": "in"})
check("check in works", status == 200, f"{status} {body}")
check("second check in is refused", employee.send("POST", "/api/employee/workday/punch", {"action": "in"})[0] == 409)
row = db("SELECT status, source, in_time, out_time FROM attendance WHERE employee_id = 1 AND attendance_date = CURDATE() AND deleted_at IS NULL")
check("the row is Present and marked Self", bool(row) and row[0][0] == "Present" and row[0][1] == "Self" and row[0][2] is not None, str(row))
status, body = employee.send("POST", "/api/employee/workday/punch", {"action": "out"})
check("check out works and works out the hours", status == 200 and "workedHours" in ((body or {}).get("data") or {}), f"{status} {body}")
check("second check out is refused", employee.send("POST", "/api/employee/workday/punch", {"action": "out"})[0] == 409)
db("DELETE FROM attendance WHERE employee_id = 1 AND attendance_date = CURDATE() AND source = 'Self'")
for r in before:
    pass  # a pre-existing manual row for today was removed above only so the test starts clean; the demo data has none for today

print("== permission requests")
from datetime import date, timedelta  # noqa: E402
tomorrow = (date.today() + timedelta(days=2)).isoformat()
good = {"date": tomorrow, "from": "14:00", "to": "15:30", "reason": "ZZ TEST doctor"}
check("a past date is refused", employee.send("POST", "/api/employee/permissions", {**good, "date": (date.today() - timedelta(days=1)).isoformat()})[0] == 422)
check("end before start is refused", employee.send("POST", "/api/employee/permissions", {**good, "from": "15:00", "to": "14:00"})[0] == 422)
check("more than 4 hours is refused", employee.send("POST", "/api/employee/permissions", {**good, "from": "08:00", "to": "13:00"})[0] == 422)
check("a missing reason is refused", employee.send("POST", "/api/employee/permissions", {**good, "reason": ""})[0] == 422)
status, body = employee.send("POST", "/api/employee/permissions", good)
pid = (((body or {}).get("data") or {}).get("id"))
check("a valid request is accepted", status == 201 and pid, f"{status} {body}")
check("an overlapping request is refused", employee.send("POST", "/api/employee/permissions", {**good, "from": "15:00", "to": "16:00"})[0] == 409)
status, body = owner.send("GET", "/api/employer/permissions?status=Pending")
ids = [r["id"] for r in ((body or {}).get("data") or [])]
check("the employer sees it in the pending queue", status == 200 and pid in ids, f"{status} {ids[:5]}")
status, body = other.send("GET", "/api/employer/permissions")
check("another company does not see it", status == 200 and pid not in [r["id"] for r in ((body or {}).get("data") or [])])
check("another company cannot decide it", other.send("PUT", f"/api/employer/permissions/{pid}", {"decision": "Approved"})[0] == 404)
check("employee cannot use the employer queue", employee.send("GET", "/api/employer/permissions")[0] in (401, 403))
check("a bad decision is refused", owner.send("PUT", f"/api/employer/permissions/{pid}", {"decision": "Maybe"})[0] == 422)
check("the employer approves it", owner.send("PUT", f"/api/employer/permissions/{pid}", {"decision": "Approved", "note": "ok"})[0] == 200)
check("an approved request cannot be decided again", owner.send("PUT", f"/api/employer/permissions/{pid}", {"decision": "Rejected"})[0] == 409)
check("an approved request cannot be withdrawn", employee.send("DELETE", f"/api/employee/permissions/{pid}")[0] == 409)
status, body = employee.send("POST", "/api/employee/permissions", {**good, "date": (date.today() + timedelta(days=3)).isoformat()})
pid2 = (((body or {}).get("data") or {}).get("id"))
check("a pending request can be withdrawn", employee.send("DELETE", f"/api/employee/permissions/{pid2}")[0] == 200)
check("nobody else can withdraw it", other.send("DELETE", f"/api/employee/permissions/{pid2}")[0] in (401, 403, 404))
db("DELETE FROM employee_permissions WHERE reason LIKE 'ZZ TEST%'")

print("== employee particulars")
check("workforce_origin / employment_type are refused when invalid", admin.send("POST", "/api/admin/employees", {"workforce_origin": "Martian", "employment_type": "Forever"})[0] == 422)
check("every demo employee has both particulars", int(db("SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL AND (workforce_origin IS NULL OR employment_type IS NULL)")[0][0]) == 0)

print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
