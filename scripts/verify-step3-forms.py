"""Checks the audit types / assessments / risk / study / permit forms added from the client's lists, and the ETP grade.

    python scripts/verify-step3-forms.py      (server on http://127.0.0.1:3001 with `seed-demo.py forms` run)

For every new form: it exists, is published with the right module type, is offered to its auditor types only, can be filled in,
submitted and printed as a PDF. For the ETP form it also checks the Red / Yellow / Green grade the server calculates. Test rows are removed."""
import json
import sys

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db  # noqa: E402
from forms_catalogue import CATALOGUE  # noqa: E402
from forms_catalogue_step3 import STEP3_CATALOGUE  # noqa: E402

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


def sql(text_):
    return text_.replace("'", "''")


auditors = {
    "ENV": login("auditor.test@complianceos.local", "auditor"),
    "WATER": login("karthik.auditor@demo.complianceos.local", "auditor"),
    "FIRE": login("anand.auditor@demo.complianceos.local", "auditor"),
    "GHG": login("meenakshi.auditor@demo.complianceos.local", "auditor"),
    "SAFETY": login("priya.auditor@demo.complianceos.local", "auditor"),
    "FOOD": login("divya.auditor@demo.complianceos.local", "auditor"),
    "ELEC": login("suresh.auditor@demo.complianceos.local", "auditor"),
}
admin = login("demo.admin@complianceos.local", "admin")

print("== modules exist, are published, have the right type")
module_ids = {}
for name, builder, module_type, category, codes in STEP3_CATALOGUE:
    row = db(f"SELECT m.id, m.module_type, m.status, f.id, f.status FROM dynamic_modules m JOIN dynamic_forms f ON f.module_id = m.id WHERE m.name = '{sql(name)}' AND m.deleted_at IS NULL")
    ok = bool(row) and row[0][1] == module_type and row[0][2] == "published" and row[0][4] == "published"
    check(f"{name} is a published {module_type}", ok, str(row))
    if row:
        module_ids[name] = (int(row[0][0]), int(row[0][3]), codes)
hazop = db("SELECT module_type FROM dynamic_modules WHERE name = 'HAZOP Worksheet and Risk Assessment'")
check("HAZOP worksheet is a STUDY", bool(hazop) and hazop[0][0] == "STUDY", str(hazop))

print("== auditor type mapping")
for name, (module_id, form_id, codes) in module_ids.items():
    mapped = {r[0] for r in db(f"SELECT t.code FROM auditor_type_modules atm JOIN auditor_types t ON t.id = atm.auditor_type_id WHERE atm.module_id = {module_id}")}
    check(f"{name} mapped to {sorted(codes)}", mapped == set(codes), str(mapped))
check("auditor types FOOD and ELEC exist", int(db("SELECT COUNT(*) FROM auditor_types WHERE code IN ('FOOD','ELEC') AND deleted_at IS NULL")[0][0]) == 2)

print("== visibility to an auditor of the matching type only")
forms_by_type = {}
for code, session in auditors.items():
    status, body = session.send("GET", "/api/auditor/forms")
    text_ = json.dumps(body)
    forms_by_type[code] = text_
    check(f"{code} auditor can list forms", status == 200, f"{status}")
check("water auditor sees STP assessment", "STP Functionality Assessment" in forms_by_type["WATER"])
check("water auditor does not see Energy Audit", "Energy Audit" not in forms_by_type["WATER"])
check("GHG auditor sees Energy Audit and GHG verification", "Energy Audit" in forms_by_type["GHG"] and "GHG Inventory Verification" in forms_by_type["GHG"])
check("GHG auditor does not see the permits", "Confined Space Entry Permit" not in forms_by_type["GHG"])
check("fire auditor sees Work at Height Permit", "Work at Height Permit" in forms_by_type["FIRE"])
check("env auditor sees TSDF audit and Environmental Statement", "TSDF Audit" in forms_by_type["ENV"] and "Environmental Statement (Form V)" in forms_by_type["ENV"])

