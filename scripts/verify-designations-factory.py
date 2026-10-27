"""Designation Master and Factory Profile checks, with every role.

    python scripts/verify-designations-factory.py       (server on http://127.0.0.1:3001, `seed-demo.py designations` run)

Test rows are removed at the end. Exit code 1 if any check fails."""
import sys

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


def login(email, role):
    s = Session((email, PASSWORDS[role]))
    ok, detail = s.login()
    if not ok:
        sys.exit(f"cannot sign in as {email}: {detail}")
    return s


def data(r):
    return (r[1] or {}).get("data") if isinstance(r[1], dict) else None


admin = login("demo.admin@complianceos.local", "admin")
balaji = login("balaji.hr@demo.complianceos.local", "employer")     # employer 2
kaveri = login("kaveri.hr@demo.complianceos.local", "employer")     # employer 3
employee = login("employee.test@complianceos.local", "employee")
auditor = login("priya.auditor@demo.complianceos.local", "auditor")
A, E = "/api/admin/designations", "/api/employer/designations"

db("DELETE FROM employees WHERE name LIKE 'ZZ TEST%'")
db("DELETE FROM designations WHERE designation_name LIKE 'ZZ TEST%'")
db("DELETE FROM employer_factory_profiles WHERE employer_id IN (2, 3)")

print("== the master loaded from the document")
total = int(db("SELECT COUNT(*) FROM designations WHERE employer_id IS NULL AND deleted_at IS NULL")[0][0])
check("the shared master holds about a thousand designations", 990 <= total <= 1100, str(total))
check("it covers ten industries (A to J)", int(db("SELECT COUNT(DISTINCT industry_code) FROM designations")[0][0]) == 10)
check("all seven skill levels are used", int(db("SELECT COUNT(DISTINCT skill_level) FROM designations")[0][0]) == 7)

print("== access")
check("an employee cannot read designations", employee.send("GET", A)[0] in (401, 403))
check("an auditor cannot read designations", auditor.send("GET", A)[0] in (401, 403))
check("an employer cannot use the admin API", balaji.send("GET", A)[0] in (401, 403))
check("an admin on the employer route sees the master read-only, never other companies' rows", admin.send("POST", E, {"designation_name": "ZZ TEST admin via employer"})[0] in (401, 403, 422))

print("== list, search, filters")
status, body = admin.send("GET", f"{A}?limit=10")
check("the admin list is paged", status == 200 and len(body["data"]) == 10 and body["pagination"]["total"] == total, f"{status} {body.get('pagination')}")
check("search finds by name", all("welder" in (r["designation_name"] + str(r["nature_of_work"])).lower() or "weld" in r["designation_name"].lower() for r in admin.send("GET", f"{A}?search=Welder&limit=50")[1]["data"]) and len(admin.send("GET", f"{A}?search=Welder&limit=50")[1]["data"]) >= 1)
check("the industry filter works", all(r["industry_code"] == "D" for r in admin.send("GET", f"{A}?industry=D&limit=100")[1]["data"]))
check("the level filter works", all(r["skill_level"] == "Chief Executive" for r in admin.send("GET", f"{A}?level=Chief%20Executive&limit=100")[1]["data"]))
check("page 2 differs from page 1", admin.send("GET", f"{A}?limit=10&page=2")[1]["data"][0]["id"] != admin.send("GET", f"{A}?limit=10&page=1")[1]["data"][0]["id"])
lookups = data(admin.send("GET", f"{A}/lookups")) or {}
check("lookups list industries, levels, categories", len(lookups.get("industries", [])) == 10 and len(lookups.get("levels", [])) == 7 and len(lookups.get("categories", [])) == 3)
picker = admin.send("GET", f"{A}/picker")[1].get("data", [])
check("the picker returns every active designation", len(picker) >= total and {"id", "name", "level", "department"} <= set(picker[0]))

print("== admin CRUD on the shared master")
check("a name is required", admin.send("POST", A, {"designation_name": ""})[0] == 422)
check("an unknown skill level is refused", admin.send("POST", A, {"designation_name": "ZZ TEST X", "skill_level": "Wizard"})[0] == 422)
check("a negative wage is refused", admin.send("POST", A, {"designation_name": "ZZ TEST X", "wage_basic": -5})[0] == 422)
status, body = admin.send("POST", A, {"designation_name": "ZZ TEST Master Operator", "industry_code": "A", "industry_name": "Garment & Apparel Industry", "department": "Sewing", "skill_level": "Skilled",
                                      "nature_of_work": "Machine work", "statutory_category": "As per notification", "wage_basic": 400, "wage_da": 100, "wage_allowance": 20.5, "wage_ot": 90})