print("== fill, submit and print every new form")
db("DELETE FROM dynamic_form_submissions WHERE title LIKE 'ZZ TEST STEP3%'")
owner_for = {}
for name, (module_id, form_id, codes) in module_ids.items():
    session = next(auditors[c] for c in codes if c in auditors)
    started = session.send("POST", "/api/auditor/submissions", {"form_id": form_id, "title": f"ZZ TEST STEP3 {name}"})
    body = started[1] if isinstance(started[1], dict) else {}
    sid = body.get("submissionId") or (body.get("data") or {}).get("submissionId")
    check(f"{name}: start a submission", started[0] in (200, 201) and sid, f"{started[0]} {str(body)[:140]}")
    if not sid:
        continue
    required = db(f"SELECT field_key, field_type, options_json FROM dynamic_form_fields WHERE form_id = {form_id} AND is_required = 1")
    values = {}
    for key, ftype, _ in required:
        if ftype == "checkbox":
            values[key] = True
        elif ftype == "date":
            values[key] = "2026-10-01"
        elif ftype in ("decimal", "number"):
            values[key] = 1
        else:
            values[key] = "ZZ test"
    rows = {}
    for tkey, tid, minrows in db(f"SELECT table_key, id, min_rows FROM dynamic_tables WHERE form_id = {form_id} AND deleted_at IS NULL"):
        if int(minrows) < 1:
            continue
        row = {}
        for ckey, ctype, copts in db(f"SELECT column_key, column_type, options_json FROM dynamic_table_columns WHERE table_id = {tid} AND deleted_at IS NULL"):
            if ctype in ("decimal", "number", "currency"):
                row[ckey] = 2
            elif ctype == "date":
                row[ckey] = "2026-10-01"
            elif ctype == "select":
                row[ckey] = json.loads(copts)[0]["option_key"] if copts else ""
            elif ctype != "formula":
                row[ckey] = "ZZ"
        rows[tkey] = [row]
    saved = session.send("PUT", f"/api/auditor/submissions/{sid}", {"values": values, "table_rows": rows})
    done = session.send("POST", f"/api/auditor/submissions/{sid}/submit", {"send_to_reviewer": True})
    check(f"{name}: saved and submitted", saved[0] == 200 and done[0] in (200, 201), f"{saved[0]} {done[0]} {str(done[1])[:160]}")
    pdf = session.send("GET", f"/api/pdf/submission/{sid}", raw=True)
    check(f"{name}: PDF prints", pdf[0] == 200 and pdf[1][:4] == b"%PDF", f"{pdf[0]}")

print("== ETP grade (Red / Yellow / Green)")
etp_form = int(db("SELECT f.id FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id WHERE m.name = 'ETP Functionality Assessment'")[0][0])
etp = auditors["ENV"]
grade_options = db(f"SELECT o.option_key, o.option_label FROM dynamic_field_options o JOIN dynamic_form_fields f ON f.id = o.field_id WHERE f.form_id = {etp_form} AND f.field_key = 'grade' ORDER BY o.option_key")
check("grade field carries Red / Yellow / Green", [tuple(r) for r in grade_options] == [("1", "Red"), ("2", "Yellow"), ("3", "Green")], str(grade_options))
YES, NO = "yes", "no"
ALL_YES = {k: YES for k in ["d11", "c21", "c22", "k31", "k32", "k33", "k34", "k35"]}
cases = [
    ("everything met is Green", {}, "3", 7),
    ("one competence gap is still Green", {"k33": NO}, "3", 6),
    ("two competence gaps is Yellow", {"k33": NO, "k34": NO}, "2", 5),
    ("design not suited is Red", {"d11": NO}, "1", 7),
    ("not operated at all is Red", {"c21": NO, "c22": NO}, "1", 5),
]
for label, changes, expected, points in cases:
    values = {**ALL_YES, **changes, "facility_audit_name": "ZZ"}
    started = etp.send("POST", "/api/auditor/submissions", {"form_id": etp_form, "title": "ZZ TEST STEP3 ETP"})
    sid = (started[1] or {}).get("submissionId") or ((started[1] or {}).get("data") or {}).get("submissionId")
    if not sid:
        check(label, False, str(started)[:160])
        continue
    etp.send("PUT", f"/api/auditor/submissions/{sid}", {"values": values})
    stored = {k: v for k, v in db(f"SELECT v.field_key, COALESCE(v.value_number, v.value_text) FROM dynamic_form_submission_values v WHERE v.submission_id = {sid}")}
    check(f"ETP: {label}", float(stored.get("grade") or 0) == float(expected) and float(stored.get("points") or -1) == points, f"grade={stored.get('grade')} points={stored.get('points')}")

db("DELETE FROM dynamic_form_submissions WHERE title LIKE 'ZZ TEST STEP3%'")
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