mid = (data((status, body)) or {}).get("id")
check("an administrator adds a designation to the master", status == 201 and mid, f"{status} {body}")
check("a duplicate in the same list is refused", admin.send("POST", A, {"designation_name": "zz test master operator", "industry_code": "A", "industry_name": "Garment & Apparel Industry"})[0] == 409)
row = data(admin.send("GET", f"{A}/{mid}")) or {}
check("line 5 gross is basic + DA + allowances (520.50), overtime excluded", row.get("wage_gross") == 520.5 and row.get("wage_ot") == 90, str(row.get("wage_gross")))
check("it is part of the shared master", row.get("employer_id") is None)
check("it can be edited", admin.send("PUT", f"{A}/{mid}", {"designation_name": "ZZ TEST Master Operator", "industry_code": "A", "industry_name": "Garment & Apparel Industry", "skill_level": "Supervisory", "wage_basic": 450})[0] == 200)
check("the edit shows", (data(admin.send("GET", f"{A}/{mid}")) or {}).get("skill_level") == "Supervisory")

print("== employer sees the master and its own additions")
bl = balaji.send("GET", f"{E}?limit=5")
check("an employer sees the shared master", bl[0] == 200 and bl[1]["pagination"]["total"] >= total)
check("an employer cannot edit a master row", balaji.send("PUT", f"{E}/{mid}", {"designation_name": "ZZ TEST hacked"})[0] == 403)
check("an employer cannot delete a master row", balaji.send("DELETE", f"{E}/{mid}")[0] == 403)
status, body = balaji.send("POST", E, {"designation_name": "ZZ TEST Balaji Own", "department": "Weaving", "skill_level": "Skilled", "employer_id": 3})
bid = (data((status, body)) or {}).get("id")
check("an employer adds its own designation", status == 201 and bid, f"{status} {body}")
check("it is forced to the employer's own company, whatever the request said", db(f"SELECT employer_id FROM designations WHERE id = {bid}")[0][0] == "2")
check("another company cannot see it", all(r["designation_name"] != "ZZ TEST Balaji Own" for r in kaveri.send("GET", f"{E}?search=ZZ%20TEST&limit=50")[1]["data"]))
check("another company cannot read it by id", kaveri.send("GET", f"{E}/{bid}")[0] == 404)
check("another company cannot edit it", kaveri.send("PUT", f"{E}/{bid}", {"designation_name": "ZZ TEST stolen"})[0] == 404)
check("the owner edits it", balaji.send("PUT", f"{E}/{bid}", {"designation_name": "ZZ TEST Balaji Own", "skill_level": "Semi-skilled"})[0] == 200)
check("the admin sees company rows with the company name", any(r["designation_name"] == "ZZ TEST Balaji Own" and r["employer_name"] for r in admin.send("GET", f"{A}?search=ZZ%20TEST&limit=50")[1]["data"]))
check("the employer's picker has the master and its own", any(p["id"] == bid for p in balaji.send("GET", f"{E}/picker")[1]["data"]) and any(p["id"] == mid for p in balaji.send("GET", f"{E}/picker")[1]["data"]))
check("another company's picker does not have it", not any(p["id"] == bid for p in kaveri.send("GET", f"{E}/picker")[1]["data"]))

print("== employee form uses a designation")
emp = {"employer_id": 2, "name": "ZZ TEST Linked Employee", "date_of_joining": "2026-09-01", "designation_id": bid}
status, body = balaji.send("POST", "/api/employer/employees", emp)
eid = (data((status, body)) or {}).get("employeeId") or (data((status, body)) or {}).get("id") or (body or {}).get("employeeId")
check("an employee can be created with a designation_id", status in (200, 201) and eid, f"{status} {str(body)[:250]}")
if eid:
    r = db(f"SELECT designation, designation_id, skill_grade FROM employees WHERE id = {eid}")[0]
    check("the name and skill grade follow the designation", r[0] == "ZZ TEST Balaji Own" and r[1] == str(bid) and r[2] == "Semi-skilled", str(r))
    check("a designation in use cannot be deleted", balaji.send("DELETE", f"{E}/{bid}")[0] == 409)
    balaji.send("PUT", f"{E}/{bid}", {"designation_name": "ZZ TEST Balaji Renamed", "skill_level": "Semi-skilled"})
    check("renaming updates the employees that use it", db(f"SELECT designation FROM employees WHERE id = {eid}")[0][0] == "ZZ TEST Balaji Renamed")
    check("an unknown designation_id is refused", balaji.send("POST", "/api/employer/employees", {**emp, "name": "ZZ TEST Bad Link", "designation_id": 99999999})[0] == 422)
    check("a master designation can be used by any employer", balaji.send("POST", "/api/employer/employees", {**emp, "name": "ZZ TEST Master Link", "designation_id": mid})[0] in (200, 201))
    check("another company's own designation cannot be used", kaveri.send("POST", "/api/employer/employees", {**emp, "employer_id": 3, "name": "ZZ TEST Foreign Link", "designation_id": bid})[0] == 422)
    check("a designation with employees can be made inactive", balaji.send("PUT", f"{E}/{bid}", {"designation_name": "ZZ TEST Balaji Renamed", "status": "inactive"})[0] == 200)
    check("an inactive designation cannot be chosen for a new employee", balaji.send("POST", "/api/employer/employees", {**emp, "name": "ZZ TEST Inactive Link", "designation_id": bid})[0] == 422)
    db("DELETE FROM employees WHERE name LIKE 'ZZ TEST%'")
check("an unused designation can be deleted", balaji.send("DELETE", f"{E}/{bid}")[0] == 200)
check("a deleted designation is gone", balaji.send("GET", f"{E}/{bid}")[0] == 404)
check("the admin deletes the master row", admin.send("DELETE", f"{A}/{mid}")[0] == 200)

print("== factory profile")
F = "/api/employer/factory-profile"
status, body = balaji.send("GET", F)
d = data((status, body)) or {}
check("an employer reads its profile (empty to start with)", status == 200 and d.get("exists") is False and d.get("employer", {}).get("id") == 2, f"{status}")
good = {"occupiers": "Mr. A (Managing Director)", "factory_licence_no": "TPR - 11546", "year_of_establishment": "1998-11-25", "msme_status": "Medium", "manpower_onroll": 1200, "manpower_male": 700, "manpower_female": 500,
        "working_hours": "Morning 8.30 AM to 5.30 PM", "weekly_holiday": "Sunday", "constructed_area_sqm": 1764.96, "connected_hp": 726.53, "boiler_capacity": "500 Kg", "boiler_pressure": "10 Bar",
        "units": [{"name": "Blooms Burg", "established": "2005-02-04"}], "departments": [{"name": "Cutting"}, {"name": "Sewing"}], "holidays": [{"name": "Pongal", "date": "2026-01-14"}],
        "areas": [{"name": "Production hall", "sqm": 11235.15}], "welfare": [{"name": "Canteen", "value": "808.70 sq.m", "note": "Section 46"}],
        "treatment": [{"kind": "STP", "capacity": "70 KLD", "compliance": "CPCB and TNPCB"}], "migrant": [{"state": "Odisha", "count": 120}]}
check("an invalid MSME status is refused", balaji.send("PUT", F, {**good, "msme_status": "Giant"})[0] == 422)
check("a bad holiday date is refused", balaji.send("PUT", F, {**good, "holidays": [{"name": "X", "date": "tomorrow"}]})[0] == 422)
check("a negative area is refused", balaji.send("PUT", F, {**good, "constructed_area_sqm": -1})[0] == 422)
check("an unknown treatment plant kind is refused", balaji.send("PUT", F, {**good, "treatment": [{"kind": "Magic"}]})[0] == 422)
status, body = balaji.send("PUT", F, good)
check("the employer saves its profile", status == 200, f"{status} {str(body)[:200]}")
p = (data(balaji.send("GET", F)) or {}).get("profile", {})
check("scalars come back as saved", p.get("factory_licence_no") == "TPR - 11546" and p.get("manpower_onroll") == 1200 and p.get("constructed_area_sqm") == 1764.96 and str(p.get("year_of_establishment"))[:10] == "1998-11-25", str({k: p.get(k) for k in ("factory_licence_no", "manpower_onroll", "year_of_establishment")}))
check("lists come back as saved", len(p.get("departments", [])) == 2 and p["units"][0]["name"] == "Blooms Burg" and p["treatment"][0]["kind"] == "STP" and p["migrant"][0]["count"] == 120)
check("saving again replaces the lists", balaji.send("PUT", F, {**good, "departments": [{"name": "Only one"}]})[0] == 200 and len((data(balaji.send("GET", F)) or {})["profile"]["departments"]) == 1)
check("the admin reads that company's profile", (data(admin.send("GET", "/api/admin/employers/2/factory-profile")) or {}).get("profile", {}).get("factory_licence_no") == "TPR - 11546")
check("the admin updates another company's profile", admin.send("PUT", "/api/admin/employers/3/factory-profile", {"factory_licence_no": "KEW-77", "manpower_onroll": 80})[0] == 200)
check("the other employer sees its own profile, not Balaji's", (data(kaveri.send("GET", F)) or {}).get("profile", {}).get("factory_licence_no") == "KEW-77")
check("an employee cannot read a factory profile", employee.send("GET", F)[0] in (401, 403))
check("an auditor cannot read a factory profile", auditor.send("GET", "/api/admin/employers/2/factory-profile")[0] in (401, 403))
check("an employer cannot use the admin route", balaji.send("GET", "/api/admin/employers/3/factory-profile")[0] in (401, 403))
check("an unknown company is 404", admin.send("GET", "/api/admin/employers/999999/factory-profile")[0] == 404)

db("DELETE FROM employees WHERE name LIKE 'ZZ TEST%'")
db("DELETE FROM designations WHERE designation_name LIKE 'ZZ TEST%'")
db("DELETE FROM employer_factory_profiles WHERE employer_id IN (2, 3)")
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
